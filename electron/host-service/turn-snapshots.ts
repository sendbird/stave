import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rename, rm, rmdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
import type { SqliteStore } from "../persistence/sqlite-store";
import type { TurnSnapshotRow } from "../persistence/turn-snapshot-store";
import type { TurnSnapshotOwner, TurnSnapshotRestore, TurnSnapshotResult, TurnSnapshotList } from "../../src/lib/turn-snapshots";
import { workspaceExecutionGate } from "../shared/workspace-execution-gate";

/** Well-known id of git's empty tree; reading attributes from it disables every content filter. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** Worktrees Stave creates inside the default checkout belong to their own workspaces. */
const EXCLUDED_ROOT = ".stave/workspaces";
const CAPTURE_TIMEOUT_MS = 20_000;
const MODE_LINE = "stave-modes: ";

export interface TurnSnapshotPorts {
  /** True when a terminal in one of these workspaces is running something other than an idle shell. */
  hasRunningTerminal?: (workspaceIds: string[]) => boolean;
  /** Tests force the capture path used by git versions without `--attr-source`. */
  captureMode?: "auto" | "manual";
  captureTimeoutMs?: number;
}

class ObstructedError extends Error {}

const locks = new Map<string, Promise<unknown>>();
async function serialized<T>(cwd: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(cwd) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  locks.set(cwd, next);
  try {
    return await next;
  }
  finally {
    if (locks.get(cwd) === next) locks.delete(cwd);
  }
}

function gitEnv(extra: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("GIT_")) env[key] = value;
  return { ...env, GIT_TERMINAL_PROMPT: "0", ...extra };
}

interface RunResult { code: number; stdout: Buffer; stderr: string }
function run(cwd: string, args: string[], options: { env?: NodeJS.ProcessEnv; input?: string | Buffer } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: gitEnv(options.env) });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() }));
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}
async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv, input?: string | Buffer): Promise<string> {
  const result = await run(cwd, args, { env, input });
  if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout.toString();
}

type Modes = Record<string, string>;
interface Entry { mode: string; hash: string }
interface FileState { tree: string; indexTree: string; modes: Modes; entries: Map<string, Entry> }

const defaultPermission = (mode: string) => mode === "100755" ? 0o755 : 0o644;
const isExcluded = (file: string) => file === EXCLUDED_ROOT || file.startsWith(`${EXCLUDED_ROOT}/`);
const fingerprint = (value: { tree: string; indexTree: string; modes: Modes }) => `${value.tree}:${value.indexTree}:${JSON.stringify(value.modes)}`;

async function lstatOrNull(file: string) {
  return lstat(file).catch(() => null);
}

async function treeEntries(cwd: string, tree: string) {
  const entries = new Map<string, Entry>();
  for (const line of (await git(cwd, ["ls-tree", "-r", "-z", "--full-tree", tree])).split("\0")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    const [mode, , hash] = line.slice(0, tab).split(" ");
    entries.set(line.slice(tab + 1), { mode: mode!, hash: hash! });
  }
  return entries;
}

/** Git trees record only 644/755, so other permission bits (such as 0600) are kept beside them. */
async function permissionModes(cwd: string, entries: Map<string, Entry>): Promise<Modes> {
  const files = [...entries].filter(([, entry]) => entry.mode === "100644" || entry.mode === "100755");
  const modes: Modes = {};
  for (let offset = 0; offset < files.length; offset += 256) {
    await Promise.all(files.slice(offset, offset + 256).map(async ([file, entry]) => {
      const stat = await lstatOrNull(path.join(cwd, file));
      if (!stat?.isFile()) return;
      const permission = stat.mode & 0o777;
      if (permission !== defaultPermission(entry.mode)) modes[file] = permission.toString(8);
    }));
  }
  return Object.fromEntries(Object.entries(modes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

/** The staged state, written from a copy so the real index is never locked or changed. */
async function stagedTree(cwd: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "stave-turn-index-"));
  try {
    const index = path.join(dir, "index");
    const original = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
    await copyFile(original, index).catch(() => {});
    const env = { GIT_INDEX_FILE: index };
    const written = await run(cwd, ["write-tree"], { env });
    if (written.code === 0) return written.stdout.toString().trim();
    // An unmerged index has no tree; the working files are still recorded.
    if ((await git(cwd, ["ls-files", "-u", "-z"], env)).length) return "";
    throw new Error(`git write-tree failed: ${written.stderr.trim()}`);
  }
  finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ADD_CONFIG = ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.fileMode=true", "-c", "core.fsmonitor=false", "-c", "advice.addEmbeddedRepo=false"];

/**
 * Record the working tree with a private index kept under the git directory.
 * Its stat cache survives between turns, so unchanged files are not hashed
 * again. Attributes are read from the empty tree so files are stored as their
 * raw bytes (no line-ending or LFS conversion); the real index is untouched.
 */
async function workingTreeWithPrivateIndex(cwd: string): Promise<string | null> {
  const index = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "stave/turn-snapshot-index"])).trim();
  await mkdir(path.dirname(index), { recursive: true });
  const env = { GIT_INDEX_FILE: index };
  const excludes = [`:(exclude,literal)${EXCLUDED_ROOT}`];
  for (let attempt = 0; ; attempt++) {
    const added = await run(cwd, [...ADD_CONFIG, `--attr-source=${EMPTY_TREE}`, "add", "-A", "--", ".", ...excludes], { env });
    if (added.code === 0) break;
    if (/attr-source/.test(added.stderr) && /unknown option|usage/i.test(added.stderr)) return null;
    // A nested repository without a commit has nothing to link; leave it out.
    const empty = [...added.stderr.matchAll(/error: '(.+?)\/?' does not have a commit checked out/g)].map(match => match[1]!);
    if (!empty.length || attempt >= 32) throw new Error(`git add failed: ${added.stderr.trim()}`);
    excludes.push(...empty.map(file => `:(exclude,literal)${file}`));
  }
  // Tracked files that match an ignore rule are still part of the checkout;
  // a file that became ignored after an earlier capture is not.
  const forced = (await git(cwd, ["ls-files", "-z", "-c", "-i", "--exclude-standard"])).split("\0")
    .filter(file => file && !isExcluded(file));
  const tracked = new Set(forced);
  const stale = (await git(cwd, ["ls-files", "-z", "-c", "-i", "--exclude-standard"], env)).split("\0").filter(file => file && !tracked.has(file));
  if (stale.length) await git(cwd, ["rm", "--cached", "-q", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"], env, stale.join("\0"));
  const present = (await Promise.all(forced.map(async file => (await lstatOrNull(path.join(cwd, file)))?.isDirectory() === false ? file : null))).filter(Boolean) as string[];
  if (present.length) await git(cwd, [...ADD_CONFIG, `--attr-source=${EMPTY_TREE}`, "add", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"], env, present.join("\0"));
  return (await git(cwd, ["write-tree"], env)).trim();
}

/** Capture for git versions without `--attr-source`: hash each file's raw bytes. */
async function workingTreeManually(cwd: string): Promise<string> {
  const files = [...new Set((await git(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean))]
    .map(file => file.replace(/\/$/, "")).filter(file => !isExcluded(file));
  const items: Array<{ file: string; mode: string; hash?: string }> = [];
  for (const file of files) {
    const parts = file.split("/");
    let linked = false;
    for (let i = 1; i < parts.length && !linked; i++) linked = Boolean((await lstatOrNull(path.join(cwd, ...parts.slice(0, i))))?.isSymbolicLink());
    if (linked) continue;
    const stat = await lstatOrNull(path.join(cwd, file));
    if (!stat) continue;
    if (stat.isDirectory()) {
      // Submodules and nested repositories are recorded as links to their checked-out commit.
      const head = await run(path.join(cwd, file), ["rev-parse", "--verify", "-q", "HEAD"]);
      if (head.code === 0 && (await lstatOrNull(path.join(cwd, file, ".git")))) items.push({ file, mode: "160000", hash: head.stdout.toString().trim() });
      continue;
    }
    items.push({ file, mode: stat.isSymbolicLink() ? "120000" : stat.mode & 0o111 ? "100755" : "100644" });
  }
  const regular = items.filter(item => item.mode === "100644" || item.mode === "100755");
  if (regular.length) {
    const hashes = (await git(cwd, ["hash-object", "-w", "--no-filters", "--stdin-paths"], undefined, regular.map(item => item.file).join("\n") + "\n")).trim().split("\n");
    regular.forEach((item, index) => { item.hash = hashes[index]; });
  }
  for (const item of items.filter(item => item.mode === "120000"))
    item.hash = (await git(cwd, ["hash-object", "-w", "--stdin"], undefined, Buffer.from(await readlink(path.join(cwd, item.file))))).trim();
  const dir = await mkdtemp(path.join(tmpdir(), "stave-turn-index-"));
  try {
    const env = { GIT_INDEX_FILE: path.join(dir, "index") };
    await git(cwd, ["read-tree", "--empty"], env);
    if (items.length) await git(cwd, ["update-index", "-z", "--index-info"], env, items.map(item => `${item.mode} ${item.hash}\t${item.file}\0`).join(""));
    return (await git(cwd, ["write-tree"], env)).trim();
  }
  finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function captureState(cwd: string, mode: "auto" | "manual"): Promise<FileState> {
  const indexTree = await stagedTree(cwd);
  const tree = (mode === "auto" ? await workingTreeWithPrivateIndex(cwd) : null) ?? await workingTreeManually(cwd);
  const entries = await treeEntries(cwd, tree);
  return { tree, indexTree, modes: await permissionModes(cwd, entries), entries };
}

async function readSnapshot(cwd: string, snapshotId: string): Promise<{ tree: string; modes: Modes }> {
  const body = await git(cwd, ["cat-file", "commit", snapshotId]);
  const tree = /^tree ([0-9a-f]+)$/m.exec(body)?.[1];
  if (!tree) throw new Error("Snapshot commit has no tree.");
  const line = body.split("\n").find(entry => entry.startsWith(MODE_LINE));
  let modes: Modes = {};
  if (line) {
    try { modes = JSON.parse(line.slice(MODE_LINE.length)) as Modes; }
    catch { modes = {}; }
  }
  return { tree, modes };
}

interface Change { oldMode: string; newMode: string; newHash: string; status: string; file: string }
async function diffTrees(cwd: string, from: string, to: string): Promise<Change[]> {
  const parts = (await git(cwd, ["diff-tree", "-r", "-z", "--no-renames", "--raw", from, to])).split("\0");
  const changes: Change[] = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    const meta = parts[i]!;
    if (!meta.startsWith(":")) continue;
    const [oldMode, newMode, , newHash, status] = meta.slice(1).split(" ");
    changes.push({ oldMode: oldMode!, newMode: newMode!, newHash: newHash!, status: status!.charAt(0), file: parts[++i]! });
  }
  return changes;
}

async function listFiles(root: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await listFiles(root, rel));
    else out.push(rel);
  }
  return out;
}

interface RestorePlan {
  deletes: string[];
  writes: Array<{ file: string; mode: string; hash: string; permission: number }>;
  chmods: Array<{ file: string; permission: number }>;
  emptiedDirectories: string[];
  indexTree: string;
  currentIndexTree: string;
}

/** Every check happens here, before the first write. */
async function planRestore(cwd: string, current: FileState, target: { snapshotId: string; indexTree: string }): Promise<RestorePlan> {
  const indexLock = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index.lock"])).trim();
  if (await lstatOrNull(indexLock)) throw new ObstructedError("The git index is locked by another git process.");
  const snapshot = await readSnapshot(cwd, target.snapshotId);
  const changes = await diffTrees(cwd, current.tree, snapshot.tree);
  const deletes = new Set<string>();
  const writes: RestorePlan["writes"] = [];
  const touched = new Set<string>();
  const permissionFor = (file: string, mode: string) => snapshot.modes[file] ? Number.parseInt(snapshot.modes[file]!, 8) : defaultPermission(mode);
  for (const change of changes) {
    const gitlink = change.oldMode === "160000" || change.newMode === "160000";
    touched.add(change.file);
    if (gitlink) {
      // Nested repositories are never rewritten; only a file in their place blocks the restore.
      if (change.status === "T") throw new ObstructedError(`A nested repository and a file share the path ${change.file}.`);
      continue;
    }
    if (change.status === "D") deletes.add(change.file);
    else writes.push({ file: change.file, mode: change.newMode, hash: change.newHash, permission: permissionFor(change.file, change.newMode) });
  }
  const emptiedDirectories: string[] = [];
  for (const write of writes) {
    const parts = write.file.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      const stat = await lstatOrNull(path.join(cwd, parent));
      if (!stat) break;
      if (stat.isDirectory()) continue;
      if (deletes.has(parent)) break;
      throw new ObstructedError(`${stat.isSymbolicLink() ? "A symbolic link" : "A file"} at ${parent} is in the way.`);
    }
    const stat = await lstatOrNull(path.join(cwd, write.file));
    if (!stat) continue;
    if (stat.isDirectory()) {
      const inside = await listFiles(cwd, write.file);
      const blocking = inside.find(file => !deletes.has(file));
      if (blocking) throw new ObstructedError(`${blocking} is in the way of ${write.file}.`);
      emptiedDirectories.push(write.file);
    }
    else if (!current.entries.has(write.file)) {
      throw new ObstructedError(`An ignored file at ${write.file} is in the way.`);
    }
  }
  const chmods: RestorePlan["chmods"] = [];
  for (const file of new Set([...Object.keys(snapshot.modes), ...Object.keys(current.modes)])) {
    if (touched.has(file)) continue;
    const entry = current.entries.get(file);
    if (!entry || (entry.mode !== "100644" && entry.mode !== "100755")) continue;
    const wanted = permissionFor(file, entry.mode);
    const now = current.modes[file] ? Number.parseInt(current.modes[file]!, 8) : defaultPermission(entry.mode);
    if (wanted !== now) chmods.push({ file, permission: wanted });
  }
  return { deletes: [...deletes], writes, chmods, emptiedDirectories, indexTree: target.indexTree, currentIndexTree: current.indexTree };
}

async function writeBlob(cwd: string, target: string, item: RestorePlan["writes"][number]) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.stave-restore-${randomUUID()}`);
  try {
    if (item.mode === "120000") {
      await symlink(await git(cwd, ["cat-file", "blob", item.hash]), temporary);
    }
    else {
      // Stream the blob so its size never has to fit in memory.
      const child = spawn("git", ["cat-file", "blob", item.hash], { cwd, env: gitEnv(), stdio: ["ignore", "pipe", "pipe"] });
      const stderr: Buffer[] = [];
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      const exited = new Promise<number>((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve(code ?? 1)); });
      await pipeline(child.stdout, createWriteStream(temporary, { mode: 0o600 }));
      if (await exited !== 0) throw new Error(`git cat-file failed: ${Buffer.concat(stderr).toString().trim()}`);
      await chmod(temporary, item.permission);
    }
    await rename(temporary, target);
  }
  catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function pruneEmptyParents(cwd: string, file: string) {
  let dir = path.dirname(file);
  while (dir && dir !== ".") {
    try { await rmdir(path.join(cwd, dir)); }
    catch { return; }
    dir = path.dirname(dir);
  }
}

/** Apply only the differences between the current state and the snapshot. */
async function applyRestore(cwd: string, plan: RestorePlan) {
  for (const file of [...plan.deletes].sort((a, b) => b.split("/").length - a.split("/").length)) {
    await rm(path.join(cwd, file), { force: true });
    await pruneEmptyParents(cwd, file);
  }
  for (const dir of plan.emptiedDirectories) await rm(path.join(cwd, dir), { recursive: true, force: true });
  for (const item of plan.writes) {
    const target = path.join(cwd, item.file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeBlob(cwd, target, item);
  }
  for (const item of plan.chmods) await chmod(path.join(cwd, item.file), item.permission);
  if (plan.indexTree && plan.indexTree !== plan.currentIndexTree) {
    // A one-tree merge keeps the stat cache for entries whose content matches.
    const merged = await run(cwd, ["read-tree", "-m", plan.indexTree]);
    if (merged.code !== 0) await git(cwd, ["read-tree", plan.indexTree]);
  }
}

const AUTHOR = { GIT_AUTHOR_NAME: "Stave", GIT_AUTHOR_EMAIL: "stave@localhost.invalid", GIT_COMMITTER_NAME: "Stave", GIT_COMMITTER_EMAIL: "stave@localhost.invalid" };
async function commitState(cwd: string, state: FileState, message: string) {
  const parents: string[] = [];
  if (state.indexTree) parents.push("-p", (await git(cwd, ["commit-tree", "--no-gpg-sign", state.indexTree, "-m", "Staged file state"], AUTHOR)).trim());
  const body = `${message}\n\n${MODE_LINE}${JSON.stringify(state.modes)}\n`;
  return (await git(cwd, ["commit-tree", "--no-gpg-sign", state.tree, ...parents, "-F", "-"], AUTHOR, body)).trim();
}

const taskKey = (owner: TurnSnapshotOwner) => createHash("sha256").update(`${owner.workspaceId}:${owner.taskId}`).digest("hex");

export class TurnSnapshotService {
  private ports: TurnSnapshotPorts;
  constructor(private store: SqliteStore, private limit = 50, ports: TurnSnapshotPorts = {}) {
    this.limit = Math.max(1, Math.min(500, Math.floor(limit) || 50));
    this.ports = ports;
  }

  private get captureMode() { return this.ports.captureMode ?? "auto"; }

  private async toplevel(folder: string) {
    const result = await run(folder, ["rev-parse", "--show-toplevel"]);
    if (result.code !== 0) return null;
    return realpath(result.stdout.toString().trim());
  }

  private workspacePath(workspaceId: string) {
    const repo = this.store.loadRepositoryRegistry().find(r => r.workspaces.some(w => w.id === workspaceId));
    return repo ? repo.workspacePathById?.[workspaceId] ?? repo.repositoryPath : null;
  }

  /** Restore, undo and list act only for a saved task of a registered workspace. */
  private async cwd(owner: TurnSnapshotOwner) {
    const folder = this.workspacePath(owner.workspaceId);
    if (!folder || !this.store.listWorkspaceTasks({ workspaceId: owner.workspaceId }).some(t => t.id === owner.taskId))
      throw new Error("Task workspace ownership is unavailable.");
    const resolved = await realpath(folder);
    return (await this.toplevel(resolved)) ?? resolved;
  }

  async list(owner: TurnSnapshotOwner): Promise<TurnSnapshotList> {
    await this.cwd(owner);
    return {
      snapshots: this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).map(({ turnId, snapshotId, createdAt }) => ({ turnId, snapshotId, createdAt })),
      skipped: this.store.turnSnapshots.skipped(owner.workspaceId, owner.taskId),
      canUndo: !!this.store.turnSnapshots.backup(owner.workspaceId, owner.taskId),
    };
  }

  private async record(owner: TurnSnapshotOwner, turnId: string, cwd: string): Promise<TurnSnapshotRow | undefined> {
    const existing = this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).find(s => s.turnId === turnId);
    if (existing) return existing;
    const current = await captureState(cwd, this.captureMode);
    const last = this.store.turnSnapshots.list(owner.workspaceId, owner.taskId)[0];
    let snapshotId = "";
    if (last && last.indexTree === current.indexTree) {
      const previous = await readSnapshot(cwd, last.snapshotId).catch(() => null);
      if (previous && previous.tree === current.tree && JSON.stringify(previous.modes) === JSON.stringify(current.modes)) snapshotId = last.snapshotId;
    }
    // Repeated unchanged turns share one object; bounded turn references also bound the catalog.
    snapshotId ||= await commitState(cwd, current, "Turn file state");
    const gitDir = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    const ref = `refs/stave/turns/${taskKey(owner)}/${createHash("sha256").update(turnId).digest("hex")}`;
    await git(cwd, ["update-ref", ref, snapshotId]);
    const row: TurnSnapshotRow = { ...owner, turnId, snapshotId, indexTree: current.indexTree, createdAt: new Date().toISOString(), cwd, gitDir, ref };
    this.store.turnSnapshots.put(row);
    for (const old of this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).slice(this.limit)) {
      await git(cwd, ["update-ref", "-d", old.ref]);
      this.store.turnSnapshots.remove(old);
    }
    this.store.turnSnapshots.pruneSkipped(owner.workspaceId, owner.taskId, this.limit);
    return row;
  }

  /**
   * Best effort: a failure is logged and recorded as "no snapshot for this
   * turn" with a reason, and the turn always continues.
   */
  async capture(owner: TurnSnapshotOwner, turnId: string): Promise<TurnSnapshotRow | undefined> {
    let cwd = "";
    const skip = (reason: "captureFailed" | "workspaceUnavailable", error?: unknown) => {
      if (error) console.warn("[turn-snapshots] no snapshot for this turn", { reason, error: String(error) });
      try { this.store.turnSnapshots.putSkipped({ ...owner, turnId, reason, cwd }); }
      catch { /* The turn continues without a record. */ }
      return undefined;
    };
    try {
      if (this.store.turnSnapshots.taskDeleted(owner.workspaceId, owner.taskId)) return undefined;
      const folder = this.workspacePath(owner.workspaceId);
      const resolved = folder ? await realpath(folder).catch(() => null) : null;
      if (!resolved) return skip("workspaceUnavailable");
      const root = await this.toplevel(resolved);
      if (!root) return undefined;
      cwd = root;
      const work = serialized(root, () => this.record(owner, turnId, root));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), this.ports.captureTimeoutMs ?? CAPTURE_TIMEOUT_MS); });
      try {
        const result = await Promise.race([work, timeout]);
        if (result === "timeout") {
          // A slow capture keeps running and replaces this marker if it finishes.
          work.catch(error => console.warn("[turn-snapshots] late capture failed", { error: String(error) }));
          return skip("captureFailed", new Error("Capture exceeded its time budget."));
        }
        return result;
      }
      finally { clearTimeout(timer); }
    }
    catch (error) {
      return skip("captureFailed", error);
    }
  }

  private async shared(cwd: string) {
    const workspaces = this.store.loadRepositoryRegistry().flatMap(repo => repo.workspaces.map(workspace => ({ workspaceId: workspace.id, cwd: repo.workspacePathById?.[workspace.id] ?? repo.repositoryPath })));
    return (await Promise.all(workspaces.map(async workspace => ({ ...workspace, cwd: await realpath(workspace.cwd).catch(() => path.resolve(workspace.cwd)) })))).filter(workspace => workspace.cwd === cwd);
  }

  private async refusal(owner: TurnSnapshotOwner, cwd: string): Promise<TurnSnapshotResult | null> {
    const active = this.store.listActiveTurnsForWorkspace({ workspaceId: owner.workspaceId, limit: 500 });
    if (active.some(t => t.taskId === owner.taskId)) return { ok: false, reason: "runningTask" };
    const shared = await this.shared(cwd);
    if (shared.some(workspace => this.store.listActiveTurnsForWorkspace({ workspaceId: workspace.workspaceId, limit: 500 }).some(turn => turn.taskId !== owner.taskId)))
      return { ok: false, reason: "sharedWorktree" };
    // Only this checkout counts: a worktree nested under the default checkout is another workspace.
    if (active.length || workspaceExecutionGate.isBusy({ workspaceId: owner.workspaceId, workspacePath: cwd }))
      return { ok: false, reason: "sharedWorktree" };
    const ids = [...new Set([owner.workspaceId, ...shared.map(workspace => workspace.workspaceId)])];
    if (this.ports.hasRunningTerminal?.(ids)) return { ok: false, reason: "terminalRunning" };
    return null;
  }

  /** Keep the state before a restore for one undo, outside the turn list and its limit. */
  private async saveBackupState(owner: TurnSnapshotOwner, cwd: string, state: FileState): Promise<TurnSnapshotRow> {
    const snapshotId = await commitState(cwd, state, "File state before restore");
    const gitDir = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    const ref = `refs/stave/backups/${taskKey(owner)}`;
    await git(cwd, ["update-ref", ref, snapshotId]);
    return { ...owner, turnId: "", snapshotId, indexTree: state.indexTree, createdAt: new Date().toISOString(), cwd, gitDir, ref };
  }

  private async withStoppedWorkspace(owner: TurnSnapshotOwner, cwd: string, work: () => Promise<TurnSnapshotResult>): Promise<TurnSnapshotResult> {
    let entered = false;
    try {
      let result: TurnSnapshotResult = { ok: true };
      await workspaceExecutionGate.stop({ workspaceId: owner.workspaceId, workspacePath: cwd }, async () => {
        entered = true;
        result = await work();
      });
      return result;
    }
    catch (error) {
      if (error instanceof ObstructedError) return { ok: false, reason: "obstructed", detail: error.message };
      return { ok: false, reason: entered ? "unavailable" : "sharedWorktree", detail: String(error) };
    }
    finally {
      if (entered) workspaceExecutionGate.resume(owner.workspaceId);
    }
  }

  async restore(owner: TurnSnapshotRestore): Promise<TurnSnapshotResult> {
    let cwd: string;
    try {
      cwd = await this.cwd(owner);
    }
    catch {
      return { ok: false, reason: "unavailable" };
    }
    return serialized(cwd, async () => {
      const refused = await this.refusal(owner, cwd);
      if (refused) return refused;
      const target = this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).find(s => s.turnId === owner.turnId);
      if (!target) return { ok: false, reason: "missingSnapshot" };
      // A later task admission marks file ownership as uncertain, even when it is now idle.
      if (this.store.turnSnapshots.forPath(cwd).some(s => s.taskId !== owner.taskId && s.createdAt >= target.createdAt))
        return { ok: false, reason: "otherTaskChanges" };
      for (const shared of await this.shared(cwd))
        if (this.store.listLatestTurnsForWorkspace({ workspaceId: shared.workspaceId, limit: 500 }).some(turn => turn.taskId !== owner.taskId && (turn.completedAt ?? turn.createdAt) >= target.createdAt))
          return { ok: false, reason: "otherTaskChanges" };
      return this.withStoppedWorkspace(owner, cwd, async () => {
        const current = await captureState(cwd, this.captureMode);
        const plan = await planRestore(cwd, current, target);
        const before = await this.saveBackupState(owner, cwd, current);
        let result: TurnSnapshotResult = { ok: true };
        try {
          await applyRestore(cwd, plan);
        }
        catch (error) {
          result = { ok: false, reason: "unavailable", detail: String(error) };
        }
        // Even a failed disk write leaves a reachable backup and an undo for the observed partial state.
        const after = fingerprint(await captureState(cwd, this.captureMode));
        this.store.turnSnapshots.saveBackup({ before, after });
        return result;
      });
    });
  }

  async undo(owner: TurnSnapshotOwner): Promise<TurnSnapshotResult> {
    let cwd: string;
    try {
      cwd = await this.cwd(owner);
    }
    catch {
      return { ok: false, reason: "unavailable" };
    }
    return serialized(cwd, async () => {
      const refused = await this.refusal(owner, cwd);
      if (refused) return refused;
      const backup = this.store.turnSnapshots.backup(owner.workspaceId, owner.taskId);
      if (!backup) return { ok: false, reason: "missingSnapshot" };
      const result = await this.withStoppedWorkspace(owner, cwd, async () => {
        const current = await captureState(cwd, this.captureMode);
        if (fingerprint(current) !== backup.after) return { ok: false, reason: "otherTaskChanges" };
        await applyRestore(cwd, await planRestore(cwd, current, backup.before));
        return { ok: true };
      });
      if (result.ok) {
        await git(cwd, ["update-ref", "-d", backup.before.ref]).catch(() => "");
        this.store.turnSnapshots.removeBackup(owner.workspaceId, owner.taskId);
      }
      return result;
    });
  }
}

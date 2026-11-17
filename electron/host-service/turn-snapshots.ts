import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, copyFile, rm, realpath, lstat, readlink, mkdir, writeFile, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { SqliteStore } from "../persistence/sqlite-store";
import type { TurnSnapshotRow } from "../persistence/turn-snapshot-store";
import type { TurnSnapshotOwner, TurnSnapshotRestore, TurnSnapshotResult } from "../../src/lib/turn-snapshots";
import { workspaceExecutionGate } from "../shared/workspace-execution-gate";
const exec = promisify(execFile);
const locks = new Map<string, Promise<unknown>>();
async function serialized<T>(cwd: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(cwd) ?? Promise.resolve();
  const next = previous.catch(() => {
  }).then(work);
  locks.set(cwd, next);
  try {
    return await next;
  }
  finally {
    if (locks.get(cwd) === next)
      locks.delete(cwd);
  }
}
async function git(cwd: string, args: string[], extra: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_"))
      delete env[key];
  const result = await exec("git", args, { cwd, env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...extra }, maxBuffer: 64 * 1024 * 1024 });
  return result.stdout;
}
async function state(cwd: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "stave-turn-index-"));
  const index = path.join(dir, "index");
  const env = { GIT_INDEX_FILE: index };
  try {
    const original = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
    await copyFile(original, index).catch(() => {
    });
    const indexTree = (await git(cwd, ["write-tree"], env)).trim();
    const files = [...new Set((await git(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean))];
    await git(cwd, ["read-tree", "--empty"], env);
    const cache: Array<{
      file: string;
      mode: string;
      hash?: string;
    }> = [];
    for (const file of files) {
      const parts = file.split("/");
      let linked = false;
      for (let i = 1; i < parts.length; i++)
        if ((await lstat(path.join(cwd, ...parts.slice(0, i))).catch(() => null))?.isSymbolicLink()) {
          linked = true;
          break;
        }
      if (linked)
        continue;
      const stat = await lstat(path.join(cwd, file)).catch(() => null);
      if (!stat)
        continue;
      if (stat.isDirectory())
        throw new Error("Nested repository files cannot be snapshotted safely.");
      cache.push({ file, mode: stat.isSymbolicLink() ? "120000" : stat.mode & 0o111 ? "100755" : "100644" });
    }
    const regular = cache.filter(item => item.mode !== "120000");
    for (let offset = 0; offset < regular.length; offset += 100) {
      const batch = regular.slice(offset, offset + 100);
      const hashes = (await git(cwd, ["hash-object", "-w", "--no-filters", "--", ...batch.map(item => item.file)])).trim().split("\n");
      batch.forEach((item, index) => {
        item.hash = hashes[index];
      });
    }
    for (const item of cache.filter(item => item.mode === "120000"))
      item.hash = (await rawGit(cwd, ["hash-object", "-w", "--stdin"], Buffer.from(await readlink(path.join(cwd, item.file))))).toString().trim();
    if (cache.length)
      await rawGit(cwd, ["update-index", "-z", "--index-info"], Buffer.from(cache.map(item => `${item.mode} ${item.hash}\t${item.file}\0`).join("")), env);
    return { tree: (await git(cwd, ["write-tree"], env)).trim(), indexTree };
  }
  finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function rawGit(cwd: string, args: string[], input?: Buffer, extra: NodeJS.ProcessEnv = {}): Promise<Buffer> {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_"))
      delete env[key];
  return new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd, env: { ...env, ...extra }, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }, (error, stdout) => error ? reject(error) : resolve(stdout));
    if (input)
      child.stdin!.end(input);
  });
}
const fingerprint = (value: {
  tree: string;
  indexTree: string;
}) => `${value.tree}:${value.indexTree}`;
export class TurnSnapshotService {
  constructor(private store: SqliteStore, private limit = 50) {
    this.limit = Math.max(1, Math.min(500, Math.floor(limit) || 50));
  }
  private async cwd(owner: TurnSnapshotOwner) {
    const repo = this.store.loadRepositoryRegistry().find(r => r.workspaces.some(w => w.id === owner.workspaceId));
    if (!repo || !this.store.listWorkspaceTasks({ workspaceId: owner.workspaceId }).some(t => t.id === owner.taskId))
      throw new Error("Task workspace ownership is unavailable.");
    return realpath(repo.workspacePathById?.[owner.workspaceId] ?? repo.repositoryPath);
  }
  async list(owner: TurnSnapshotOwner) {
    await this.cwd(owner);
    return { snapshots: this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).map(({ turnId, snapshotId, createdAt }) => ({ turnId, snapshotId, createdAt })), canUndo: !!this.store.turnSnapshots.undo(owner.workspaceId, owner.taskId) };
  }
  private async record(owner: TurnSnapshotOwner, turnId: string, cwd: string): Promise<TurnSnapshotRow> {
    const existing = this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).find(s => s.turnId === turnId);
    if (existing)
      return existing;
    const current = await state(cwd);
    const rows = this.store.turnSnapshots.list(owner.workspaceId, owner.taskId);
    const last = rows[0];
    let snapshotId = last?.snapshotId;
    if (!last || last.indexTree !== current.indexTree || (await git(cwd, ["rev-parse", `${last.snapshotId}^{tree}`])).trim() !== current.tree) {
      const env = { GIT_AUTHOR_NAME: "Stave", GIT_AUTHOR_EMAIL: "stave@localhost.invalid", GIT_COMMITTER_NAME: "Stave", GIT_COMMITTER_EMAIL: "stave@localhost.invalid" };
      const indexCommit = (await git(cwd, ["commit-tree", "--no-gpg-sign", current.indexTree, "-m", "Staged file state"], env)).trim();
      snapshotId = (await git(cwd, ["commit-tree", "--no-gpg-sign", current.tree, "-p", indexCommit, "-m", "Turn file state"], env)).trim();
    }
    const task = createHash("sha256").update(`${owner.workspaceId}:${owner.taskId}`).digest("hex");
    const ref = `refs/stave/turns/${task}/${createHash("sha256").update(turnId).digest("hex")}`;
    await git(cwd, ["update-ref", ref, snapshotId!]);
    const row = { ...owner, turnId, snapshotId: snapshotId!, indexTree: current.indexTree, createdAt: new Date().toISOString(), cwd, ref };
    this.store.turnSnapshots.put(row);
    // Repeated unchanged turns share one object; bounded turn references also bound the catalog.
    for (const old of this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).slice(this.limit)) {
      await git(cwd, ["update-ref", "-d", old.ref]);
      this.store.turnSnapshots.remove(old);
    }
    return row;
  }
  async capture(owner: TurnSnapshotOwner, turnId: string) {
    const cwd = await this.cwd(owner);
    if (!await git(cwd, ["rev-parse", "--is-inside-work-tree"]).then(value => value.trim() === "true", () => false))
      return undefined;
    return serialized(cwd, () => this.record(owner, turnId, cwd));
  }
  private async shared(cwd: string) {
    const workspaces = this.store.loadRepositoryRegistry().flatMap(repo => repo.workspaces.map(workspace => ({ workspaceId: workspace.id, cwd: repo.workspacePathById?.[workspace.id] ?? repo.repositoryPath })));
    return (await Promise.all(workspaces.map(async (workspace) => ({ ...workspace, cwd: await realpath(workspace.cwd).catch(() => path.resolve(workspace.cwd)) })))).filter(workspace => workspace.cwd === cwd);
  }
  private async refusal(owner: TurnSnapshotOwner, cwd: string): Promise<TurnSnapshotResult | null> {
    const active = this.store.listActiveTurnsForWorkspace({ workspaceId: owner.workspaceId, limit: 500 });
    if (active.some(t => t.taskId === owner.taskId))
      return { ok: false, reason: "runningTask" };
    const shared = (await this.shared(cwd));
    if (shared.some(workspace => this.store.listActiveTurnsForWorkspace({ workspaceId: workspace.workspaceId, limit: 500 }).some(turn => turn.taskId !== owner.taskId)))
      return { ok: false, reason: "sharedWorktree" };
    if (active.length || workspaceExecutionGate.isBusy({ workspaceId: owner.workspaceId, workspacePath: cwd }))
      return { ok: false, reason: "sharedWorktree" };
    return null;
  }
  private async apply(cwd: string, row: TurnSnapshotRow) {
    const current = await state(cwd);
    const entries = async (tree: string) => (await git(cwd, ["ls-tree", "-r", "-z", tree])).split("\0").filter(Boolean).map(entry => {
      const tab = entry.indexOf("\t");
      const [mode, , hash] = entry.slice(0, tab).split(" ");
      return { mode: mode!, hash: hash!, file: entry.slice(tab + 1) };
    });
    const before = await entries(current.tree);
    const after = await entries(row.snapshotId);
    const old = new Set(before.map(e => e.file));
    const wanted = new Set(after.map(e => e.file));
    for (const item of after) {
      if (item.mode === "160000")
        throw new Error("Nested repository files cannot be restored safely.");
      const parts = item.file.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const file = parts.slice(0, i).join("/");
        const st = await lstat(path.join(cwd, file)).catch(() => null);
        if (st?.isSymbolicLink() && i < parts.length)
          throw new Error("A symbolic link obstructs restoration.");
      }
      const st = await lstat(path.join(cwd, item.file)).catch(() => null);
      if (st && !old.has(item.file))
        throw new Error("An ignored file obstructs restoration.");
    }
    // Preflight every obstruction before the first write; only snapshot-owned files are removed.
    for (const item of before)
      if (!wanted.has(item.file))
        await rm(path.join(cwd, item.file), { force: true });
    for (const item of after) {
      const target = path.join(cwd, item.file);
      await mkdir(path.dirname(target), { recursive: true });
      const bytes = await rawGit(cwd, ["cat-file", "blob", item.hash]);
      await rm(target, { force: true });
      if (item.mode === "120000")
        await symlink(bytes.toString(), target);
      else {
        await writeFile(target, bytes);
        await chmod(target, item.mode === "100755" ? 0o755 : 0o644);
      }
    }
    await git(cwd, ["read-tree", row.indexTree]);
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
      if (refused)
        return refused;
      const target = this.store.turnSnapshots.list(owner.workspaceId, owner.taskId).find(s => s.turnId === owner.turnId);
      if (!target)
        return { ok: false, reason: "missingSnapshot" };
      // A later task admission marks file ownership as uncertain, even when it is now idle.
      const other = this.store.turnSnapshots.forPath(cwd).find(s => s.taskId !== owner.taskId && s.createdAt >= target.createdAt);
      if (other)
        return { ok: false, reason: "otherTaskChanges" };
      for (const shared of await this.shared(cwd))
        if (this.store.listLatestTurnsForWorkspace({ workspaceId: shared.workspaceId, limit: 500 }).some(turn => turn.taskId !== owner.taskId && (turn.completedAt ?? turn.createdAt) >= target.createdAt))
          return { ok: false, reason: "otherTaskChanges" };
      let result: TurnSnapshotResult = { ok: true };
      let entered = false;
      try {
        await workspaceExecutionGate.stop({ workspaceId: owner.workspaceId, workspacePath: cwd }, async () => {
          entered = true;
          const before = await this.record(owner, `restore-${randomUUID()}`, cwd);
          const previousUndo = this.store.turnSnapshots.undo(owner.workspaceId, owner.taskId);
          await git(cwd, ["update-ref", `${before.ref}-undo`, before.snapshotId]);
          if (previousUndo)
            await git(cwd, ["update-ref", "-d", `${previousUndo.before.ref}-undo`]);
          try {
            await this.apply(cwd, target);
          }
          catch (error) {
            result = { ok: false, reason: "unavailable", detail: String(error) };
          }
          // Even a failed disk write leaves a reachable backup and an undo for the observed partial state.
          const after = fingerprint(await state(cwd));
          this.store.turnSnapshots.saveUndo(owner.workspaceId, owner.taskId, { before, after });
        });
      }
      catch (error) {
        result = { ok: false, reason: entered ? "unavailable" : "sharedWorktree", detail: String(error) };
      }
      finally {
        if (entered)
          workspaceExecutionGate.resume(owner.workspaceId);
      }
      return result;
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
      if (refused)
        return refused;
      const undo = this.store.turnSnapshots.undo(owner.workspaceId, owner.taskId);
      if (!undo)
        return { ok: false, reason: "missingSnapshot" };
      if (fingerprint(await state(cwd)) !== undo.after)
        return { ok: false, reason: "otherTaskChanges" };
      let entered = false;
      try {
        await workspaceExecutionGate.stop({ workspaceId: owner.workspaceId, workspacePath: cwd }, async () => {
          entered = true;
          await this.apply(cwd, undo.before);
        });
      }
      catch (error) {
        return { ok: false, reason: entered ? "unavailable" : "sharedWorktree", detail: String(error) };
      }
      finally {
        if (entered)
          workspaceExecutionGate.resume(owner.workspaceId);
      }
      await git(cwd, ["update-ref", "-d", `${undo.before.ref}-undo`]);
      this.store.turnSnapshots.saveUndo(owner.workspaceId, owner.taskId, null);
      return { ok: true };
    });
  }
}

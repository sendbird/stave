import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, lstat, readlink, mkdir, symlink, chmod, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

async function git(cwd: string, args: string[], index?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => execFile("git", args, {
    cwd, env: { ...process.env, ...(index ? { GIT_INDEX_FILE: index } : {}) },
    encoding: "buffer", maxBuffer: 256 * 1024 * 1024,
  }, (error, stdout) => error ? reject(new Error("savedChangesGitFailed")) : resolve(stdout)));
}
async function gitInput(cwd: string, args: string[], input: Buffer, index?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd, env: { ...process.env, ...(index ? { GIT_INDEX_FILE: index } : {}) }, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
      (error, stdout) => error ? reject(new Error("savedChangesGitFailed")) : resolve(stdout));
    child.stdin!.on("error", () => {});
    child.stdin!.end(input);
  });
}
async function writeBlob(cwd: string, blob: string, destination: string) {
  const child = spawn("git", ["cat-file", "blob", blob], { cwd, stdio: ["ignore", "pipe", "ignore"] });
  try {
    await Promise.all([
      pipeline(child.stdout, createWriteStream(destination)),
      new Promise<void>((resolve, reject) => { child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new Error("savedChangesGitFailed"))); }),
    ]);
  } catch { child.kill(); throw new Error("savedChangesGitFailed"); }
}
const text = async (cwd: string, args: string[], index?: string) => (await git(cwd, args, index)).toString().trim();
const identity = ["-c", "user.name=Archive", "-c", "user.email=archive@localhost", "-c", "commit.gpgsign=false"];
const validRef = (ref: string) => /^refs\/stave\/archives\/[a-f0-9-]{36}$/.test(ref);

async function workingTree(cwd: string, index: string) {
  await git(cwd, ["read-tree", "HEAD"], index);
  await git(cwd, ["add", "-A", "--", "."], index);
  // Store working bytes without attribute filters, independently of the staged tree.
  const entries = (await git(cwd, ["ls-files", "--stage", "-z"], index)).toString().split("\0").filter(Boolean).map(entry => ({ mode: entry.slice(0, 6), path: entry.slice(entry.indexOf("\t") + 1) }));
  if (entries.some(entry => entry.mode === "160000")) throw new Error("savedChangesSubmoduleUnsupported");
  const updates: string[] = [];
  const regular = entries.filter(entry => entry.mode !== "120000");
  for (let offset = 0; offset < regular.length; offset += 128) {
    const batch = regular.slice(offset, offset + 128);
    const blobs = (await text(cwd, ["hash-object", "-w", "--no-filters", "--", ...batch.map(entry => entry.path)])).split("\n");
    batch.forEach((entry, index) => updates.push(`${entry.mode} ${blobs[index]}\t${entry.path}\0`));
  }
  for (const entry of entries.filter(entry => entry.mode === "120000")) {
    const bytes = Buffer.from(await readlink(join(cwd, entry.path)));
    const blob = (await gitInput(cwd, ["hash-object", "-w", "--stdin", "--no-filters"], bytes)).toString().trim();
    updates.push(`${entry.mode} ${blob}\t${entry.path}\0`);
  }
  if (updates.length) await gitInput(cwd, ["update-index", "-z", "--index-info"], Buffer.from(updates.join("")), index);
  return text(cwd, ["write-tree"], index);
}

/** Two parents retain the original HEAD and the exact staged tree; the tip retains working bytes. */
export async function saveWorkspaceChanges(cwd: string): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "archive-index-"));
  try {
    const base = await text(cwd, ["rev-parse", "HEAD"]);
    const staged = await text(cwd, ["write-tree"]);
    const working = await workingTree(cwd, join(temporary, "index"));
    const stagedCommit = await text(cwd, [...identity, "commit-tree", staged, "-p", base, "-m", "chore: archive staged changes"]);
    const commit = await text(cwd, [...identity, "commit-tree", working, "-p", base, "-p", stagedCommit, "-m", "chore: archive working changes"]);
    const ref = `refs/stave/archives/${randomUUID()}`;
    await git(cwd, ["update-ref", ref, commit, "0000000000000000000000000000000000000000"]);
    if (await text(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]) !== commit) throw new Error("savedChangesVerificationFailed");
    return ref;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function clearSavedWorkspaceChanges(cwd: string, ref: string, beforeClear: () => void) {
  if (!validRef(ref)) throw new Error("savedChangesInvalidRef");
  const temporary = await mkdtemp(join(tmpdir(), "archive-check-"));
  try {
    if (await text(cwd, ["rev-parse", "HEAD"]) !== await text(cwd, ["rev-parse", `${ref}^1`]) ||
      await text(cwd, ["write-tree"]) !== await text(cwd, ["rev-parse", `${ref}^2^{tree}`]) ||
      await workingTree(cwd, join(temporary, "index")) !== await text(cwd, ["rev-parse", `${ref}^{tree}`])) throw new Error("savedChangesChangedDuringSave");
    beforeClear();
    await git(cwd, ["read-tree", "--reset", ref]);
    await git(cwd, ["read-tree", "--reset", "-u", `${ref}^1`]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/** Called only for a newly created checkout or to roll back our own failed removal. */
export async function applySavedWorkspaceChanges(cwd: string, ref: string) {
  if (!validRef(ref)) throw new Error("savedChangesInvalidRef");
  if (await text(cwd, ["rev-parse", "HEAD"]) !== await text(cwd, ["rev-parse", `${ref}^1`])) throw new Error("savedChangesRestoreConflict");
  const before = new Map<string, string>();
  for (const entry of (await git(cwd, ["ls-files", "-z"])).toString().split("\0").filter(Boolean)) before.set(entry, entry);
  const entries = (await git(cwd, ["ls-tree", "-r", "-z", ref])).toString().split("\0").filter(Boolean).map(entry => {
    const tab = entry.indexOf("\t");
    const [mode, , blob] = entry.slice(0, tab).split(" ");
    return { mode: mode!, blob: blob!, path: entry.slice(tab + 1) };
  });
  for (const entry of entries) {
    const file = join(cwd, entry.path);
    let existing = false;
    try { await lstat(file); existing = true; } catch { /* Missing destination. */ }
    if (existing && !before.has(entry.path)) throw new Error("savedChangesRestoreConflict");
  }
  // Git handles tracked deletions and directory/file transitions; raw writes avoid filters.
  await git(cwd, ["read-tree", "--reset", "-u", ref]);
  for (const entry of entries) {
    const file = join(cwd, entry.path);
    await mkdir(dirname(file), { recursive: true });
    if (entry.mode === "120000") {
      await unlink(file);
      await symlink((await git(cwd, ["cat-file", "blob", entry.blob])).toString(), file);
    } else {
      await writeBlob(cwd, entry.blob, file);
      await chmod(file, entry.mode === "100755" ? 0o755 : 0o644);
    }
  }
  await git(cwd, ["read-tree", "--reset", `${ref}^2`]);
}

export async function deleteSavedWorkspaceChanges(cwd: string, ref: string) {
  if (!validRef(ref)) throw new Error("savedChangesInvalidRef");
  await git(cwd, ["update-ref", "-d", ref]);
}

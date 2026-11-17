import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function git(cwd: string, args: string[], index?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => execFile("git", args, {
    cwd, env: { ...process.env, ...(index ? { GIT_INDEX_FILE: index } : {}) },
    encoding: "buffer", maxBuffer: 256 * 1024 * 1024,
  }, (error, stdout) => error ? reject(new Error("savedChangesGitFailed")) : resolve(stdout)));
}
const text = async (cwd: string, args: string[], index?: string) => (await git(cwd, args, index)).toString().trim();
const entries = async (cwd: string, args: string[], index?: string) => (await git(cwd, args, index)).toString().split("\0").filter(Boolean);
const identity = ["-c", "user.name=Archive", "-c", "user.email=archive@localhost", "-c", "commit.gpgsign=false"];
const validRef = (ref: string) => /^refs\/stave\/archives\/[a-f0-9-]{36}$/.test(ref);

/** A saved ref plus the temporary index that captured it; dispose on every path. */
export interface SavedWorkspaceChanges {
  ref: string;
  index: string;
  dispose: () => Promise<void>;
}

/** Copy the worktree index so its stat cache spares unchanged files from rehashing. */
async function temporaryIndex(cwd: string, directory: string) {
  const index = join(directory, "index");
  const source = await text(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  let modified: Date;
  try { modified = (await stat(source)).mtime; }
  catch {
    await git(cwd, ["read-tree", "HEAD"], index);
    return index;
  }
  await copyFile(source, index);
  // Git re-checks entries not older than the index file; an earlier copy time keeps racy entries racy.
  const earlier = new Date(modified.getTime() - 1000);
  await utimes(index, earlier, earlier);
  return index;
}

/** Git applies clean filters and records symlinks and modes; only stat-changed files are rehashed. */
async function workingTree(cwd: string, index: string) {
  await git(cwd, ["add", "-A", "--", "."], index);
  if ((await entries(cwd, ["ls-files", "--stage", "-z"], index)).some(entry => entry.startsWith("160000 "))) throw new Error("savedChangesSubmoduleUnsupported");
  return text(cwd, ["write-tree"], index);
}

/** Two parents retain the original HEAD and the exact staged tree; the tip retains the working tree. */
export async function saveWorkspaceChanges(cwd: string): Promise<SavedWorkspaceChanges> {
  const directory = await mkdtemp(join(tmpdir(), "archive-index-"));
  const dispose = () => rm(directory, { recursive: true, force: true });
  try {
    const index = await temporaryIndex(cwd, directory);
    const base = await text(cwd, ["rev-parse", "HEAD"]);
    const staged = await text(cwd, ["write-tree"]);
    const working = await workingTree(cwd, index);
    const stagedCommit = await text(cwd, [...identity, "commit-tree", staged, "-p", base, "-m", "chore: archive staged changes"]);
    const commit = await text(cwd, [...identity, "commit-tree", working, "-p", base, "-p", stagedCommit, "-m", "chore: archive working changes"]);
    const ref = `refs/stave/archives/${randomUUID()}`;
    await git(cwd, ["update-ref", ref, commit, "0000000000000000000000000000000000000000"]);
    if (await text(cwd, ["rev-parse", "--verify", `${ref}^{tree}`]) !== working || await text(cwd, ["rev-parse", "--verify", `${ref}^2^{tree}`]) !== staged) {
      await git(cwd, ["update-ref", "-d", ref, commit]).catch(() => {});
      throw new Error("savedChangesVerificationFailed");
    }
    return { ref, index, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function clearSavedWorkspaceChanges(cwd: string, saved: SavedWorkspaceChanges, beforeClear: () => void) {
  const { ref, index } = saved;
  if (!validRef(ref)) throw new Error("savedChangesInvalidRef");
  // The capture index is reused, so only files whose stat changed since capture are rehashed.
  if (await text(cwd, ["rev-parse", "HEAD"]) !== await text(cwd, ["rev-parse", `${ref}^1`]) ||
    await text(cwd, ["write-tree"]) !== await text(cwd, ["rev-parse", `${ref}^2^{tree}`]) ||
    await workingTree(cwd, index) !== await text(cwd, ["rev-parse", `${ref}^{tree}`])) throw new Error("savedChangesChangedDuringSave");
  beforeClear();
  await git(cwd, ["read-tree", "--reset", ref]);
  await git(cwd, ["read-tree", "--reset", "-u", `${ref}^1`]);
}

/** Called only for a newly created checkout or to roll back our own failed removal. */
export async function applySavedWorkspaceChanges(cwd: string, ref: string) {
  if (!validRef(ref)) throw new Error("savedChangesInvalidRef");
  if (await text(cwd, ["rev-parse", "HEAD"]) !== await text(cwd, ["rev-parse", `${ref}^1`])) throw new Error("savedChangesRestoreConflict");
  const tracked = new Set(await entries(cwd, ["ls-files", "-z"]));
  for (const path of await entries(cwd, ["ls-tree", "-r", "-z", "--name-only", ref])) {
    if (tracked.has(path)) continue;
    try { await lstat(join(cwd, path)); } catch { continue; }
    throw new Error("savedChangesRestoreConflict");
  }
  // Checkout applies smudge filters, symlinks and modes; the second read restores the exact staged index.
  await git(cwd, ["read-tree", "--reset", "-u", ref]);
  await git(cwd, ["read-tree", "--reset", `${ref}^2`]);
}

export async function deleteSavedWorkspaceChanges(cwd: string, ref: string) {
  if (!validRef(ref)) throw new Error("savedChangesInvalidRef");
  await git(cwd, ["update-ref", "-d", ref]);
}

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import type { TarsWorkingChanges } from "../../src/lib/tars/types";

const execFileAsync = promisify(execFile);

/** Only used when Git has no identity configured, so the snapshot never fails for that alone. */
const FALLBACK_IDENTITY = {
  GIT_AUTHOR_NAME: "Stave", GIT_AUTHOR_EMAIL: "stave@localhost.invalid",
  GIT_COMMITTER_NAME: "Stave", GIT_COMMITTER_EMAIL: "stave@localhost.invalid",
};

/**
 * Git variables a parent process could have set (a hook, a terminal inside
 * another repository). Inherited, they would point these commands at another
 * index, repository or work tree.
 */
const SCRUBBED_GIT_ENV = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR", "GIT_NAMESPACE"];

async function git(cwd: string, args: readonly string[], env: Record<string, string> = {}): Promise<string> {
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const name of SCRUBBED_GIT_ENV) delete base[name];
  const { stdout } = await execFileAsync("git", [...args], {
    cwd, env: { ...base, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...env }, maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function resolveCommit(cwd: string, rev: string): Promise<string | null> {
  try { return (await git(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`])).trim() || null; }
  catch { return null; }
}

/**
 * The ref that keeps one message's snapshot of one workspace reachable until
 * its work no longer needs it. A message is snapshotted once per target
 * workspace, so every unit it admits there starts from the same tree, and a
 * retried admission finds the ref and reuses that commit.
 */
export function tarsWorkingChangesRef(messageId: string, workspaceId: string): string {
  const message = messageId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "message";
  const workspace = createHash("sha256").update(workspaceId).digest("hex").slice(0, 16);
  return `refs/stave/tars/${message}/${workspace}`;
}

/** Marks that a message's snapshot of a workspace found nothing to include. */
export function tarsCleanMarkerRef(ref: string): string {
  return `${ref}-clean`;
}

/**
 * Drops a message's snapshot ref and clean marker once no work needs them:
 * a workspace created from the snapshot keeps the commit reachable through
 * its own branch. Missing refs are fine.
 */
export async function releaseTarsWorkingChangesRef(repositoryPath: string, ref: string): Promise<void> {
  for (const name of [ref, tarsCleanMarkerRef(ref)]) {
    if (await resolveCommit(repositoryPath, name)) await git(repositoryPath, ["update-ref", "-d", name]);
  }
}

/** The checkout a registered workspace lives in: its worktree, or the repository itself for the default workspace. */
export function tarsWorkspacePath(workspaceId: string, repositories: readonly PersistenceRepositoryRegistryEntry[]): string {
  const repository = repositories.find((entry) => entry.workspaces.some((workspace) => workspace.id === workspaceId));
  if (!repository) throw new Error("The target workspace is missing from the registered repositories.");
  const workspacePath = repository.workspacePathById?.[workspaceId] ?? repository.repositoryPath;
  if (!path.isAbsolute(workspacePath)) throw new Error("The target workspace has no absolute path.");
  return workspacePath;
}

/** Git's date for a timestamp, in its internal `@<seconds> <offset>` form. */
function gitDate(iso: string): string {
  const millis = Date.parse(iso);
  return `@${Math.floor((Number.isFinite(millis) ? millis : Date.now()) / 1000)} +0000`;
}

/**
 * Everything in the work tree except Stave's own `.stave` folder, which holds
 * other workspaces' worktrees (each would become an embedded repository) and
 * Stave's context files, not the user's changes. Repositories that do not
 * ignore it would otherwise put them in every snapshot.
 */
const ADD_ALL = ["add", "--all", "--", ":/", ":(top,exclude).stave"];

const MISSING_IDENTITY = /tell me who you are|unable to auto-detect email|empty ident|no email was given|name consists only of disallowed/i;

/**
 * Snapshots a workspace's working tree as a commit on top of its HEAD,
 * without touching the user's index or files: a temporary index (seeded from
 * a copy of the workspace's own, so unchanged files are not hashed again)
 * takes `git add --all` (respecting `.gitignore`, and leaving out Stave's own
 * `.stave` folder), then `git write-tree`
 * and `git commit-tree`. The commit is kept reachable by `ref`; when `ref`
 * already exists (a retried admission), its commit is returned unchanged.
 * A tree equal to HEAD's is `clean` and records no commit.
 */
export async function snapshotTarsWorkingChanges(args: {
  workspacePath: string;
  ref: string;
  /** The commit message; model-facing text never goes here. */
  message: string;
  /** The commit's author and committer time. */
  date: string;
}): Promise<TarsWorkingChanges> {
  const cwd = args.workspacePath;
  const existing = await resolveCommit(cwd, args.ref);
  if (existing) return { kind: "snapshot", commit: existing, ref: args.ref };
  // A clean result is pinned too, so a retried admission does not pick up changes made since.
  if (await resolveCommit(cwd, tarsCleanMarkerRef(args.ref))) return { kind: "clean" };
  const head = await resolveCommit(cwd, "HEAD");
  const directory = await mkdtemp(path.join(os.tmpdir(), "stave-tars-index-"));
  try {
    const index = path.join(directory, "index");
    const env = { GIT_INDEX_FILE: index };
    const userIndex = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
    // The user's index is only read: copied, never opened for writing.
    const seeded = await copyFile(userIndex, index).then(() => true, () => false);
    try { await git(cwd, ADD_ALL, env); }
    catch (error) {
      if (!seeded) throw error;
      // A seeded index Git cannot extend (a split or sparse index) starts empty instead.
      await rm(index, { force: true });
      await git(cwd, ADD_ALL, env);
    }
    // The seeded copy may already hold `.stave` entries the user staged; the exclude pathspec does not remove them.
    await git(cwd, ["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "--", ":(top).stave"], env);
    const tree = (await git(cwd, ["write-tree"], env)).trim();
    const unchanged = head
      ? tree === (await git(cwd, ["rev-parse", "--verify", "--end-of-options", `${head}^{tree}`])).trim()
      : !(await git(cwd, ["ls-files", "-z"], env));
    if (unchanged) {
      // Create-only, like the snapshot ref; an unborn HEAD has nothing to point at and stays unpinned.
      if (head) await git(cwd, ["update-ref", "-m", "stave: Tars working changes (clean)", tarsCleanMarkerRef(args.ref), head, ""]).catch(() => undefined);
      return { kind: "clean" };
    }
    // Unsigned: a signing prompt would hang a background admission, and the commit is Stave's own record.
    const commitArgs = ["commit-tree", "--no-gpg-sign", tree, ...(head ? ["-p", head] : []), "-m", args.message];
    const dates = { GIT_AUTHOR_DATE: gitDate(args.date), GIT_COMMITTER_DATE: gitDate(args.date) };
    let commit: string;
    try { commit = (await git(cwd, commitArgs, dates)).trim(); }
    catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      if (!MISSING_IDENTITY.test(typeof stderr === "string" ? stderr : String(error))) throw error;
      commit = (await git(cwd, commitArgs, { ...dates, ...FALLBACK_IDENTITY })).trim();
    }
    // Create-only: a concurrent admission that created the ref first wins, and its commit is used.
    try { await git(cwd, ["update-ref", "-m", "stave: Tars working changes", args.ref, commit, ""]); }
    catch (error) {
      const winner = await resolveCommit(cwd, args.ref);
      if (!winner) throw error;
      commit = winner;
    }
    return { kind: "snapshot", commit, ref: args.ref };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Whether a snapshot commit still exists in the repository (a deleted ref and `git gc` can remove it). */
export async function hasTarsSnapshotCommit(repositoryPath: string, commit: string): Promise<boolean> {
  return (await resolveCommit(repositoryPath, commit)) === commit;
}

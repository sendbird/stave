import { mkdir, realpath, rmdir } from "node:fs/promises";
import path from "node:path";
import {
  addNewGitWorktree,
  gitBranchCollision,
  type GitWorktreeCreateArgs,
  type RunGit,
  type WorktreeCreationFailure,
} from "../../src/lib/git-worktree-creation";
import { normalizeComparablePath, parseGitWorktrees } from "../../src/lib/source-control-worktrees";
import { runCommandArgs } from "../main/utils/command";

export function runWorkspaceGit(args: { cwd: string; signal?: AbortSignal }): RunGit {
  return (commandArgs) => runCommandArgs({
    ...args,
    command: "git",
    commandArgs,
    timeoutMs: 60_000,
    env: { ...process.env, LC_ALL: "C" },
  });
}

export async function createGitWorktree(
  args: GitWorktreeCreateArgs,
  runGit: RunGit = runWorkspaceGit(args),
): Promise<WorktreeCreationFailure | null> {
  const worktreeList = await runGit(["worktree", "list", "--porcelain", "-z"]);
  if (!worktreeList.ok || worktreeList.stdoutTruncated) {
    return { code: "git_failed", detail: worktreeList.ok ? "" : worktreeList.stderr.trim() };
  }
  const worktrees = parseGitWorktrees({ stdout: worktreeList.stdout });
  const checkout = worktrees.find((entry) => entry.branch === args.branch);
  if (checkout) return gitBranchCollision(runGit, args.branch, checkout.path);

  // Git may create the branch before rejecting an occupied worktree path.
  // Reserve the directory atomically and refuse paths Git already registered.
  try {
    const parent = path.dirname(args.path);
    await mkdir(parent, { recursive: true });
    const canonicalPath = path.join(await realpath(parent), path.basename(args.path));
    if (worktrees.some((entry) => normalizeComparablePath(entry.path) === normalizeComparablePath(canonicalPath))) {
      return { code: "path_exists", path: args.path };
    }
    await mkdir(args.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { code: "path_exists", path: args.path };
    return { code: "git_failed", detail: String(error) };
  }

  let created = false;
  try {
    const failure = await addNewGitWorktree({ ...args, runGit });
    created = !failure;
    return failure;
  } finally {
    // Keep Git's metadata and any files written by another process.
    if (!created) await rmdir(args.path).catch(() => {});
  }
}

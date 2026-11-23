import { z } from "zod";
import { i18n } from "@/i18n/runtime";
import { parseGitWorktrees } from "@/lib/source-control-worktrees";

export const GitWorktreeCreateArgsSchema = z.object({
  cwd: z.string().min(1),
  branch: z.string().min(1),
  path: z.string().min(1),
  baseRef: z.string().min(1).optional(),
});
export type GitWorktreeCreateArgs = z.infer<typeof GitWorktreeCreateArgsSchema>;

export type WorktreeCreationFailure =
  | { code: "branch_exists"; branch: string; suggestedBranch?: string }
  | { code: "branch_checked_out"; branch: string; path: string; suggestedBranch?: string }
  | { code: "path_exists"; path: string }
  | { code: "base_ref_missing"; ref: string }
  | { code: "git_failed"; detail: string };

export function describeWorktreeCreationFailure(failure: WorktreeCreationFailure, lng?: string) {
  const t = i18n.getFixedT(lng ?? null, "workspace", "worktreeCreationErrors");
  switch (failure.code) {
    case "branch_exists":
    case "branch_checked_out": {
      const message = failure.code === "branch_exists"
        ? t("branchExists", { branch: failure.branch })
        : t("branchCheckedOut", { branch: failure.branch, path: failure.path });
      return failure.suggestedBranch
        ? `${message} ${t("suggestBranch", { branch: failure.suggestedBranch })}`
        : message;
    }
    case "path_exists":
      return t("pathExists", { path: failure.path });
    case "base_ref_missing":
      return t("baseRefMissing", { ref: failure.ref });
    case "git_failed":
      return failure.detail || t("gitFailed");
  }
}

export class WorktreeCreationError extends Error {
  constructor(readonly failure: WorktreeCreationFailure) {
    super(describeWorktreeCreationFailure(failure, "en"));
    this.name = "WorktreeCreationError";
  }
}

export type RunGit = (commandArgs: string[]) => Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated?: boolean;
}>;

function suggestBranch(branch: string, refs: string[]) {
  const names = refs.map((ref) => ref.toLowerCase());
  // If a parent ref is a branch, a suffix on the last component still cannot be created.
  const base = names.some((ref) => branch.toLowerCase().startsWith(`${ref}/`))
    ? branch.replaceAll("/", "-")
    : branch;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    const lower = candidate.toLowerCase();
    if (!names.some((ref) => ref === lower || ref.startsWith(`${lower}/`))) return candidate;
  }
}

export async function gitBranchCollision(runGit: RunGit, branch: string, path?: string): Promise<WorktreeCreationFailure> {
  const refs = await runGit(["for-each-ref", "--format=%(refname:strip=2)", "refs/heads"]);
  const suggestedBranch = refs.ok && !refs.stdoutTruncated
    ? suggestBranch(branch, refs.stdout.trim().split("\n").filter(Boolean))
    : undefined;
  return path
    ? { code: "branch_checked_out", branch, path, suggestedBranch }
    : { code: "branch_exists", branch, suggestedBranch };
}

/** Run Git with LC_ALL=C so its worktree diagnostics have a stable locale. */
export async function addNewGitWorktree(args: {
  runGit: RunGit;
  branch: string;
  path: string;
  baseRef?: string;
}): Promise<WorktreeCreationFailure | null> {
  const { runGit, branch, path, baseRef } = args;
  // Starting from a remote-tracking ref must not set the new branch's upstream.
  const add = await runGit(["worktree", "add", "--no-track", "-b", branch, "--", path, ...(baseRef ? [baseRef] : [])]);
  if (add.ok) return null;

  const detail = (add.stderr || add.stdout).trim();
  if (/^fatal: (?:a branch named .* already exists|cannot lock ref 'refs\/heads\/[^']+': .*?(?:exists; cannot create|reference already exists))/m.test(detail)) {
    const worktrees = await runGit(["worktree", "list", "--porcelain", "-z"]);
    const checkout = worktrees.ok
      ? parseGitWorktrees({ stdout: worktrees.stdout }).find((entry) => entry.branch === branch)
      : undefined;
    return gitBranchCollision(runGit, branch, checkout?.path);
  }
  if (/^fatal: '.*' (?:already exists|(?:is a missing but )?already registered worktree|is already registered)/ms.test(detail)) {
    return { code: "path_exists", path };
  }
  if (/^fatal: (?:invalid reference:|not a valid object name:)/m.test(detail)) {
    return { code: "base_ref_missing", ref: baseRef ?? "HEAD" };
  }
  return { code: "git_failed", detail };
}

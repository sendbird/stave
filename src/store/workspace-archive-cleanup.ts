import { i18n } from "@/i18n/runtime";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import {
  normalizeArchivedWorkspacePaths,
  type RecentRepositoryState,
} from "@/store/repository.utils";


/** Keep paths and branch names literal when invoking the existing shell runner. */
export function quoteWorkspaceShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Normalized worktree paths the user explicitly archived this session. When a
 * worktree is genuinely dirty, archive intentionally preserves it on disk to
 * protect uncommitted work — but `refreshWorkspaces` would then re-discover and
 * re-register it ("resurrection"). This tombstone tells the discovery pass to
 * skip those paths so an archived workspace stays archived.
 */
export const archivedWorktreePaths = new Set<string>();

export function getArchivedWorktreePathSetForRepository(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const normalizedRepositoryPath = normalizeComparablePath(args.repositoryPath);
  const repository = normalizedRepositoryPath
    ? (args.recentRepositories.find(
        (item) =>
          normalizeComparablePath(item.repositoryPath) === normalizedRepositoryPath,
      ) ?? null)
    : null;
  return new Set([
    ...normalizeArchivedWorkspacePaths({
      paths: repository?.archivedWorkspacePaths,
    }),
    ...archivedWorktreePaths,
  ]);
}

/**
 * Normalized worktree paths the user explicitly imported from outside this
 * repository checkout ("linked" worktrees). They usually belong to another clone,
 * so the repository's `git worktree list` does not report them — without this set
 * the stale-workspace cleanup would immediately unregister them again.
 */
export function getLinkedWorktreePathSetForRepository(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const normalizedRepositoryPath = normalizeComparablePath(args.repositoryPath);
  const repository = normalizedRepositoryPath
    ? (args.recentRepositories.find(
        (item) =>
          normalizeComparablePath(item.repositoryPath) === normalizedRepositoryPath,
      ) ?? null)
    : null;
  return new Set(
    normalizeArchivedWorkspacePaths({
      paths: repository?.linkedWorkspacePaths,
    }),
  );
}

/**
 * Why archive left the worktree and/or branch on disk. Archive is best-effort:
 * it never destroys uncommitted work, and git itself can refuse a removal, so
 * the user needs to hear about it instead of silently finding stale branches.
 */
export type WorkspaceArchivePreservationReason =
  | "dirty-worktree"
  | "worktree-remove-failed"
  | "branch-delete-failed"
  | "branch-unresolved";

export function buildWorkspaceArchivePreservationToast(args: {
  reason: WorkspaceArchivePreservationReason;
  workspaceName?: string;
  workspaceBranch?: string;
}): { title: string; description: string } {
  const subject = args.workspaceName
    ? i18n.t("workspace:workspaceArchiveCleanup.archivedNamed", { name: JSON.stringify(args.workspaceName) })
    : i18n.t("workspace:workspaceArchiveCleanup.archivedWorkspace");
  const branch = args.workspaceBranch
    ? i18n.t("workspace:workspaceArchiveCleanup.branchNamed", { name: JSON.stringify(args.workspaceBranch) })
    : i18n.t("workspace:workspaceArchiveCleanup.itsBranch");
  switch (args.reason) {
    case "dirty-worktree":
      return {
        title: i18n.t("workspace:workspaceArchiveCleanup.worktreeAndBranchKept"),
        description: i18n.t("workspace:workspaceArchiveCleanup.valueButKeptItsGitWorktreeAnd", { subject: subject, branch: branch }),
      };
    case "worktree-remove-failed":
      return {
        title: i18n.t("workspace:workspaceArchiveCleanup.worktreeRemovalFailed"),
        description: i18n.t("workspace:workspaceArchiveCleanup.valueButCouldNotRemoveItsGit", { subject: subject, branch: branch }),
      };
    case "branch-delete-failed":
      return {
        title: i18n.t("workspace:workspaceArchiveCleanup.branchDeletionFailed"),
        description: i18n.t("workspace:workspaceArchiveCleanup.valueButCouldNotDeleteValue", { subject: subject, branch: branch }),
      };
    case "branch-unresolved":
      return {
        title: i18n.t("workspace:workspaceArchiveCleanup.branchKept"),
        description: i18n.t("workspace:workspaceArchiveCleanup.valueButCouldNotConfirmWhichBranch", { subject: subject }),
      };
  }
}

/**
 * Decide which branch archive is allowed to delete.
 *
 * `workspaceBranchById` is only a cache: `refreshWorkspaces` skips worktree
 * paths it already knows instead of re-reading their branch, and only the
 * in-app branch dropdown writes back to it. A `git checkout` run from the
 * workspace terminal — or by an agent working in that worktree — therefore
 * leaves the cached name stale. Force-deleting the stale name would destroy an
 * unrelated branch while orphaning the branch the worktree actually held, so
 * the worktree's own HEAD is the only value worth trusting. Git refuses to
 * check a branch out in two worktrees at once, so the resolved branch is by
 * definition owned by the worktree being removed.
 *
 * Returns `branch: null` when HEAD is detached or cannot be read; archive then
 * deletes nothing and says so instead of guessing.
 */
export function resolveWorkspaceBranchToDelete(args: {
  headOk: boolean;
  headStdout?: string;
  cachedBranch?: string;
}): { branch: string | null; staleCachedBranch: string | null } {
  const branch = args.headOk ? (args.headStdout ?? "").trim() || null : null;
  const staleCachedBranch =
    args.cachedBranch && args.cachedBranch !== branch
      ? args.cachedBranch
      : null;
  return { branch, staleCachedBranch };
}

/**
 * Detached workspace-archive cleanup: git worktree removal, branch deletion,
 * script/PTY teardown, and persistence close.
 *
 * Extracted verbatim from `@/store/app.store` to keep the store file within the
 * max-lines ratchet. `archivedWorktreePaths` stays a single module-level Set so
 * the tombstone identity and lifetime are unchanged, and `app.store` re-exports
 * `waitForPendingWorkspaceArchiveCleanups` for existing consumers.
 */
import { closeWorkspacePersistence } from "@/lib/db/workspaces.db";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { worktreeStatusHasMeaningfulChanges } from "@/lib/workspace-archive-status";
import {
  buildLinkedWorktreeSymlinkPath,
  normalizeArchivedWorkspacePaths,
  type RecentProjectState,
} from "@/store/project.utils";
import { closeTerminalSessionsForWorkspaces } from "@/store/workspace-terminal-cleanup";

const activeWorkspaceArchiveCleanups = new Set<Promise<void>>();

/**
 * Normalized worktree paths the user explicitly archived this session. When a
 * worktree is genuinely dirty, archive intentionally preserves it on disk to
 * protect uncommitted work — but `refreshWorkspaces` would then re-discover and
 * re-register it ("resurrection"). This tombstone tells the discovery pass to
 * skip those paths so an archived workspace stays archived.
 */
export const archivedWorktreePaths = new Set<string>();

export function getArchivedWorktreePathSetForProject(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const normalizedProjectPath = normalizeComparablePath(args.projectPath);
  const project = normalizedProjectPath
    ? (args.recentProjects.find(
        (item) =>
          normalizeComparablePath(item.projectPath) === normalizedProjectPath,
      ) ?? null)
    : null;
  return new Set([
    ...normalizeArchivedWorkspacePaths({
      paths: project?.archivedWorkspacePaths,
    }),
    ...archivedWorktreePaths,
  ]);
}

/**
 * Normalized worktree paths the user explicitly imported from outside this
 * project checkout ("linked" worktrees). They usually belong to another clone,
 * so the project's `git worktree list` does not report them — without this set
 * the stale-workspace cleanup would immediately unregister them again.
 */
export function getLinkedWorktreePathSetForProject(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const normalizedProjectPath = normalizeComparablePath(args.projectPath);
  const project = normalizedProjectPath
    ? (args.recentProjects.find(
        (item) =>
          normalizeComparablePath(item.projectPath) === normalizedProjectPath,
      ) ?? null)
    : null;
  return new Set(
    normalizeArchivedWorkspacePaths({
      paths: project?.linkedWorkspacePaths,
    }),
  );
}

export type WorkspaceArchiveCommandRunner = (args: {
  cwd?: string;
  command: string;
}) => Promise<{
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}>;

/**
 * Wait for every background workspace-archive cleanup promise to settle.
 * Archive cleanup (git worktree removal, branch deletion, persistence close)
 * runs detached so the UI can archive a workspace instantly. Tests and
 * shutdown code paths can use this to observe the real completion of that
 * deferred work.
 */
export async function waitForPendingWorkspaceArchiveCleanups(): Promise<void> {
  while (activeWorkspaceArchiveCleanups.size > 0) {
    const pending = Array.from(activeWorkspaceArchiveCleanups);
    await Promise.allSettled(pending);
  }
}

export function startWorkspaceArchiveCleanup(args: {
  workspaceId: string;
  workspacePath?: string;
  workspaceBranch?: string;
  projectPath?: string | null;
  isLinkedWorktree?: boolean;
}): void {
  // Tombstone the path synchronously so a refresh racing the detached cleanup
  // below does not re-register the workspace being archived.
  if (args.workspacePath) {
    const normalizedArchivedPath = normalizeComparablePath(args.workspacePath);
    if (normalizedArchivedPath) {
      archivedWorktreePaths.add(normalizedArchivedPath);
    }
  }
  const promise = performWorkspaceArchiveCleanup(args);
  activeWorkspaceArchiveCleanups.add(promise);
  promise
    .catch((error) => {
      console.error(
        "[workspace-archive] background cleanup rejected",
        args,
        error,
      );
    })
    .finally(() => {
      activeWorkspaceArchiveCleanups.delete(promise);
    });
}

async function workspaceHasLocalChanges(args: {
  runner: WorkspaceArchiveCommandRunner;
  workspacePath: string;
  workspaceId: string;
}) {
  const statusResult = await args.runner({
    cwd: args.workspacePath,
    command: "git status --porcelain --untracked-files=all",
  });
  if (!statusResult.ok) {
    console.warn("[workspace-archive] dirty check failed", {
      workspaceId: args.workspaceId,
      workspacePath: args.workspacePath,
      stderr: statusResult.stderr,
    });
    return true;
  }
  // Ignore Stave's own self-managed untracked entries (the linked node_modules
  // symlink), which `.gitignore`'s `node_modules/` dir-only pattern misses and
  // would otherwise make every symlinked worktree look permanently dirty.
  return worktreeStatusHasMeaningfulChanges(statusResult.stdout);
}

async function workspaceBranchHasUnpushedCommits(args: {
  runner: WorkspaceArchiveCommandRunner;
  projectPath: string;
  workspaceId: string;
  workspaceBranch: string;
}) {
  const unpushedResult = await args.runner({
    cwd: args.projectPath,
    command: `git rev-list --count ${JSON.stringify(args.workspaceBranch)} --not --remotes`,
  });
  if (!unpushedResult.ok) {
    console.warn("[workspace-archive] unpushed branch check failed", {
      workspaceId: args.workspaceId,
      workspaceBranch: args.workspaceBranch,
      stderr: unpushedResult.stderr,
    });
    return true;
  }
  const count = Number.parseInt(unpushedResult.stdout.trim(), 10);
  return Number.isFinite(count) && count > 0;
}

async function performWorkspaceArchiveCleanup(args: {
  workspaceId: string;
  workspacePath?: string;
  workspaceBranch?: string;
  projectPath?: string | null;
  isLinkedWorktree?: boolean;
}) {
  const { workspaceId, workspacePath, workspaceBranch, projectPath } = args;
  try {
    const stopWorkspaceScripts = window.api?.scripts?.stopAll;
    if (stopWorkspaceScripts) {
      await stopWorkspaceScripts({ workspaceId });
    }
  } catch (error) {
    console.error(
      "[workspace-archive] stopScripts failed",
      { workspaceId },
      error,
    );
  }
  try {
    await closeTerminalSessionsForWorkspaces([workspaceId]);
  } catch (error) {
    console.error(
      "[workspace-archive] closeTerminalSessions failed",
      { workspaceId },
      error,
    );
  }
  const runner = window.api?.terminal?.runCommand;
  if (runner && projectPath && workspacePath && args.isLinkedWorktree) {
    // Linked worktrees live outside this checkout and stay owned by whatever
    // created them: never remove the worktree or its branch, only the symlink
    // Stave placed under `.stave/workspaces/`.
    try {
      const symlinkPath = buildLinkedWorktreeSymlinkPath({
        projectPath,
        worktreePath: workspacePath,
      });
      await runner({
        cwd: projectPath,
        command: `if [ -L ${JSON.stringify(symlinkPath)} ]; then rm ${JSON.stringify(symlinkPath)}; fi`,
      });
    } catch (error) {
      console.error(
        "[workspace-archive] linked symlink cleanup failed",
        { workspaceId, workspacePath },
        error,
      );
    }
  } else if (runner && projectPath && workspacePath) {
    try {
      const hasLocalChanges = await workspaceHasLocalChanges({
        runner,
        workspacePath,
        workspaceId,
      });
      let didRemoveWorktree = false;
      if (hasLocalChanges) {
        console.warn("[workspace-archive] preserving dirty worktree", {
          workspaceId,
          workspacePath,
        });
      } else {
        // `worktreeStatusHasMeaningfulChanges` ignores the linked
        // `node_modules` symlink, but `git worktree remove` still refuses to
        // delete a worktree that contains untracked entries. Drop the
        // self-managed symlink first so a pristine symlinked worktree is
        // actually removable — otherwise it silently survives on disk and
        // resurrects as a rediscovered workspace later.
        const nodeModulesSymlinkPath = `${workspacePath}/node_modules`;
        await runner({
          cwd: projectPath,
          command: `if [ -L ${JSON.stringify(nodeModulesSymlinkPath)} ]; then rm ${JSON.stringify(nodeModulesSymlinkPath)}; fi`,
        });
        const removeResult = await runner({
          cwd: projectPath,
          command: `git worktree remove ${JSON.stringify(workspacePath)}`,
        });
        didRemoveWorktree = removeResult.ok;
        if (!removeResult.ok) {
          console.warn(
            "[workspace-archive] git worktree remove failed; preserving worktree",
            {
              workspaceId,
              workspacePath,
              stderr: removeResult.stderr,
            },
          );
        }
        await runner({
          cwd: projectPath,
          command: "git worktree prune",
        });
      }

      if (workspaceBranch && didRemoveWorktree) {
        const hasUnpushedCommits = await workspaceBranchHasUnpushedCommits({
          runner,
          projectPath,
          workspaceId,
          workspaceBranch,
        });
        if (hasUnpushedCommits) {
          console.warn("[workspace-archive] preserving unpushed branch", {
            workspaceId,
            workspaceBranch,
          });
        } else {
          await runner({
            cwd: projectPath,
            command: `git branch -d ${JSON.stringify(workspaceBranch)}`,
          });
        }
      }
    } catch (error) {
      console.error(
        "[workspace-archive] git cleanup failed",
        { workspaceId, workspacePath, workspaceBranch },
        error,
      );
    }
  }
  try {
    await closeWorkspacePersistence({ workspaceId });
  } catch (error) {
    console.error(
      "[workspace-archive] closeWorkspacePersistence failed",
      { workspaceId },
      error,
    );
  }
}

import { i18n } from "@/i18n/runtime";
import type { AppState } from "@/store/app-store.types";
import { findListedWorktree, normalizeComparablePath, type GitWorktreeEntry } from "@/lib/source-control-worktrees";
import { isNotificationPendingAttention } from "@/lib/notifications/notification.types";

export type CleanupState = Pick<AppState, "repositoryPath" | "workspaces" | "workspacePathById" | "workspaceDefaultById" | "activeWorkspaceId" | "activeTurnIdsByTask" | "taskWorkspaceIdById" | "notifications">;

export function workspaceCleanupBlocker(state: CleanupState, repositoryPath: string, workspaceId: string, path: string): string | null {
  if (state.repositoryPath !== repositoryPath || !state.workspaces.some((w) => w.id === workspaceId) || state.workspacePathById[workspaceId] !== path) return i18n.t("workspace:workspaceCleanup.blocker.workspaceChanged");
  if (state.workspaceDefaultById[workspaceId] || workspaceId === "base" || normalizeComparablePath(path) === normalizeComparablePath(repositoryPath)) return i18n.t("workspace:workspaceCleanup.blocker.defaultWorkspace");
  if (state.activeWorkspaceId === workspaceId) return i18n.t("workspace:workspaceCleanup.blocker.currentWorkspace");
  if (!path) return i18n.t("workspace:workspaceCleanup.blocker.pathUnavailable");
  if (Object.entries(state.activeTurnIdsByTask).some(([taskId, turnId]) => turnId && state.taskWorkspaceIdById[taskId] === workspaceId)) return i18n.t("workspace:workspaceCleanup.blocker.agentRunning");
  if (state.notifications.some((n) => n.workspaceId === workspaceId && isNotificationPendingAttention(n))) return i18n.t("workspace:workspaceCleanup.blocker.waitingForYou");
  return null;
}

export function parseWorkspaceDiskBytes(stdout: string): number | null {
  const match = stdout.trim().match(/^(\d+)\s+\.\s*$/);
  const kb = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(kb) && kb >= 0 && Number.isSafeInteger(kb * 1024) ? kb * 1024 : null;
}

/**
 * What happened to an archived workspace's checkout on disk. `listed` comes
 * from `listRepositoryWorktrees` (registered path form, Git's form kept), so a
 * worktree Git reports through a resolved symbolic link still counts as kept;
 * null when Git could not list worktrees.
 */
export function cleanupWorktreeResultKey(args: { linked: boolean; listed: readonly GitWorktreeEntry[] | null; path: string }) {
  if (args.linked) return "workspace:cleanupDialog.operations.results.externalKept" as const;
  if (!args.listed) return "workspace:cleanupDialog.operations.results.unverified" as const;
  return findListedWorktree(args.listed, args.path)
    ? "workspace:cleanupDialog.operations.results.worktreeKept" as const
    : "workspace:cleanupDialog.operations.results.worktreeRemoved" as const;
}

/** Recommendations never replace the live safety checks before cleanup. */
export function workspaceCleanupRecommendation(args: {
  lastActive: string | null;
  prState?: string;
  prCheckedAt?: number;
  unpushed: number | null;
  now: number;
}): string | null {
  if (args.unpushed !== 0 || args.prState !== "MERGED") return null;
  if (!args.prCheckedAt || args.now - args.prCheckedAt > 5 * 60_000 || args.prCheckedAt > args.now) return null;
  const lastActive = args.lastActive ? Date.parse(args.lastActive) : NaN;
  if (!Number.isFinite(lastActive) || args.now - lastActive < 14 * 86400_000) return null;
  return i18n.t("workspace:workspaceCleanup.recommendation.mergedAndInactive");
}

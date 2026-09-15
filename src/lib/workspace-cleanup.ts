import type { AppState } from "@/store/app-store.types";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { isNotificationPendingAttention } from "@/lib/notifications/notification.types";

export type CleanupState = Pick<AppState, "projectPath" | "workspaces" | "workspacePathById" | "workspaceDefaultById" | "activeWorkspaceId" | "activeTurnIdsByTask" | "taskWorkspaceIdById" | "notifications">;

export function workspaceCleanupBlocker(state: CleanupState, projectPath: string, workspaceId: string, path: string): string | null {
  if (state.projectPath !== projectPath || !state.workspaces.some((w) => w.id === workspaceId) || state.workspacePathById[workspaceId] !== path) return "Workspace changed";
  if (state.workspaceDefaultById[workspaceId] || workspaceId === "base" || normalizeComparablePath(path) === normalizeComparablePath(projectPath)) return "Default workspace";
  if (state.activeWorkspaceId === workspaceId) return "Current workspace";
  if (!path) return "Path unavailable";
  if (Object.entries(state.activeTurnIdsByTask).some(([taskId, turnId]) => turnId && state.taskWorkspaceIdById[taskId] === workspaceId)) return "Agent running";
  if (state.notifications.some((n) => n.workspaceId === workspaceId && isNotificationPendingAttention(n))) return "Waiting for your response";
  return null;
}

export function parseWorkspaceDiskBytes(stdout: string): number | null {
  const match = stdout.trim().match(/^(\d+)\s+\.\s*$/);
  const kb = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(kb) && kb >= 0 && Number.isSafeInteger(kb * 1024) ? kb * 1024 : null;
}

export function worktreeListContainsPath(stdout: string, path: string): boolean {
  return stdout.split("\0").some((field) => field === `worktree ${path}`);
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
  return "PR merged · no unpushed commits · inactive for at least 14 days";
}

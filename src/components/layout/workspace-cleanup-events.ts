export const OPEN_WORKSPACE_CLEANUP_EVENT = "stave:open-workspace-cleanup";
export const WORKSPACE_CLEANUP_CHANGED_EVENT = "stave:workspace-cleanup-changed";
export interface WorkspaceCleanupTarget { workspaceId: string }
/**
 * Opens the cleanup center; with a target it scrolls to and highlights that
 * workspace's row. It is also used directly as a click handler, so anything
 * that is not a target (a DOM event) opens the center without one.
 */
export function openWorkspaceCleanup(target?: unknown) {
  const workspaceId = (target as Partial<WorkspaceCleanupTarget> | null | undefined)?.workspaceId;
  const detail: WorkspaceCleanupTarget | null = typeof workspaceId === "string" && workspaceId ? { workspaceId } : null;
  window.dispatchEvent(new CustomEvent<WorkspaceCleanupTarget | null>(OPEN_WORKSPACE_CLEANUP_EVENT, { detail }));
}
export function notifyWorkspaceCleanupChanged() {
  window.dispatchEvent(new Event(WORKSPACE_CLEANUP_CHANGED_EVENT));
}

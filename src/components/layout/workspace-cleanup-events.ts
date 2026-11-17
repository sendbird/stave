export const OPEN_WORKSPACE_CLEANUP_EVENT = "stave:open-workspace-cleanup";
export const WORKSPACE_CLEANUP_CHANGED_EVENT = "stave:workspace-cleanup-changed";
export function openWorkspaceCleanup() {
  window.dispatchEvent(new Event(OPEN_WORKSPACE_CLEANUP_EVENT));
}
export function notifyWorkspaceCleanupChanged() {
  window.dispatchEvent(new Event(WORKSPACE_CLEANUP_CHANGED_EVENT));
}

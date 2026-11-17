import type { AppState } from "@/store/app-store.types";

/**
 * Show the starts that were waiting for a slot when Stave quit in the
 * sessions this renderer already loaded.
 *
 * The host never runs such a start again on its own: it puts each one back
 * into its task's composer queue on disk, stamped with its original queue
 * time, so the queue opens paused as restored and the user sends or discards
 * it. A session loaded before that write would otherwise keep, and later
 * save, a draft without it.
 */
export async function claimRestoredQueuedTurns(getState: () => AppState) {
  const take = window.api?.provider?.takeRestoredQueuedTurns;
  if (!take) return;
  let items: Awaited<ReturnType<typeof take>>["items"];
  try {
    ({ items } = await take());
  } catch (error) {
    console.warn("[queue] restored queued turns could not be read", error);
    return;
  }
  for (const { workspaceId, taskId, item } of items) {
    const state = getState();
    // A session not loaded here reads the item from the draft on disk.
    if (state.taskWorkspaceIdById[taskId] !== workspaceId) continue;
    const drafts = workspaceId === state.activeWorkspaceId
      ? state.promptDraftByTask
      : state.workspaceRuntimeCacheById[workspaceId]?.promptDraftByTask;
    const queued = drafts?.[taskId]?.queuedTurns ?? [];
    if (queued.some((entry) => entry.id === item.id)) continue;
    state.updatePromptDraft({ taskId, patch: { queuedTurns: [...queued, item] } });
  }
}

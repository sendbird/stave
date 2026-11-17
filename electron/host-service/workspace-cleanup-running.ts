import type { SqliteStore } from "../persistence/sqlite-store";

/** Reuse Fleet's persisted eligibility, including descendants in other workspaces. */
export function workspaceRunningCleanupBlockers(
  store: Pick<SqliteStore, "listWorkspaceTasks" | "previewFleetStop">,
  workspaceId: string,
): string[] {
  const tasks = store.listWorkspaceTasks({ workspaceId });
  const reasons = new Set<string>();
  for (let offset = 0; offset < tasks.length; offset += 500) {
    const preview = store.previewFleetStop({
      targets: tasks.slice(offset, offset + 500).map(task => ({ workspaceId, taskId: task.id })),
    });
    if (preview.turns) reasons.add("runningTurn");
    if (preview.children || preview.runs) reasons.add("runningRun");
  }
  return [...reasons];
}

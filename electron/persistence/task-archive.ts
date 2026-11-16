import { buildPanePanelId } from "../../src/lib/panes/types";
import type { PersistenceWorkspaceSnapshot } from "./types";

/** Archive closes the task surface; restoring never changes the user's current surface. */
export function archiveTaskSnapshot(snapshot: PersistenceWorkspaceSnapshot, taskId: string, archivedAt: string | null): PersistenceWorkspaceSnapshot {
  const tasks = snapshot.tasks.map((task) => task.id === taskId
    ? { ...task, archivedAt, updatedAt: archivedAt ?? new Date().toISOString(), ...(archivedAt ? { unread: false } : {}) }
    : task);
  if (!archivedAt) return { ...snapshot, tasks };
  const activeTaskId = snapshot.activeTaskId === taskId
    ? snapshot.tasks.find((task) => task.id !== taskId && !task.archivedAt)?.id ?? ""
    : snapshot.activeTaskId;
  const openTaskTabIds = snapshot.openTaskTabIds?.filter((id) => id !== taskId);
  const panelId = buildPanePanelId({ kind: "task", taskId });
  return {
    ...snapshot,
    tasks,
    activeTaskId,
    activeSurface: snapshot.activeSurface?.kind === "task" && snapshot.activeSurface.taskId === taskId
      ? { kind: "task", taskId: activeTaskId } : snapshot.activeSurface,
    openTaskTabIds: openTaskTabIds && activeTaskId && !openTaskTabIds.includes(activeTaskId)
      ? [...openTaskTabIds, activeTaskId] : openTaskTabIds,
    terminalTabs: snapshot.terminalTabs?.map((tab) => tab.linkedTaskId === taskId ? { ...tab, linkedTaskId: null } : tab),
    cliSessionTabs: snapshot.cliSessionTabs?.map((tab) => tab.linkedTaskId === taskId ? { ...tab, linkedTaskId: null } : tab),
    paneTabMeta: snapshot.paneTabMeta && Object.fromEntries(Object.entries(snapshot.paneTabMeta).filter(([id]) => id !== panelId)),
  };
}

import { useAppStore } from "@/store/app.store";
import { useFleetWorkspaceShellsStore } from "@/store/fleet-workspace-shells-store";
import { flushPendingSnapshotPersists, type WorkspaceSessionState } from "@/store/workspace-session-state";

export interface FleetTaskTarget {
  workspaceId: string;
  taskId: string;
}

function withoutKey<T>(record: Record<string, T> | undefined, taskId: string): Record<string, T> {
  const { [taskId]: _deleted, ...rest } = record ?? {};
  return rest;
}

/** Remove the durable deletion from every renderer snapshot that can be saved again. */
type TaskDeletionState = Omit<WorkspaceSessionState, "terminalDocked" | "providerGoalByTask"> & Pick<Partial<WorkspaceSessionState>, "providerGoalByTask">;

export function removeDeletedFleetTask<T extends TaskDeletionState>(state: T, taskId: string): T {
  const tasks = state.tasks.filter((task) => task.id !== taskId);
  const activeTaskId = state.activeTaskId === taskId ? "" : state.activeTaskId;
  return {
    ...state,
    tasks,
    activeTaskId,
    activeSurface: state.activeSurface.kind === "task" && state.activeSurface.taskId === taskId
      ? { kind: "task", taskId: activeTaskId } : state.activeSurface,
    openTaskTabIds: state.openTaskTabIds.filter((id) => id !== taskId),
    messagesByTask: withoutKey(state.messagesByTask, taskId),
    messageCountByTask: withoutKey(state.messageCountByTask, taskId),
    promptDraftByTask: withoutKey(state.promptDraftByTask, taskId),
    reviewCommentsByTask: withoutKey(state.reviewCommentsByTask, taskId),
    activeTurnIdsByTask: withoutKey(state.activeTurnIdsByTask, taskId),
    providerSessionByTask: withoutKey(state.providerSessionByTask, taskId),
    providerGoalByTask: withoutKey(state.providerGoalByTask, taskId),
    nativeSessionReadyByTask: withoutKey(state.nativeSessionReadyByTask, taskId),
    terminalTabs: state.terminalTabs.map((tab) => tab.linkedTaskId === taskId ? { ...tab, linkedTaskId: null } : tab),
    cliSessionTabs: state.cliSessionTabs.map((tab) => tab.linkedTaskId === taskId ? { ...tab, linkedTaskId: null } : tab),
  };
}

/** Host checks are authoritative; a denied deletion leaves the renderer untouched. */
export async function deleteFleetTask(target: FleetTaskTarget): Promise<{ ok: boolean; message?: string }> {
  await flushPendingSnapshotPersists(target.workspaceId);
  const control = window.api?.taskControl;
  if (!control?.deletePermanently) return { ok: false };
  const result = await control.deletePermanently(target);
  if (!result.ok) return result;
  useAppStore.setState((state) => {
    const cached = state.workspaceRuntimeCacheById[target.workspaceId];
    const current = state.activeWorkspaceId === target.workspaceId;
    const next = current ? removeDeletedFleetTask(state, target.taskId) : state;
    return {
      ...next,
      taskWorkspaceIdById: withoutKey(state.taskWorkspaceIdById, target.taskId),
      notifications: state.notifications.filter((item) => item.taskId !== target.taskId),
      workspaceRuntimeCacheById: cached ? {
        ...state.workspaceRuntimeCacheById,
        [target.workspaceId]: removeDeletedFleetTask(cached, target.taskId),
      } : state.workspaceRuntimeCacheById,
      workspaceSnapshotVersion: current ? state.workspaceSnapshotVersion + 1 : state.workspaceSnapshotVersion,
    };
  });
  useFleetWorkspaceShellsStore.setState((state) => {
    const entry = state.byWorkspaceId[target.workspaceId];
    if (entry?.status !== "loaded" || !entry.shell) return state;
    return { byWorkspaceId: { ...state.byWorkspaceId, [target.workspaceId]: {
      status: "loaded" as const,
      shell: { ...entry.shell, tasks: entry.shell.tasks.filter((task) => task.id !== target.taskId),
        openTaskTabIds: entry.shell.openTaskTabIds?.filter((id) => id !== target.taskId) },
    } } };
  });
  return result;
}

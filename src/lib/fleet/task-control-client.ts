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

function releaseChildren<T extends { parentTaskId?: string | null }>(tasks: T[], parentTaskId: string): T[] {
  return tasks.some((task) => task.parentTaskId === parentTaskId)
    ? tasks.map((task) => task.parentTaskId === parentTaskId ? { ...task, parentTaskId: null } : task)
    : tasks;
}

/** Remove the durable deletion from every renderer snapshot that can be saved again. */
type TaskDeletionState = Omit<WorkspaceSessionState, "terminalDocked" | "providerGoalByTask"> & Pick<Partial<WorkspaceSessionState>, "providerGoalByTask">;

export function removeDeletedFleetTask<T extends TaskDeletionState>(state: T, taskId: string): T {
  const tasks = releaseChildren(state.tasks.filter((task) => task.id !== taskId), taskId);
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
    const current = state.activeWorkspaceId === target.workspaceId;
    const next = current ? removeDeletedFleetTask(state, target.taskId) : state;
    return {
      ...next,
      tasks: releaseChildren(next.tasks, target.taskId),
      taskWorkspaceIdById: withoutKey(state.taskWorkspaceIdById, target.taskId),
      notifications: state.notifications.filter((item) => item.taskId !== target.taskId),
      workspaceRuntimeCacheById: Object.fromEntries(Object.entries(state.workspaceRuntimeCacheById).map(([id, session]) => [id, id === target.workspaceId ? removeDeletedFleetTask(session,target.taskId) : { ...session, tasks: releaseChildren(session.tasks,target.taskId) }])),
      workspaceSnapshotVersion: current ? state.workspaceSnapshotVersion + 1 : state.workspaceSnapshotVersion,
    };
  });
  useFleetWorkspaceShellsStore.setState((state) => {
    return { byWorkspaceId: Object.fromEntries(Object.entries(state.byWorkspaceId).map(([id, entry]) => {
      if (entry?.status !== "loaded" || !entry.shell) return [id,entry];
      const tasks = id === target.workspaceId ? entry.shell.tasks.filter((task) => task.id !== target.taskId) : entry.shell.tasks;
      return [id, { status: "loaded" as const, shell: { ...entry.shell, tasks: releaseChildren(tasks,target.taskId),
        openTaskTabIds: id === target.workspaceId ? entry.shell.openTaskTabIds?.filter((taskId) => taskId !== target.taskId) : entry.shell.openTaskTabIds } }];
    })) };

  });
  return result;
}

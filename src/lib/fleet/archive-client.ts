import { useAppStore } from "@/store/app.store";
import { isTaskArchived, isTaskManaged } from "@/lib/tasks";
export interface FleetTaskTarget { repositoryPath: string; workspaceId: string; taskId: string }
/** Serialize workspace transitions; lifecycle actions retain their existing guards. */
const archiveVersions = new Map<string, string>();
export function fleetArchiveVersion(target: FleetTaskTarget) { return archiveVersions.get(JSON.stringify(target)); }
let queue: Promise<unknown> = Promise.resolve();
export function inFleetWorkspace<T>(target: FleetTaskTarget, apply: () => Promise<T> | T): Promise<T> {
  const operation = queue.then(async () => {
    const original = useAppStore.getState();
    const originalRepository = original.repositoryPath;
    const originalWorkspace = original.activeWorkspaceId;
    try {
      if (original.repositoryPath !== target.repositoryPath) await original.openRepository({ repositoryPath: target.repositoryPath });
      if (useAppStore.getState().activeWorkspaceId !== target.workspaceId) await useAppStore.getState().switchWorkspace({ workspaceId: target.workspaceId });
      return await apply();
    } finally {
      if (originalRepository && originalRepository !== useAppStore.getState().repositoryPath) await useAppStore.getState().openRepository({ repositoryPath: originalRepository });
      if (originalWorkspace && originalWorkspace !== useAppStore.getState().activeWorkspaceId) await useAppStore.getState().switchWorkspace({ workspaceId: originalWorkspace });
    }
  });
  queue = operation.catch(() => {});
  return operation;
}
export function archiveFleetTask(target: FleetTaskTarget, restore = false, expectedArchivedAt?: string): Promise<string | null> {
  return inFleetWorkspace(target, () => {
      const state = useAppStore.getState();
      const task = state.tasks.find((item) => item.id === target.taskId);
      if (!task || isTaskManaged(task)) return "protected";
      if (restore) {
        if (!isTaskArchived(task) || (expectedArchivedAt && task.archivedAt !== expectedArchivedAt)) return "changed";
        state.restoreTask({ taskId: target.taskId });
      } else {
        if (isTaskArchived(task)) return "changed";
        state.archiveTask({ taskId: target.taskId });
      }
      const saved = useAppStore.getState().tasks.find((item) => item.id === target.taskId);
      if (!restore && saved?.archivedAt) archiveVersions.set(JSON.stringify(target), saved.archivedAt);
      return saved && isTaskArchived(saved) !== restore ? null : "changed";
  });
}

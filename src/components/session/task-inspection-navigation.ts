import { taskPanelLayoutPatch } from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";

/** Open one task's Task panel, selecting the task first when it is not the active one. */
export function openTaskInspection(workspaceId: string, taskId: string) {
  const state = useAppStore.getState();
  if (
    state.activeWorkspaceId !== workspaceId ||
    !state.tasks.some((task) => task.id === taskId)
  )
    return;
  if (state.activeTaskId !== taskId) state.selectTask({ taskId });
  useAppStore.getState().setLayout({ patch: taskPanelLayoutPatch() });
}

import { taskPanelLayoutPatch, type TaskPanelTab } from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";

/** Open one task's Task panel on a tab, without a second tab-selection store. */
export function openTaskInspection(
  workspaceId: string,
  taskId: string,
  tab: TaskPanelTab,
) {
  const state = useAppStore.getState();
  if (
    state.activeWorkspaceId !== workspaceId ||
    !state.tasks.some((task) => task.id === taskId)
  )
    return;
  if (state.activeTaskId !== taskId) state.selectTask({ taskId });
  useAppStore.getState().setLayout({ patch: taskPanelLayoutPatch(tab) });
}

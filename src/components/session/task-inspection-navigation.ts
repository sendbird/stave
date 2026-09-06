import { useAppStore } from "@/store/app.store";

/** Open a task-owned destination without a second tab-selection store. */
export function openTaskInspection(
  workspaceId: string,
  taskId: string,
  destination: "results" | "collaboration",
) {
  const state = useAppStore.getState();
  if (
    state.activeWorkspaceId !== workspaceId ||
    !state.tasks.some((task) => task.id === taskId)
  )
    return;
  if (state.activeTaskId !== taskId) state.selectTask({ taskId });
  useAppStore.getState().setLayout({
    patch: { sidebarOverlayVisible: true, sidebarOverlayTab: destination },
  });
}

import { paneHost } from "@/components/panes/pane-host-controller";
import type { ReviewScope } from "@/lib/review/review-scope";
import { useAppStore } from "@/store/app.store";
import { useSideChatStore } from "@/store/side-chat-store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";

/**
 * The ways into a task's Review and its side question from outside the task's
 * own surface: the pane header, the command palette, the turn's changed-files
 * card and the shortcuts. Each brings the task's surface to the front first,
 * so what opens is never left behind another tab.
 */
export function bringTaskSurfaceToFront(taskId: string) {
  const { activeSurface } = useAppStore.getState();
  if (activeSurface.kind !== "task" || activeSurface.taskId !== taskId) {
    paneHost.openSurface({ kind: "task", taskId });
  }
}

/** Shows Review for the task, on `scope` when the entry point names one. */
export function openTaskReview(taskId: string, scope?: ReviewScope) {
  if (!taskId) return;
  bringTaskSurfaceToFront(taskId);
  useTaskReviewModeStore.getState().openReview(taskId, scope);
}

/**
 * Shows the task's conversation again and hands the cursor to its composer
 * (the composer takes focus requests for the active task only).
 */
export function showTaskConversation(taskId: string) {
  if (!taskId) return;
  useTaskReviewModeStore.getState().showConversation(taskId);
  useAppStore.setState((state) => ({ promptFocusNonce: state.promptFocusNonce + 1 }));
}

/** Switches the task between its conversation and Review. */
export function toggleTaskReview(taskId: string) {
  if (!taskId) return;
  bringTaskSurfaceToFront(taskId);
  useTaskReviewModeStore.getState().toggle(taskId);
}

/** Opens the task's side question panel and moves focus to its question field. */
export function openTaskSideQuestion(taskId: string) {
  if (!taskId) return;
  bringTaskSurfaceToFront(taskId);
  useSideChatStore.getState().open(taskId);
}

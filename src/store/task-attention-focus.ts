import type { StoreApi } from "zustand";
import type { TaskAttentionTarget } from "@/lib/fleet/task-attention";
import { taskPanelLayoutPatch } from "@/lib/right-rail-panels";
import type { AppState } from "./app-store.types";
import { useTaskReviewModeStore } from "./task-review-mode-store";
import { openTarsAt } from "./tars-notification-focus-store";

export function focusTaskAttentionTarget({ taskId, target, get, set }: {
  taskId: string;
  target: TaskAttentionTarget;
  get: StoreApi<AppState>["getState"];
  set: StoreApi<AppState>["setState"];
}) {
  const review = useTaskReviewModeStore.getState();
  switch (target.kind) {
    case "tars":
      openTarsAt(target.decisionId
        ? { kind: "decision", responsibilityId: target.responsibilityId, decisionId: target.decisionId }
        : { kind: "report", responsibilityId: target.responsibilityId });
      break;
    case "stage":
      review.openReview(taskId, { kind: "stage", ...target.stage });
      break;
    case "turn":
      review.openReview(taskId, { kind: "turn", taskId, turnId: target.turnId });
      break;
    case "run":
      set((state) => ({
        focusAgentRunRequest: { taskId, agentRunId: target.agentRunId, notificationId: target.notificationId, nonce: (state.focusAgentRunRequest?.nonce ?? 0) + 1 },
      }));
      get().setLayout({ patch: taskPanelLayoutPatch() });
      break;
    case "request":
      review.showConversation(taskId);
      set((state) => ({
        focusTranscriptToolRequest: {
          taskId, decision: { messageId: target.messageId, requestId: target.requestId },
          nonce: (state.focusTranscriptToolRequest?.nonce ?? 0) + 1,
        },
      }));
      break;
    case "approval":
    case "delegated":
      review.showConversation(taskId);
      set((state) => ({
        focusPendingInteractionRequest: {
          taskId, exact: target, nonce: (state.focusPendingInteractionRequest?.nonce ?? 0) + 1,
        },
      }));
      break;
  }
}

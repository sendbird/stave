import type { FleetAttentionItem } from "./attention-projection";

export type TaskAttentionTarget =
  | { kind: "approval"; requestId: string }
  | { kind: "request"; requestId: string; messageId?: string }
  | { kind: "delegated"; requestId: string; notificationId: string }
  | { kind: "stage"; stage: NonNullable<FleetAttentionItem["agentRunStage"]> }
  | { kind: "run"; agentRunId: string; notificationId?: string }
  | { kind: "turn"; turnId: string }
  | { kind: "tars"; responsibilityId: string; decisionId?: string };

export function taskAttentionTarget(item: FleetAttentionItem, delegated = false): TaskAttentionTarget | null {
  if (item.tarsResponsibilityId) {
    return { kind: "tars", responsibilityId: item.tarsResponsibilityId, decisionId: item.tarsDecisionId };
  }
  if (item.agentRunStage) {
    return item.kind === "agent-run-sign-off"
      ? { kind: "stage", stage: item.agentRunStage }
      : { kind: "run", agentRunId: item.agentRunStage.agentRunId, notificationId: item.agentRunNotificationId };
  }
  if (item.requestId && (item.kind === "approval" || item.kind === "user-input")) {
    if (delegated) return item.notificationId
      ? { kind: "delegated", requestId: item.requestId, notificationId: item.notificationId } : null;
    return item.kind === "approval"
      ? { kind: "approval", requestId: item.requestId }
      : { kind: "request", requestId: item.requestId, messageId: item.messageId };
  }
  const turnId = item.turnId ?? item.resultReview?.turnId;
  return turnId ? { kind: "turn", turnId } : null;
}

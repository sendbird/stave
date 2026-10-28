import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AppNotification } from "@/lib/notifications/notification.types";

/** A run only owns the turns linked to it, including a failed turn between retries. */
export function isSupervisedTaskTurn(detail: AgentRunDetail, taskId: string, turnId: string) {
  const run = detail.agentRun;
  if (run.leadTaskId !== taskId || (run.state !== "running" && run.state !== "paused") ||
      run.pauseReason === "taken-over" || run.pauseReason === "paused-by-user") return false;
  // Stage facts also collect user turns; that observation is not run ownership.
  if (detail.events.some((event) => event.kind === "user-turn" && event.detail.turnId === turnId)) return false;
  return detail.stages.some((stage) => stage.facts?.currentTurnId === turnId || stage.report?.turnId === turnId) ||
    detail.events.some((event) => (event.kind === "turn-started" || event.kind === "turn-linked") && event.detail.turnId === turnId);
}

/** Matches the persisted snooze even when the run detail is no longer cached. */
export function agentRunNotificationAttentionId(notification: AppNotification) {
  const { agentRunId, stageId, attempt } = notification.payload;
  const kind = notification.kind === "agent_run.sign_off_requested" ? "agent-run-sign-off"
    : notification.kind === "agent_run.blocked" ? "agent-run-blocked"
    : notification.kind === "agent_run.stuck" ? "agent-run-stuck" : null;
  if (!kind || typeof agentRunId !== "string" || typeof stageId !== "string" || typeof attempt !== "number") return null;
  return ["agent-run", kind, agentRunId, stageId, attempt,
    ...(kind === "agent-run-sign-off" ? [] : [notification.id])].join(":");
}

import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { currentStageRecord } from "@/lib/agent-runs/domain";
import { awaitsUsageReset } from "@/lib/agent-runs/usage-limit";
import type { AppNotification } from "@/lib/notifications/notification.types";

/**
 * Why a running or paused agent run waits on the user, or null: its current
 * stage awaits sign-off, blocked or got stuck while it runs, or it paused for
 * anything but the user's own pause, a take-over or a usage reset it resumes
 * from by itself. Fleet's agent-run rows and Tars's reading of a run's helpers
 * both use this one rule, so the two cannot disagree about a helper.
 */
export function activeAgentRunAttentionKind(detail: Pick<AgentRunDetail, "agentRun" | "stages">):
  "agent-run-sign-off" | "agent-run-blocked" | "agent-run-stuck" | null {
  const { agentRun } = detail;
  if (agentRun.state === "paused") {
    return agentRun.pauseReason !== "paused-by-user" && agentRun.pauseReason !== "taken-over" &&
      !(agentRun.pauseReason === "usage-limit" && awaitsUsageReset(agentRun)) ? "agent-run-blocked" : null;
  }
  if (agentRun.state !== "running") return null;
  const status = currentStageRecord(detail).status;
  return status === "awaiting-sign-off" ? "agent-run-sign-off"
    : status === "blocked" ? "agent-run-blocked"
      : status === "stuck" ? "agent-run-stuck" : null;
}

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

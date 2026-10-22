import type { AgentRunDetail } from "./api";
import { currentStageRecord } from "./domain";

/**
 * When the user's part in an agent run's current stage began.
 *
 * A sign-off waits from the moment the stage before it ended, or the agent run
 * resumed. A blocked or stuck stage waits from the event that stopped this
 * attempt. Without such an event (it scrolled out of the loaded tail) the run's
 * last update is the closest recorded time.
 *
 * used by: `listWaitingSignOffs` (`src/store/fleet-agent-runs-store.ts`) and
 * Fleet's attention projection (`src/lib/fleet/attention-projection.ts`).
 */
export function resolveAgentRunAttentionSince(detail: AgentRunDetail): string {
  const record = currentStageRecord(detail);
  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    const event = detail.events[index]!;
    if (record.status === "awaiting-sign-off") {
      if (
        event.kind === "stage-completed" ||
        event.kind === "stage-skipped" ||
        event.kind === "resumed"
      ) {
        return event.createdAt;
      }
      continue;
    }
    const stopsThisAttempt =
      (record.status === "blocked" && event.kind === "stage-blocked") ||
      (record.status === "stuck" && event.kind === "stage-stuck");
    if (
      stopsThisAttempt &&
      event.detail.stageId === record.stageId &&
      event.detail.attempt === record.attempt
    ) {
      return event.createdAt;
    }
  }
  return detail.agentRun.updatedAt;
}

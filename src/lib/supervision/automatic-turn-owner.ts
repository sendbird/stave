import { i18n } from "@/i18n/runtime";
/**
 * One source of automatic turns per task.
 *
 * Wake-ups and agent runs both start turns on a task nobody is typing in. Two of
 * them on one task would race each other's turns, so at most one supervisor
 * entry owns a task's automatic turns at a time, and an agent run outranks a
 * wake-up: while an agent run runs, the task's wake-up pauses with
 * `agent-run-active` and resumes on its own when the agent run ends.
 *
 * Boundary statement (taxonomy): at most one supervisor entry starts automatic
 * turns on a task at a time.
 *
 * Pure. Relative imports only, like `wake-up-policy.ts`, which the host
 * service bundles.
 */

export type AutomaticTurnOwner =
  | { kind: "agentRun"; agentRunId: string }
  | { kind: "wake-up"; wakeUpId: string }
  | null;

export interface AutomaticTurnCandidates {
  /** The task's running or paused agent run, if any. */
  activeAgentRun: { id: string } | null;
  /** The task's wake-up, if any, with its state. */
  wakeUp: { id: string; state: "scheduled" | "paused" | "stopped" } | null;
}

export function resolveAutomaticTurnOwner(
  candidates: AutomaticTurnCandidates,
): AutomaticTurnOwner {
  if (candidates.activeAgentRun) {
    return { kind: "agentRun", agentRunId: candidates.activeAgentRun.id };
  }
  if (candidates.wakeUp && candidates.wakeUp.state === "scheduled") {
    return { kind: "wake-up", wakeUpId: candidates.wakeUp.id };
  }
  return null;
}

// i18n-ignore: legacy exported English message; display callers translate at use time
export const AGENT_RUN_ACTIVE_WAKE_UP_DETAIL =
  "A run is running on this task. This schedule resumes when the run ends.";

// i18n-ignore: canonical exported lifecycle message used by persistence
export const AGENT_RUN_ACTIVE_WAKE_UP_REFUSAL = "This task has an active run, which starts its turns. Add a schedule after the run ends.";

// i18n-ignore: canonical exported lifecycle message used by persistence
export const SECOND_AGENT_RUN_REFUSAL = "This task already has an active run. Cancel it or wait for it to end before starting another.";

/** The sentence a wake-up create, update or resume is refused with, if any. */
export function refuseWakeUpForAgentRun(
  activeAgentRun: { id: string } | null,
): string | null {
  return activeAgentRun ? i18n.t("agentRuns:automaticTurnOwner.extraCopy406") : null;
}

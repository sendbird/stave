import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import type { FleetDisplayStatus } from "@/lib/fleet/task-status";

/**
 * The attention kinds that are a state of agent work, as the work state
 * `StateMark` draws for them, so the sidebar and the Fleet inbox show a need
 * the way every other surface shows that state. Pull request and result kinds
 * are not agent states and keep their own marks.
 */
export const FLEET_ATTENTION_WORK_STATE: Partial<Record<FleetAttentionKind, WorkState>> = {
  "user-input": "needs-you",
  approval: "approval",
  "run-failed": "failed",
  "turn-stalled": "halted",
  "agent-run-sign-off": "needs-you",
  "agent-run-blocked": "halted",
  "agent-run-stuck": "halted",
};

/** Each Fleet task status as a shared work state, for board rows and the table. */
export const FLEET_TASK_WORK_STATE: Record<FleetDisplayStatus, WorkState> = {
  "waiting-input": "needs-you",
  "waiting-approval": "approval",
  error: "failed",
  // Quiet, not failed: the stopped-short glyph, never the failure one.
  stalled: "halted",
  running: "working",
  idle: "idle",
  unknown: "unknown",
};

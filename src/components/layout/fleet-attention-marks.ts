import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";

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
  "agent-run-sign-off": "needs-you",
  "agent-run-blocked": "halted",
  "agent-run-stuck": "halted",
};

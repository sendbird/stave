import type { BadgeTone } from "./Badge";
import type { StatusDotTone } from "./StatusDot";

/** Badge tones used by the shared agent-state vocabulary. */
export type AgentStatusTone = Exclude<BadgeTone, "info" | "warm">;

/**
 * The lifecycle of one unit of agent work — a tool invocation, a reasoning
 * pass, a plan step, an approval gate.
 *
 * `ToolCall` and `Reasoning` each shipped their own copy of this union and of
 * the two lookup tables below. The copies had already drifted: `ToolCall` knew
 * `completed`, `error`, and `canceled`; `Reasoning` did not, and it labelled
 * `approval` "Approval" where `ToolCall` said "Awaiting approval". Two names
 * for one state is a bug you cannot see in a diff, so the union and its tables
 * live here once and both components import them.
 */
export type AgentRunState =
  | "pending"
  | "queued"
  | "running"
  | "approval"
  | "completed"
  | "done"
  | "failed"
  | "error"
  | "retrying"
  | "denied"
  | "checkpointed"
  | "resumed"
  | "interrupted"
  | "canceled";

/** Human-readable label for a run state. */
export const agentStateLabel: Record<AgentRunState, string> = {
  approval: "Awaiting approval",
  canceled: "Canceled",
  checkpointed: "Checkpointed",
  completed: "Completed",
  denied: "Denied",
  done: "Completed",
  error: "Error",
  failed: "Failed",
  interrupted: "Interrupted",
  pending: "Pending",
  queued: "Queued",
  retrying: "Retrying",
  resumed: "Resumed",
  running: "Running",
};

/** Semantic tone for a run state, for status-bearing `Badge` compositions. */
export const agentStateTone: Record<AgentRunState, AgentStatusTone> = {
  approval: "warning",
  canceled: "neutral",
  checkpointed: "accent",
  completed: "success",
  denied: "danger",
  done: "success",
  error: "danger",
  failed: "danger",
  interrupted: "warning",
  pending: "neutral",
  queued: "neutral",
  retrying: "accent",
  resumed: "accent",
  running: "accent",
};

/** The same tone narrowed to what `StatusDot` accepts. */
export const agentStateDotTone: Record<AgentRunState, StatusDotTone> = {
  approval: "warning",
  canceled: "neutral",
  checkpointed: "accent",
  completed: "success",
  denied: "danger",
  done: "success",
  error: "danger",
  failed: "danger",
  interrupted: "warning",
  pending: "neutral",
  queued: "neutral",
  retrying: "accent",
  resumed: "accent",
  running: "accent",
};

/**
 * Whether a state is one the user has to *do* something about, or one that
 * ended badly.
 *
 * This is the quiet-state rule in one predicate. A flat agent row shows a
 * `StatusDot` plus a screen-reader label and nothing else, because a column of
 * green "Completed" pills is chrome with no information in it. A dotted
 * `Badge` — the loud form — appears only where this returns `true`. Components
 * must not hard-code their own list; the whole point is that "which states are
 * loud" is one decision.
 */
export function isAttentionState(state: AgentRunState): boolean {
  return (
    state === "approval" ||
    state === "denied" ||
    state === "failed" ||
    state === "error" ||
    state === "interrupted" ||
    state === "canceled"
  );
}

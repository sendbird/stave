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
  | "canceled"
  /**
   * Work that did not run, or a result that was omitted on purpose.
   * Distinct from `canceled`: nobody aborted a live run. Distinct from
   * `denied`: nobody refused it. File-change rows use this when the provider
   * applied (or could not snapshot) a path but skipped the inline diff.
   */
  | "skipped";

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
  skipped: "Skipped",
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
  skipped: "warning",
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
  skipped: "warning",
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

/**
 * Whether the status WORD is chrome rather than information.
 *
 * `isAttentionState` above answers "is this loud", and `statusWordTone` in
 * `ToolRun.parts` already spends that answer once: a finished run takes neutral
 * ink instead of success green, so a column of settled rows does not out-shout
 * the one that failed. This is the same argument carried to its conclusion. A
 * run that ended the way it was supposed to end says nothing by saying
 * "Completed" — the row is there, its clock stopped, its output is under it —
 * and eight of them in a transcript is eight repetitions of the only outcome
 * that needed no reporting. Neutral ink made the word quiet; it did not make it
 * stop being read.
 *
 * So the word is removed from the page for exactly these two states and kept in
 * the accessibility tree, where a screen-reader user is stepping through rows
 * one at a time and "Completed" is genuinely the answer to "what happened to
 * this one". Every other state — including the live ones, which carry a
 * `Loader`, and `checkpointed`/`resumed`, which report a thing the reader did
 * not ask for — keeps its visible word.
 *
 * This is deliberately NOT the complement of `isAttentionState`: `pending`,
 * `queued` and `running` are neither loud nor quiet, and a running row that
 * said nothing at all would be indistinguishable from a settled one.
 */
export function isQuietState(state: AgentRunState): boolean {
  return state === "completed" || state === "done";
}

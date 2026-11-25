import type { AgentStep, AgentStepKind } from "./agent-progress.types";

/**
 * Steps in the order they started. A step without a start time keeps its
 * place after the step before it, and equal times keep their arrival order,
 * so a step never moves once it is shown, whatever its status becomes.
 */
export function sortAgentSteps(steps: readonly AgentStep[]): AgentStep[] {
  let carried = Number.NEGATIVE_INFINITY;
  return steps
    .map((step, index) => {
      if (step.startedAt !== undefined && Number.isFinite(step.startedAt)) {
        carried = Math.max(carried, step.startedAt);
      }
      return { step, index, at: step.startedAt ?? carried };
    })
    .sort((left, right) => left.at - right.at || left.index - right.index)
    .map(({ step }) => step);
}

/** Kinds that fold into a quiet block when they follow one another. */
const QUIET_KINDS: ReadonlySet<AgentStepKind> = new Set(["tool", "thinking"]);

export function isQuietStep(step: AgentStep): boolean {
  return QUIET_KINDS.has(step.kind);
}

/** A running or failed step: never hidden, even inside a folded block. */
export function isPinnedStep(step: AgentStep): boolean {
  return step.status === "running" || step.status === "error";
}

export type AgentStepBlock =
  /**
   * Consecutive tool and thinking steps as one quiet block. Folded, it shows a
   * summary and its `pinned` steps; open, every step in order.
   */
  | { type: "quiet"; id: string; steps: AgentStep[]; pinned: AgentStep[] }
  /** Text, messages, notes and subagents stand alone. */
  | { type: "step"; id: string; step: AgentStep };

/**
 * The progress list's blocks. Ordering is the caller's (`sortAgentSteps`);
 * folding never reorders, so a block's steps are contiguous in the list.
 */
export function foldAgentSteps(steps: readonly AgentStep[]): AgentStepBlock[] {
  const blocks: AgentStepBlock[] = [];
  let quiet: AgentStep[] = [];
  const flush = () => {
    if (quiet.length === 0) return;
    blocks.push({ type: "quiet", id: `quiet:${quiet[0]!.id}`, steps: quiet, pinned: quiet.filter(isPinnedStep) });
    quiet = [];
  };
  for (const step of steps) {
    if (isQuietStep(step)) {
      quiet.push(step);
      continue;
    }
    flush();
    blocks.push({ type: "step", id: step.id, step });
  }
  flush();
  return blocks;
}

/** The step an agent is on: the newest running step, else nothing. */
export function findCurrentStep(steps: readonly AgentStep[]): AgentStep | undefined {
  return steps.findLast((step) => step.status === "running");
}

/** Steps counted as work: tool calls and the subagents it started. */
export function countWorkSteps(steps: readonly AgentStep[]): number {
  return steps.filter((step) => step.kind === "tool" || step.kind === "subagent").length;
}

/**
 * How many steps arrived since the reader left the bottom: the steps not in
 * the set seen then. A step that only changed status is not new.
 */
export function countUnseenSteps(seenIds: ReadonlySet<string> | null, steps: readonly AgentStep[]): number {
  if (!seenIds) return 0;
  let count = 0;
  for (const step of steps) if (!seenIds.has(step.id)) count += 1;
  return count;
}

/** The longest detail an opened row renders; the rest is cut with a notice. */
export const STEP_DETAIL_MAX_CHARS = 16_000;

export function boundStepDetail(text: string | undefined, max = STEP_DETAIL_MAX_CHARS): { text: string; truncated: boolean } {
  const value = text ?? "";
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}

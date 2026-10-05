import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import { isReviewDelegation } from "@/lib/reviews/review-task";
import {
  isActiveDelegatedTaskPhase,
  type DelegatedTaskSummary,
} from "@/lib/runs/delegated-task";

const MAX_RENDERED_CHILDREN = 20;
const MAX_RESULT_CHARS = 2_000;
const MAX_RESULTS_TOTAL_CHARS = 8_000;

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/** The newest start of an assistant turn in a history, as a results cut-off. */
export function latestTurnStartedAt(
  history: readonly { role: string; startedAt?: string }[],
): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]!;
    if (message.role === "assistant" && message.startedAt) return message.startedAt;
  }
  return null;
}

/**
 * What the task's subagents did, as its next turn sees it: each subagent's
 * identity, phase and reason, and the bounded answer of every subagent that
 * finished since `resultsSince` (the previous turn's start), so the caller
 * never has to read a child task to collect its result. Answers it already
 * saw are left out to keep repeated turns small, and so is the answer of a
 * child the user attached to this message, which arrives in full there. A
 * review the user started from the composer is shared only when attached:
 * its row stays, its answer does not.
 */
export function buildDelegatedTaskReceiptsRetrievedContext(args: {
  children: DelegatedTaskSummary[];
  resultsSince?: string | null;
  attachedTaskIds?: ReadonlySet<string>;
}): CanonicalRetrievedContextPart | null {
  if (args.children.length === 0) {
    return null;
  }
  const ordered = [...args.children].sort((left, right) => {
    const leftActive = isActiveDelegatedTaskPhase(left.phase) ? 0 : 1;
    const rightActive = isActiveDelegatedTaskPhase(right.phase) ? 0 : 1;
    return (
      leftActive - rightActive || right.updatedAt.localeCompare(left.updatedAt)
    );
  });
  const rendered = ordered.slice(0, MAX_RENDERED_CHILDREN);
  let resultBudget = MAX_RESULTS_TOTAL_CHARS;
  const lines = rendered.flatMap((child) => {
    const head = [
      `- subagent: ${child.delegationKey}`,
      `phase: ${child.phase}`,
      `lifecycle: ${child.lifecycle}`,
      `provider: ${child.providerId}`,
    ].join(" | ");
    const identity = `  task: ${child.delegatedTaskId} in workspace ${child.delegatedWorkspaceId}`;
    const reason = child.reason
      ? [`  reason: ${truncate(child.reason, 300)}`]
      : [];
    const fresh = child.result &&
      (!args.resultsSince || child.updatedAt > args.resultsSince) && resultBudget > 0;
    const attached = fresh && args.attachedTaskIds?.has(child.delegatedTaskId);
    const withheld = fresh && !attached && isReviewDelegation(child);
    const result = fresh && !attached && !withheld
      ? truncate(child.result!, Math.min(MAX_RESULT_CHARS, resultBudget))
      : null;
    if (result) resultBudget -= result.length;
    return [
      head,
      identity,
      ...reason,
      ...(attached ? ["  result: attached to this message under Attached Stave Tasks"] : []),
      ...(withheld ? ["  result: held until the user attaches this review"] : []),
      ...(result ? ["  result:", ...result.split("\n").map((line) => `    ${line}`)] : []),
    ];
  });
  const omitted = ordered.length - rendered.length;

  return {
    type: "retrieved_context",
    sourceId: "stave:delegated-tasks",
    // i18n-ignore: model-facing context metadata and instructions
    title: "Subagent results",
    content: [
      "Subagents this task started, as recorded on the run ledger, with the answer of each one that finished since your last turn.",
      "Review results before reporting the task complete. Use `stave_follow_up_delegated_task` to ask an open subagent for more, and `stave_stop_delegated_task` to stop one.",
      "",
      ...lines,
      ...(omitted > 0 ? ["", `(${omitted} older subagents omitted)`] : []),
    ].join("\n"),
  };
}

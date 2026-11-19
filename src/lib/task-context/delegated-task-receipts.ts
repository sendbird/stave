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

function resultKey(child: DelegatedTaskSummary) {
  return JSON.stringify([child.delegatedTaskId, child.delegatedTurnId, child.updatedAt]);
}

function readResult(child: DelegatedTaskSummary) {
  const args = {
    workspaceId: child.delegatedWorkspaceId,
    taskId: child.delegatedTaskId,
    ...(child.delegatedTurnId ? { turnId: child.delegatedTurnId } : {}),
  };
  return `read the full answer with stave_get_task(${JSON.stringify(args)})`;
}

/** Receipt keys are recorded on the parent message alongside the turn they describe. */
export function buildDelegatedTaskReceiptsRetrievedContext(args: {
  children: DelegatedTaskSummary[];
  history?: readonly { deliveredResultKeys?: string[] }[];
  deliveredResultKeys?: string[];
  attachedTaskIds?: ReadonlySet<string>;
}): CanonicalRetrievedContextPart | null {
  if (args.children.length === 0) {
    return null;
  }
  const seen = new Set(args.history?.flatMap((message) => message.deliveredResultKeys ?? []));
  const pending = (child: DelegatedTaskSummary) => Boolean(
    child.result && !seen.has(resultKey(child)) &&
    !args.attachedTaskIds?.has(child.delegatedTaskId) && !isReviewDelegation(child),
  );
  const ordered = [...args.children].sort((left, right) => {
    const leftActive = isActiveDelegatedTaskPhase(left.phase) ? 0 : 1;
    const rightActive = isActiveDelegatedTaskPhase(right.phase) ? 0 : 1;
    return (
      leftActive - rightActive ||
      Number(pending(right)) - Number(pending(left)) ||
      right.updatedAt.localeCompare(left.updatedAt)
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
    const attached = child.result && args.attachedTaskIds?.has(child.delegatedTaskId);
    const withheld = child.result && !attached && isReviewDelegation(child);
    const fitsPreview = resultBudget > 1 || child.result?.length === resultBudget;
    const result = pending(child) && fitsPreview
      ? truncate(child.result!, Math.min(MAX_RESULT_CHARS, resultBudget))
      : null;
    if (result) resultBudget -= result.length;
    if (result || attached) args.deliveredResultKeys?.push(resultKey(child));
    const notice = pending(child) && result !== child.result
      ? [`  result ${result ? "truncated" : "omitted"}; ${readResult(child)}`]
      : [];
    return [
      head,
      identity,
      ...reason,
      ...notice,
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
      "Subagents this task started, with newly delivered answers.",
      "Review results before reporting the task complete. Use `stave_follow_up_delegated_task` to ask an open subagent for more, and `stave_stop_delegated_task` to stop one.",
      "",
      ...lines,
      ...ordered.slice(MAX_RENDERED_CHILDREN).filter(pending).map((child) =>
        `Deferred result for ${child.delegationKey}: result omitted; ${readResult(child)}`),
      ...(omitted > 0 ? ["", `(${omitted} older subagents omitted)`] : []),
    ].join("\n"),
  };
}

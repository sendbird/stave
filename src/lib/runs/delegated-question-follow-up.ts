import { snapshotProviderAccounts } from "@/lib/providers/provider-account-selection";
import type { ProviderAccountSelection } from "@/lib/providers/provider-account-selection";
import {
  resolveDelegatedTaskControls,
  type DelegatedTaskSummary,
} from "@/lib/runs/delegated-task";
import {
  buildDelegatedTaskExpectedIdentity,
  resolveDelegatedTaskActionError,
} from "@/lib/runs/delegated-task-view";

/**
 * What became of an answer to a delegated child's asynchronous question.
 *
 * - `sent`: the delegation took it as the child's next turn.
 * - `running`: the child is still working; the same answer can be sent after
 *   it stops.
 * - `closed`: no delegation can carry it any more (it ended, was cancelled, or
 *   no longer accepts follow-ups), so the question can no longer be answered.
 * - `refused`: the delegation refused this follow-up; `message` says why.
 */
export type DelegatedQuestionFollowUp =
  | { status: "sent" }
  | { status: "running" }
  | { status: "closed" }
  | { status: "refused"; message: string };

/**
 * A managed child takes messages only from its controller. For a delegated
 * child that controller is the parent's delegation, so an answer to the
 * child's asynchronous question is sent the way the parent's own Follow up
 * control sends one: as a follow-up turn of that delegation, checked against
 * the delegation the parent sees now.
 */
export async function sendDelegatedQuestionFollowUp(args: {
  parentTaskId: string;
  taskId: string;
  prompt: string;
  accounts?: ProviderAccountSelection;
}): Promise<DelegatedQuestionFollowUp> {
  const runs = window.api?.runs;
  if (!runs?.listDelegatedTasks || !runs.followUpDelegatedTask) {
    return { status: "closed" };
  }
  const listed = await runs.listDelegatedTasks({
    parentTaskId: args.parentTaskId,
    includeFinished: true,
  });
  const child: DelegatedTaskSummary | undefined = listed.find(
    (summary) => summary.delegatedTaskId === args.taskId,
  );
  if (!child) {
    return { status: "closed" };
  }
  if (!resolveDelegatedTaskControls(child).canFollowUp) {
    return child.phase === "pending" || child.phase === "running"
      ? { status: "running" }
      : { status: "closed" };
  }
  const response = await runs.followUpDelegatedTask(
    {
      parentTaskId: args.parentTaskId,
      delegationKey: child.delegationKey,
      prompt: args.prompt,
      expected: buildDelegatedTaskExpectedIdentity(child),
    },
    { accounts: snapshotProviderAccounts(args.accounts) },
  );
  const refusal = resolveDelegatedTaskActionError(response);
  return refusal ? { status: "refused", message: refusal } : { status: "sent" };
}

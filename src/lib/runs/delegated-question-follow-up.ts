import { snapshotProviderAccounts } from "@/lib/providers/provider-account-selection";
import type { ProviderAccountSelection } from "@/lib/providers/provider-account-selection";
import {
  isActiveDelegatedTaskPhase,
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
 * - `sent`: the child's next turn started with it.
 * - `running`: the child is still working; the same answer can be sent after
 *   it stops.
 * - `closed`: no delegation can carry it any more (it ended, was cancelled, or
 *   no longer accepts follow-ups), so the question can no longer be answered.
 * - `refused`: the delegation refused this follow-up; `message` says why.
 * - `not-started`: the delegation accepted it, but the child's turn failed
 *   to start; `message` is the delegation's reason when it gave one.
 * - `unconfirmed`: the delegation accepted it and the child's turn has not
 *   started within the wait. It may still start, so a new answer is refused
 *   as `running` until the child stops.
 */
export type DelegatedQuestionFollowUp =
  | { status: "sent" }
  | { status: "running" }
  | { status: "closed" }
  | { status: "refused"; message: string }
  | { status: "not-started"; message: string | null }
  | { status: "unconfirmed" };

const TURN_START_WAIT_MS = 20_000;
const TURN_START_POLL_MS = 250;

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
  /** For tests: how long to wait for the child's turn, and how often to look. */
  turnStartWaitMs?: number;
  turnStartPollMs?: number;
}): Promise<DelegatedQuestionFollowUp> {
  const runs = window.api?.runs;
  if (!runs?.getDelegatedTaskLink || !runs.followUpDelegatedTask) {
    return { status: "closed" };
  }
  // Looked up by the child itself: a parent's list is bounded, and a
  // delegation pushed out of it by newer ones can still take this answer.
  const readChild = async () => {
    const link = await runs.getDelegatedTaskLink!({ delegatedTaskId: args.taskId });
    return link && link.parentTaskId === args.parentTaskId ? link : null;
  };
  const child: DelegatedTaskSummary | null = await readChild();
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
  if (refusal) return { status: "refused", message: refusal };
  // A supervised child's Run took the reply before the delegation answered.
  if (child.lifecycle === "supervised") return { status: "sent" };
  // Any other child starts its turn after the delegation answers, so the
  // answer is delivered only once that turn has a new id. A start that fails
  // ends the delegation without one.
  const waitMs = args.turnStartWaitMs ?? TURN_START_WAIT_MS;
  const pollMs = args.turnStartPollMs ?? TURN_START_POLL_MS;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const current = await readChild().catch(() => null);
    if (current?.delegatedTurnId && current.delegatedTurnId !== child.delegatedTurnId) {
      return { status: "sent" };
    }
    if (current && !isActiveDelegatedTaskPhase(current.phase)) {
      return { status: "not-started", message: current.reason };
    }
    if (Date.now() >= deadline) return { status: "unconfirmed" };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

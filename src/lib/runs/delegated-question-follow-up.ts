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
 * - `sent`: the child's provider took the answer. That is known from the
 *   child's turn itself: it produced output (text, a tool call or a diff), or
 *   the delegation recorded that turn's answer. A turn id alone is not
 *   enough: it is assigned when the turn is registered, before the provider
 *   accepts the prompt.
 * - `running`: the child is still working; the same answer can be sent after
 *   it stops.
 * - `closed`: no delegation can carry it any more (it ended, was cancelled, or
 *   no longer accepts follow-ups), so the question can no longer be answered.
 * - `refused`: the delegation refused this follow-up; `message` says why.
 * - `not-started`: the delegation accepted it, but the child's turn ended
 *   without output; `message` is the turn's or the delegation's reason.
 * - `unconfirmed`: the child's turn has shown neither within the wait. The
 *   answer is not sent again while this window keeps the attempt: answering
 *   again waits on the same turn.
 */
export type DelegatedQuestionFollowUp =
  | { status: "sent" }
  | { status: "running" }
  | { status: "closed" }
  | { status: "refused"; message: string }
  | { status: "not-started"; message: string | null }
  | { status: "unconfirmed" };

const TURN_EVIDENCE_WAIT_MS = 5 * 60_000;
const TURN_EVIDENCE_POLL_MS = 250;
/** Events a provider emits only after it accepted the prompt (`observeTurnEvent`'s output rule). */
const OUTPUT_EVENT_TYPES = new Set(["text", "tool", "tool_result", "diff"]);

/**
 * Follow-ups this window sent and has not settled, by `attemptKey`: a second
 * answer to the same question waits on the turn the first one started rather
 * than starting another turn with the same answer.
 */
const sentFollowUps = new Map<string, { previousTurnId: string | null }>();

/** Test helper: forget the follow-ups this window sent. */
export function resetDelegatedQuestionFollowUps() {
  sentFollowUps.clear();
}

type TurnEvidence = { output: boolean; done: boolean; error: string | null };

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
  /** Names the question being answered; one follow-up per key at a time. */
  attemptKey: string;
  accounts?: ProviderAccountSelection;
  /** For tests: how long to wait for the child's turn, and how often to look. */
  turnEvidenceWaitMs?: number;
  turnEvidencePollMs?: number;
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
  // Listening starts before the follow-up, so a turn that answers before its
  // id is read is still seen.
  const evidence = new Map<string, TurnEvidence>();
  const unsubscribe = window.api?.localMcp?.subscribeTaskTurnUpdates?.((update) => {
    if (update.taskId !== args.taskId) return;
    const current = evidence.get(update.turnId) ?? { output: false, done: false, error: null };
    if (OUTPUT_EVENT_TYPES.has(update.eventType) || update.terminalReceipt?.outputObserved) current.output = true;
    if (update.done) {
      current.done = true;
      current.error = update.terminalReceipt?.lastError?.message ?? update.terminalReceipt?.error ?? null;
    }
    evidence.set(update.turnId, current);
  });
  try {
    let pending = sentFollowUps.get(args.attemptKey);
    if (!pending) {
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
      pending = { previousTurnId: child.delegatedTurnId };
      sentFollowUps.set(args.attemptKey, pending);
    }
    const outcome = await awaitTurnEvidence({
      readChild,
      evidence,
      previousTurnId: pending.previousTurnId,
      waitMs: args.turnEvidenceWaitMs ?? TURN_EVIDENCE_WAIT_MS,
      pollMs: args.turnEvidencePollMs ?? TURN_EVIDENCE_POLL_MS,
    });
    // An unconfirmed attempt stays, so answering again does not send it twice.
    if (outcome.status !== "unconfirmed") sentFollowUps.delete(args.attemptKey);
    return outcome;
  } finally {
    unsubscribe?.();
  }
}

async function awaitTurnEvidence(args: {
  readChild: () => Promise<DelegatedTaskSummary | null>;
  evidence: ReadonlyMap<string, TurnEvidence>;
  previousTurnId: string | null;
  waitMs: number;
  pollMs: number;
}): Promise<DelegatedQuestionFollowUp> {
  const deadline = Date.now() + args.waitMs;
  for (;;) {
    // An unreadable link is unknown, not ended: look again.
    const current = await args.readChild().catch(() => undefined);
    const turnId = current?.delegatedTurnId && current.delegatedTurnId !== args.previousTurnId
      ? current.delegatedTurnId : null;
    const seen = turnId ? args.evidence.get(turnId) : undefined;
    if (seen?.output || (turnId && current?.resultTurnId === turnId)) {
      return { status: "sent" };
    }
    if (seen?.done) {
      return { status: "not-started", message: seen.error ?? current?.reason ?? null };
    }
    // Ended without a turn of its own, or without an answer from that turn.
    if (current && !isActiveDelegatedTaskPhase(current.phase)) {
      return { status: "not-started", message: current.reason };
    }
    // The delegation no longer names this child (released or removed).
    if (current === null) return { status: "not-started", message: null };
    if (Date.now() >= deadline) return { status: "unconfirmed" };
    await new Promise((resolve) => setTimeout(resolve, args.pollMs));
  }
}

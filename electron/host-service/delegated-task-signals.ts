/**
 * Read-only views of the delegated tasks a task started, derived from the run
 * ledger rows the delegated-task surface shows.
 *
 * Used by:
 * - `electron/host-service/local-mcp-runtime.ts` (delegated-task receipts in
 *   a parent's turn context, and the wake-up completion feed)
 * - `electron/host-service/supervision/mission-runtime.ts` (a stage cannot
 *   complete while work it delegated is still running), wired in
 *   `electron/host-service.ts`
 */
import {
  DELEGATED_TASK_LIST_LIMIT,
  isActiveDelegatedTaskPhase,
  toDelegatedTaskSummary,
  type DelegatedTaskSummary,
} from "../../src/lib/runs/delegated-task";
import {
  TaskCompletionStatusSchema,
  WAKE_UP_LIMITS,
  type TaskCompletionSignal,
} from "../../src/lib/supervision/wake-up-policy";
import { ensureHostServicePersistenceReady } from "./persistence";

/**
 * Delegated-task receipts for one parent, read straight from the ledger. Returns an
 * empty list rather than throwing: a parent's turn must never fail because its
 * delegation bookkeeping could not be read.
 */
export function listDelegatedTaskSummaries(args: {
  parentTaskId: string;
  limit?: number;
}): DelegatedTaskSummary[] {
  try {
    return ensureHostServicePersistenceReady()
      .listRunAggregatesByOrigin({
        originKind: "task",
        originId: args.parentTaskId,
        limit: args.limit ?? DELEGATED_TASK_LIST_LIMIT,
      })
      .flatMap((aggregate) => {
        const summary = toDelegatedTaskSummary(aggregate);
        return summary ? [summary] : [];
      });
  } catch (error) {
    console.warn(
      `[stave-mcp] failed to read delegated task receipts: ${String(error)}`,
    );
    return [];
  }
}

/**
 * How deep the completion feed reads, as opposed to `DELEGATED_TASK_LIST_LIMIT`,
 * which sizes a panel a human is looking at.
 *
 * These two limits answer different questions. Truncating a *display* list
 * hides rows the user can still go and find; truncating the *completion* feed
 * loses a wake-up permanently, because the supervisor only ever consumes what
 * this read returns.
 *
 * The direction of the safety inequality matters: the supervisor's `fired`-row
 * retention (`minRetainedFiredOccurrences`) must be at least as wide as this
 * window, never the other way around. The retained `fired` rows are the
 * idempotency guard — if this read can still report a completion whose
 * consumed receipt was already pruned, that completion reads as brand new and
 * wakes the task a second time. A completion that ages out of this window
 * unconsumed is lost instead, which is why the window is still generous. The
 * constant lives beside the retention limits so the inequality is pinned by a
 * test rather than re-derived here.
 */
const TASK_COMPLETION_FEED_LIMIT = WAKE_UP_LIMITS.maxCompletionFeedRows;

/**
 * The supervisor's completion feed: delegated runs of one parent that have
 * reached a terminal status.
 *
 * Read-only, and derived from the same ledger rows the delegated-task surface
 * shows, so a completion wake-up can never disagree with what the user sees.
 * The supervisor decides what to do with these; this only reports them.
 */
export function listTaskCompletionSignals(args: {
  taskId: string;
}): TaskCompletionSignal[] {
  return listDelegatedTaskSummaries({
    parentTaskId: args.taskId,
    limit: TASK_COMPLETION_FEED_LIMIT,
  }).flatMap((summary) => {
    // `waiting` is an active phase, so a detached child that parked open
    // after its turn never appears here: only stopping or detaching the
    // delegation settles it into a terminal status. Documented in
    // docs/features/wake-ups.md — a completion wake-up observes
    // delegations that *end*, not detached children between turns.
    if (isActiveDelegatedTaskPhase(summary.phase)) {
      return [];
    }
    const status = TaskCompletionStatusSchema.safeParse(summary.phase);
    if (!status.success) {
      return [];
    }
    return [
      {
        runId: summary.runId,
        stepId: summary.stepId,
        delegatedTaskId: summary.delegatedTaskId,
        providerId: summary.providerId,
        status: status.data,
        reason: summary.reason
          ? summary.reason.slice(0, WAKE_UP_LIMITS.maxReasonChars)
          : null,
        // A terminal step without a `completedAt` is a reconciled one; its
        // `updatedAt` is the instant it settled.
        completedAt: summary.completedAt ?? summary.updatedAt,
        // Part of the signal's identity: a retried attempt that settles
        // again must not be deduped against the first attempt's wake-up.
        attempt: summary.attempt,
      } satisfies TaskCompletionSignal,
    ];
  });
}

/** Delegated tasks of a parent that have not reached a terminal phase. */
export function countActiveDelegatedTasks(args: { parentTaskId: string }): number {
  return listDelegatedTaskSummaries({ parentTaskId: args.parentTaskId }).filter(
    (summary) => isActiveDelegatedTaskPhase(summary.phase),
  ).length;
}

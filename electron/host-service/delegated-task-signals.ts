/**
 * Read-only views of the delegated tasks a task started, derived from the run
 * ledger rows the delegated-task surface shows.
 *
 * Used by:
 * - `electron/host-service/local-mcp-runtime.ts` (delegated-task receipts and
 *   owed answers in a parent's turn context, and the wake-up completion feed)
 * - `electron/host-service/supervision/agent-run-runtime.ts` (a stage cannot
 *   complete while work it delegated is still running), wired in
 *   `electron/host-service.ts`
 */
import {
  DELEGATED_TASK_LIST_LIMIT,
  extractDelegatedTaskDelegationKey,
  delegatedTaskResultReceipt,
  delegatedTaskWaitingReason,
  delegatedTaskWaitsForPerson,
  isActiveDelegatedTaskPhase,
  toDelegatedTaskSummary,
  type DelegatedTaskSummary,
} from "../../src/lib/runs/delegated-task";
import {
  WAKE_UP_LIMITS,
  type TaskCompletionSignal,
} from "../../src/lib/supervision/wake-up-policy";
import { taskCompletionSignalOf } from "../../src/lib/supervision/task-completion-signal";
import type { DelegatedStallSignal } from "../../src/lib/agent-runs/event-wait-observe";
import { ensureHostServicePersistenceReady } from "./persistence";
import {
  collectOwedDelegatedTaskAnswers,
  recordDelegatedTaskAnswersDelivered,
  type DelegatedTaskAnswerRef,
} from "../../src/lib/runs/delegated-task-answers";

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
    const store = ensureHostServicePersistenceReady();
    return store
      .listRunAggregatesByOrigin({
        originKind: "task",
        originId: args.parentTaskId,
        limit: args.limit ?? DELEGATED_TASK_LIST_LIMIT,
      })
      .flatMap((aggregate) => {
        const receipts = store.listRunReceipts({ runId: aggregate.run.id });
        const summary = toDelegatedTaskSummary({
          ...aggregate,
          acceptedReceipt: receipts.find((receipt) => receipt.type === "accepted" && receipt.detail?.attempt === aggregate.step.attempt),
          resultReceipt: delegatedTaskResultReceipt(receipts, aggregate.step),
          waitingReason: delegatedTaskWaitingReason(receipts, aggregate.step),
          waitsForPerson: delegatedTaskWaitsForPerson(receipts, aggregate.step),
        });
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
 * The answers a parent turn owes, read for one host-started turn, and the list
 * the context builder fills with the ones the turn carries. Never throws: a
 * failed read carries no answers this turn and they stay owed.
 */
export function collectDelegatedTaskAnswersForTurn(args: { parentTaskId: string; lastTurnStartedAt: string | null }) {
  const delivered: DelegatedTaskAnswerRef[] = [];
  try {
    const owed = collectOwedDelegatedTaskAnswers(ensureHostServicePersistenceReady(), { ...args, now: new Date().toISOString() });
    return { answers: owed.answers.filter((answer) => !unrecordable.has(answerKey(answer))), moreAnswers: owed.more, delivered };
  } catch (error) {
    console.warn(`[stave-mcp] failed to read owed subagent answers: ${String(error)}`);
    return { answers: [], moreAnswers: 0, delivered };
  }
}

/** Consecutive failed delivery writes after which an answer is no longer carried. */
export const MAX_FAILED_ANSWER_WRITES = 3;
const failedWrites = new Map<string, number>();
/** Answers whose delivery could not be recorded `MAX_FAILED_ANSWER_WRITES` times in a row: not carried again in this process. */
const unrecordable = new Set<string>();
const answerKey = (answer: DelegatedTaskAnswerRef) => `${answer.runId}#${answer.sequence}`;

/**
 * Record the subagent answers a turn carried, once the provider runtime has
 * committed the turn (`setProviderTurnCommittedListener`), for turns started
 * from the composer and by the host alike. A failed write is logged and the
 * answers stay owed: the next turn carries them again, a rare duplicate
 * rather than a lost answer. A store that keeps failing must not resend the
 * same answers every turn: after `MAX_FAILED_ANSWER_WRITES` failed writes in
 * a row an answer is no longer carried, and the answers that crossed that
 * line now are returned for one warning.
 */
export function recordCommittedTurnAnswers(turn: { taskId: string; turnId: string; subagentAnswers: DelegatedTaskAnswerRef[] }): DelegatedTaskAnswerRef[] {
  try {
    recordDelegatedTaskAnswersDelivered(ensureHostServicePersistenceReady(),
      { parentTaskId: turn.taskId, parentTurnId: turn.turnId, answers: turn.subagentAnswers, now: new Date().toISOString() });
    for (const answer of turn.subagentAnswers) failedWrites.delete(answerKey(answer));
    return [];
  } catch (error) {
    console.error(`[delegated-task] could not record ${turn.subagentAnswers.length} subagent answers carried by turn ${turn.turnId}; the next turn carries them again: ${String(error)}`);
    return turn.subagentAnswers.filter((answer) => {
      const key = answerKey(answer);
      const failures = (failedWrites.get(key) ?? 0) + 1;
      failedWrites.set(key, failures);
      if (failures < MAX_FAILED_ANSWER_WRITES || unrecordable.has(key)) return false;
      unrecordable.add(key);
      return true;
    });
  }
}

/** The answers of a parent no longer carried because their delivery could not be recorded; the renderer's turn read drops them too. */
export function listUnrecordableSubagentAnswers(args: { parentTaskId: string }): DelegatedTaskAnswerRef[] {
  return [...unrecordable].flatMap((key) => {
    const at = key.lastIndexOf("#");
    const runId = key.slice(0, at);
    return extractDelegatedTaskDelegationKey({ runId, parentTaskId: args.parentTaskId }) ? [{ runId, sequence: Number(key.slice(at + 1)) }] : [];
  });
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
    const signal = taskCompletionSignalOf(summary);
    return signal ? [signal] : [];
  });
}

/**
 * Delegated work of a parent whose child Run stopped for a person (its stage
 * got stuck or blocked; a usage reset resumes on its own and is not one). The
 * key is that stall's own waiting receipt, so a child that resumes and stops
 * again wakes its parent again, and the same stall never does twice.
 */
/** The stall a waiting step's receipts show, or null; pure so it can be tested on recorded receipts. */
export function delegatedStallReceipt<T extends { type: string; executionId: string | null; detail?: { code?: string } | null }>(
  receipts: readonly T[], step: { status: string; executionId: string | null },
): T | null {
  if (step.status !== "waiting") return null;
  const latest = [...receipts].reverse().find((entry) => entry.type === "waiting" && entry.executionId === step.executionId &&
    (entry.detail?.code === "child-agent-run-waiting" || entry.detail?.code === "child-agent-run-usage-reset"));
  return latest?.detail?.code === "child-agent-run-waiting" ? latest : null;
}

export function listDelegatedStallSignals(args: { taskId: string }): DelegatedStallSignal[] {
  try {
    const store = ensureHostServicePersistenceReady();
    return store.listRunAggregatesByOrigin({ originKind: "task", originId: args.taskId, limit: TASK_COMPLETION_FEED_LIMIT })
      .flatMap((aggregate) => {
        // The latest child wait decides: one that now waits for a usage reset is not a stall,
        // even when an earlier wait of the same execution needed a person.
        const receipt = delegatedStallReceipt(store.listRunReceipts({ runId: aggregate.run.id }), aggregate.step);
        if (!receipt) return [];
        return [{
          runId: aggregate.run.id, stepId: aggregate.step.id, delegatedTaskId: aggregate.step.target?.taskId ?? null,
          providerId: aggregate.step.target?.providerId ?? "unknown",
          reason: receipt.detail?.message ? receipt.detail.message.slice(0, WAKE_UP_LIMITS.maxReasonChars) : null,
          key: receipt.idempotencyKey,
        }];
      });
  } catch (error) {
    console.warn(`[stave-mcp] failed to read stalled delegated work: ${String(error)}`);
    return [];
  }
}

/** Delegated tasks of a parent that have not reached a terminal phase. */
export function countActiveDelegatedTasks(args: { parentTaskId: string }): number {
  return listDelegatedTaskSummaries({ parentTaskId: args.parentTaskId }).filter(
    (summary) => isActiveDelegatedTaskPhase(summary.phase),
  ).length;
}

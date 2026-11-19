import { z } from "zod";
import {
  DelegatedTaskSummarySchema,
  delegatedTaskAnswerTurnId,
  extractDelegatedTaskDelegationKey,
} from "./delegated-task";
import {
  RUN_RESPONSE_TEXT_MAX_CHARS,
  RunIdSchema,
  type RunReceiptRecord,
  type RunStepTarget,
} from "./run-domain";

/**
 * Which subagent answers a parent turn still owes, decided from identities
 * rather than from timestamps or message positions.
 *
 * An answer is one result receipt of a child run: `(runId, sequence)` names
 * it. It is owed until a delivery record names it, written when a parent
 * turn that carried it is committed to its provider (the store is
 * `electron/persistence/delegated-answer-store.ts`). Nothing else counts, so
 * an answer that lands while a turn is being prepared, a newer message without
 * subagent results, an interrupted turn, a restart or a trimmed message window
 * cannot lose or repeat one. The one exception is the upgrade cut, applied once
 * per parent: answers the earlier version had already given (or dropped for its
 * budget) before the parent's latest turn count as delivered.
 */

/** How many owed answers one turn reads; the rest wait and are counted. */
export const DELEGATED_TASK_ANSWER_READ_LIMIT = 40;

export const DelegatedTaskAnswerRefSchema = z
  .object({ runId: RunIdSchema, sequence: z.number().int().min(1) })
  .strict();
export type DelegatedTaskAnswerRef = z.infer<typeof DelegatedTaskAnswerRefSchema>;
/** The answers one turn carries, as its request names them. */
export const DelegatedTaskAnswerRefsSchema = z.array(DelegatedTaskAnswerRefSchema).max(DELEGATED_TASK_ANSWER_READ_LIMIT);

export const DelegatedTaskAnswerSchema = DelegatedTaskAnswerRefSchema.extend({
  delegationKey: DelegatedTaskSummarySchema.shape.delegationKey,
  delegatedTaskId: RunIdSchema,
  delegatedWorkspaceId: RunIdSchema,
  /** The child turn that produced the answer, when it was recorded. */
  turnId: RunIdSchema.optional(),
  /** When the answer was recorded. */
  at: z.string().datetime(),
  text: z.string().min(1).max(RUN_RESPONSE_TEXT_MAX_CHARS),
}).strict();
export type DelegatedTaskAnswer = z.infer<typeof DelegatedTaskAnswerSchema>;

export interface OwedDelegatedTaskAnswers {
  answers: DelegatedTaskAnswer[];
  /** Owed answers beyond the read limit. */
  more: number;
}

export const DelegatedTaskAnswersArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    /** When the parent's most recent turn started; the upgrade cut for answers older than this version. */
    lastTurnStartedAt: z.string().datetime().nullable(),
  })
  .strict();
export type DelegatedTaskAnswersArgs = z.infer<typeof DelegatedTaskAnswersArgsSchema>;

/** `DelegatedAnswerStore` in `electron/persistence/delegated-answer-store.ts`. */
export interface DelegatedTaskAnswerStore {
  startTracking(args: { parentTaskId: string; settledThrough: string | null; now: string }): void;
  listOwed(args: { parentTaskId: string; limit: number }): {
    rows: Array<{ receipt: RunReceiptRecord; target: RunStepTarget; stepExecutionId: string | null; resultArtifactRef: string | null }>;
    total: number;
  };
  recordDelivered(args: { answers: readonly DelegatedTaskAnswerRef[]; parentTurnId: string; now: string }): void;
}

export interface DelegatedTaskAnswerLedger {
  delegatedAnswers: DelegatedTaskAnswerStore;
}

/**
 * The answers a parent's subagents finished that no parent turn has carried,
 * oldest first: one bounded page selected in the database, so nothing already
 * delivered is read into memory and no answer waits behind newer children.
 * The first read for a parent applies the upgrade cut.
 */
export function collectOwedDelegatedTaskAnswers(
  ledger: DelegatedTaskAnswerLedger,
  args: DelegatedTaskAnswersArgs & { now: string },
): OwedDelegatedTaskAnswers {
  ledger.delegatedAnswers.startTracking({ parentTaskId: args.parentTaskId, settledThrough: args.lastTurnStartedAt, now: args.now });
  const owed = ledger.delegatedAnswers.listOwed({ parentTaskId: args.parentTaskId, limit: DELEGATED_TASK_ANSWER_READ_LIMIT });
  const answers = owed.rows.flatMap(({ receipt, target, stepExecutionId, resultArtifactRef }): DelegatedTaskAnswer[] => {
    const delegationKey = extractDelegatedTaskDelegationKey({ runId: receipt.runId, parentTaskId: args.parentTaskId });
    const text = receipt.detail?.responseText;
    if (!delegationKey || !text) return [];
    const turnId = delegatedTaskAnswerTurnId(receipt, { executionId: stepExecutionId, resultArtifactRef });
    return [{
      runId: receipt.runId, sequence: receipt.sequence, delegationKey,
      delegatedTaskId: target.taskId, delegatedWorkspaceId: target.workspaceId,
      ...(turnId ? { turnId } : {}), at: receipt.timestamp, text,
    }];
  });
  return { answers, more: Math.max(0, owed.total - owed.rows.length) };
}

/**
 * Record that a parent turn carried these answers. Called once the turn is
 * committed to its provider, so an answer counts as delivered from then on,
 * even if the turn is interrupted. Answers of other parents are ignored; a
 * repeat is a no-op.
 */
export function recordDelegatedTaskAnswersDelivered(
  ledger: DelegatedTaskAnswerLedger,
  args: { parentTaskId: string; parentTurnId: string; answers: readonly DelegatedTaskAnswerRef[]; now: string },
) {
  const answers = args.answers.filter((answer) => extractDelegatedTaskDelegationKey({ runId: answer.runId, parentTaskId: args.parentTaskId }));
  if (answers.length > 0) ledger.delegatedAnswers.recordDelivered({ answers, parentTurnId: args.parentTurnId, now: args.now });
}

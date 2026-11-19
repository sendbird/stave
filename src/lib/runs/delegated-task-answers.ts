import { z } from "zod";
import {
  DELEGATED_TASK_LIST_LIMIT,
  DelegatedTaskSummarySchema,
  extractDelegatedTaskDelegationKey,
} from "./delegated-task";
import {
  RUN_RESPONSE_TEXT_MAX_CHARS,
  RunIdSchema,
  type RunReceiptDraft,
  type RunReceiptRecord,
  type RunRecord,
  type RunStepRecord,
} from "./run-domain";

/**
 * Which subagent answers a parent turn still owes, decided from identities in
 * the run ledger rather than from timestamps or message positions.
 *
 * An answer is one result receipt of a child run: `(runId, sequence)` names
 * it, and the receipt carries the child turn that produced it. A `delivery`
 * receipt on the same run settles it:
 * - `delivery:<sequence>` with `parentTurnId`: a parent turn carried it;
 * - `delivery:<sequence>` with code `settled-before-tracking`: it predates
 *   this version and the parent's most recent turn, so the old rule had
 *   already delivered it;
 * - `owed:<sequence>`: it predates this version but not that turn, so it is
 *   owed like any newer answer.
 * Answers this version records carry `deliveryTracked` and are owed until a
 * parent turn carries them. Nothing else counts, so an answer that lands while
 * a turn is being prepared, a newer message without subagent results, an
 * interrupted turn, a restart or a trimmed message window cannot lose or
 * repeat one.
 */

/** How many owed answers one turn reads; the rest wait and are counted. */
export const DELEGATED_TASK_ANSWER_READ_LIMIT = 40;

export const DelegatedTaskAnswerRefSchema = z
  .object({ runId: RunIdSchema, sequence: z.number().int().min(1) })
  .strict();
export type DelegatedTaskAnswerRef = z.infer<typeof DelegatedTaskAnswerRefSchema>;

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

export const DelegatedTaskAnswersDeliveredArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    parentTurnId: RunIdSchema,
    answers: z.array(DelegatedTaskAnswerRefSchema).max(DELEGATED_TASK_ANSWER_READ_LIMIT),
  })
  .strict();
export type DelegatedTaskAnswersDeliveredArgs = z.infer<typeof DelegatedTaskAnswersDeliveredArgsSchema>;

export interface DelegatedTaskAnswerLedger {
  listRunAggregatesByOrigin(args: { originKind: string; originId: string; limit: number }): Array<{ run: RunRecord; step: RunStepRecord }>;
  listRunReceipts(args: { runId: string }): RunReceiptRecord[];
  appendRunReceipts(receipts: readonly RunReceiptDraft[]): void;
}

const ANSWER_RECEIPT_TYPES = new Set(["completed", "waiting", "failed"]);

function isAnswer(receipt: RunReceiptRecord) {
  return ANSWER_RECEIPT_TYPES.has(receipt.type) && Boolean(receipt.detail?.responseText);
}

function deliveryReceipt(answer: RunReceiptRecord, key: string, now: string, detail: RunReceiptDraft["detail"]): RunReceiptDraft {
  return { runId: answer.runId, stepId: answer.stepId, type: "delivery", executionId: null,
    idempotencyKey: `${key}:${answer.sequence}`, timestamp: now, detail };
}

/**
 * The answers a parent's subagents finished that no parent turn has carried,
 * oldest first. Answers older than this version are settled here once, on
 * first sight: before `lastTurnStartedAt` (or with no known turn) they count
 * as delivered, after it they are owed from then on. Reads only the parent's
 * listed children, whose receipts the turn reads anyway.
 */
export function collectOwedDelegatedTaskAnswers(
  ledger: DelegatedTaskAnswerLedger,
  args: DelegatedTaskAnswersArgs & { now: string },
): OwedDelegatedTaskAnswers {
  const owed: DelegatedTaskAnswer[] = [];
  const settle: RunReceiptDraft[] = [];
  const aggregates = ledger.listRunAggregatesByOrigin({ originKind: "task", originId: args.parentTaskId, limit: DELEGATED_TASK_LIST_LIMIT });
  for (const { run, step } of aggregates) {
    const delegationKey = extractDelegatedTaskDelegationKey({ runId: run.id, parentTaskId: args.parentTaskId });
    if (!delegationKey || !step.target) continue;
    const receipts = ledger.listRunReceipts({ runId: run.id });
    const settled = new Set(receipts.filter((receipt) => receipt.type === "delivery").map((receipt) => receipt.idempotencyKey));
    for (const receipt of receipts) {
      if (!isAnswer(receipt) || settled.has(`delivery:${receipt.sequence}`)) continue;
      if (!receipt.detail?.deliveryTracked && !settled.has(`owed:${receipt.sequence}`)) {
        const delivered = !args.lastTurnStartedAt || receipt.timestamp <= args.lastTurnStartedAt;
        settle.push(delivered
          ? deliveryReceipt(receipt, "delivery", args.now, { code: "settled-before-tracking" })
          : deliveryReceipt(receipt, "owed", args.now, { code: "owed-before-tracking" }));
        if (delivered) continue;
      }
      owed.push({
        runId: run.id, sequence: receipt.sequence, delegationKey,
        delegatedTaskId: step.target.taskId, delegatedWorkspaceId: step.target.workspaceId,
        ...(receipt.detail?.turnId ? { turnId: receipt.detail.turnId } : {}),
        at: receipt.timestamp, text: receipt.detail!.responseText!,
      });
    }
  }
  if (settle.length > 0) ledger.appendRunReceipts(settle);
  owed.sort((left, right) => left.at.localeCompare(right.at) || left.runId.localeCompare(right.runId) || left.sequence - right.sequence);
  return {
    answers: owed.slice(0, DELEGATED_TASK_ANSWER_READ_LIMIT),
    more: Math.max(0, owed.length - DELEGATED_TASK_ANSWER_READ_LIMIT),
  };
}

/**
 * Record that a parent turn carried these answers. Called once the turn is
 * committed, so an answer counts as delivered from the moment its prompt is
 * handed to the provider, even if the turn is then interrupted. Answers of
 * other parents or unknown receipts are ignored; a repeat is a no-op.
 */
export function recordDelegatedTaskAnswersDelivered(
  ledger: Pick<DelegatedTaskAnswerLedger, "listRunReceipts" | "appendRunReceipts">,
  args: DelegatedTaskAnswersDeliveredArgs & { now: string },
) {
  const drafts: RunReceiptDraft[] = [];
  for (const runId of new Set(args.answers.map((answer) => answer.runId))) {
    const refs = args.answers.filter((answer) => answer.runId === runId);
    if (!extractDelegatedTaskDelegationKey({ runId, parentTaskId: args.parentTaskId })) continue;
    const answers = new Map(ledger.listRunReceipts({ runId }).filter(isAnswer).map((receipt) => [receipt.sequence, receipt]));
    for (const ref of refs) {
      const answer = answers.get(ref.sequence);
      if (answer) drafts.push(deliveryReceipt(answer, "delivery", args.now, { code: "delivered", parentTurnId: args.parentTurnId }));
    }
  }
  if (drafts.length > 0) ledger.appendRunReceipts(drafts);
}

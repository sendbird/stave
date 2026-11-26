import {
  RunReceiptRecordSchema,
  RunStepTargetSchema,
  type RunReceiptRecord,
  type RunStepTarget,
} from "../../src/lib/runs/run-domain";
import { REVIEW_DELEGATION_KEY_PREFIX, buildDelegatedTaskRunId } from "../../src/lib/runs/delegated-task";
import { listDelegatedWorkspaceLinks } from "./delegated-workspace-links";

/**
 * Which subagent answers a parent's turns have carried, kept beside the run
 * ledger rather than in it: `run_receipts` stays exactly as earlier versions
 * write it, so a database this version used still opens in them.
 *
 * An answer is a result receipt of a delegated child run that has
 * `responseText`; `(run_id, sequence)` names it. A row in
 * `delegated_answer_deliveries` settles it: `parent_turn_id` is the parent
 * turn that carried it, or null for an answer settled by the upgrade cut.
 * `delegated_answer_tracking` holds one row per parent whose answers are
 * tracked, plus the row `''`: when this version first opened the database.
 */

interface Statement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface Database {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => Statement;
  transaction: <TResult>(callback: () => TResult) => (() => TResult) & { immediate: () => TResult };
}

export interface OwedDelegatedAnswerRow {
  receipt: RunReceiptRecord;
  target: RunStepTarget;
  /** The child step's current execution and result reference, to name the turn of a completed answer. */
  stepExecutionId: string | null;
  resultArtifactRef: string | null;
}

const answersOfParent = (join = "") => `
  FROM runs AS run
  JOIN run_receipts AS receipt ON receipt.run_id = run.id ${join}
  WHERE run.origin_kind = 'task' AND run.origin_id = ? AND run.kind = 'delegated-task'
    AND receipt.receipt_type IN ('completed', 'waiting', 'failed')
    AND COALESCE(json_extract(receipt.detail_json, '$.responseText'), '') != ''`;

const OWED = `JOIN run_steps AS step ON step.id = receipt.step_id`;
const UNSETTLED = `step.target_json IS NOT NULL AND NOT EXISTS (SELECT 1 FROM delegated_answer_deliveries AS delivery
  WHERE delivery.run_id = receipt.run_id AND delivery.sequence = receipt.sequence)`;

export class DelegatedAnswerStore {
  private readonly db: Database;

  constructor(database: unknown, options: { now?: () => string } = {}) {
    this.db = database as Database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS delegated_answer_deliveries (
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        parent_turn_id TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS delegated_answer_tracking (
        parent_task_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL
      );
    `);
    this.db.prepare(`INSERT OR IGNORE INTO delegated_answer_tracking (parent_task_id, started_at) VALUES ('', ?)`)
      .run((options.now ?? (() => new Date().toISOString()))());
  }

  /**
   * The upgrade cut, once per parent: on the first read for a parent, its
   * answers recorded before this version first opened the database and no
   * later than `settledThrough` (the parent's latest turn start; null when
   * unknown) count as delivered, as the earlier rule had already given or
   * dropped them. Answers recorded after the upgrade are never settled here,
   * even when the first read sees them: the upgrade moment is written once per
   * database, in this constructor, which `SqliteStore` runs before its run
   * ledger can write a receipt. `settledThrough` only narrows the cut, so an
   * answer the earlier version had not yet given stays owed.
   */
  startTracking(args: { parentTaskId: string; settledThrough: string | null; now: string }) {
    this.db.transaction(() => {
      const inserted = this.db.prepare(`INSERT OR IGNORE INTO delegated_answer_tracking (parent_task_id, started_at) VALUES (?, ?)`)
        .run(args.parentTaskId, args.now);
      if (Number(inserted.changes ?? 0) === 0) return;
      this.db.prepare(`
        INSERT OR IGNORE INTO delegated_answer_deliveries (run_id, sequence, parent_turn_id, created_at)
        SELECT receipt.run_id, receipt.sequence, NULL, ?
        ${answersOfParent()}
          AND receipt.created_at < (SELECT started_at FROM delegated_answer_tracking WHERE parent_task_id = '')
          AND (? IS NULL OR receipt.created_at <= ?)
      `).run(args.now, args.parentTaskId, args.settledThrough, args.settledThrough);
    }).immediate();
  }

  /**
   * The bounded page starts with explicitly attached composer reviews, then
   * ordinary answers, then reviews the user has not attached. Within each
   * group, older receipts come first.
   */
  listOwed(args: { parentTaskId: string; limit: number; attachedTaskIds?: readonly string[] }): { rows: OwedDelegatedAnswerRow[]; total: number } {
    const reviewRunIdPrefix = buildDelegatedTaskRunId({ parentTaskId: args.parentTaskId, delegationKey: REVIEW_DELEGATION_KEY_PREFIX });
    const rows = this.db.prepare(`
      SELECT receipt.*, step.target_json, step.execution_id AS step_execution_id, step.result_artifact_ref
      ${answersOfParent(OWED)} AND ${UNSETTLED}
      ORDER BY CASE
        WHEN substr(receipt.run_id, 1, length(?)) != ? THEN 1
        WHEN json_extract(step.target_json, '$.taskId') IN (SELECT value FROM json_each(?)) THEN 0
        ELSE 2
      END, receipt.created_at ASC, receipt.run_id ASC, receipt.sequence ASC
      LIMIT ?
    `).all(args.parentTaskId, reviewRunIdPrefix, reviewRunIdPrefix, JSON.stringify(args.attachedTaskIds ?? []), args.limit) as Array<Record<string, unknown>>;
    const total = rows.length < args.limit ? rows.length : Number((this.db.prepare(`
      SELECT COUNT(*) AS total ${answersOfParent(OWED)} AND ${UNSETTLED}
    `).get(args.parentTaskId) as { total: number }).total);
    return {
      total,
      rows: rows.map((row) => ({
        receipt: RunReceiptRecordSchema.parse({
          runId: row.run_id, stepId: row.step_id, sequence: row.sequence, type: row.receipt_type,
          executionId: row.execution_id, idempotencyKey: row.idempotency_key, timestamp: row.created_at,
          detail: typeof row.detail_json === "string" ? JSON.parse(row.detail_json) : null,
        }),
        target: RunStepTargetSchema.parse(JSON.parse(String(row.target_json))),
        stepExecutionId: typeof row.step_execution_id === "string" ? row.step_execution_id : null,
        resultArtifactRef: typeof row.result_artifact_ref === "string" ? row.result_artifact_ref : null,
      })),
    };
  }

  /**
   * Workspaces created for delegated children and the workspace each nests
   * under (`delegated-workspace-links.ts`). Read here, beside the ledger.
   */
  listWorkspaceLinks(options?: { includeArchivedParents?: boolean }) {
    return listDelegatedWorkspaceLinks(this.db, options);
  }

  /** Whether a delegation still owes its parent an answer: one with text that no parent turn carried. */
  hasOwedAnswer(runId: string) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM run_receipts AS receipt JOIN run_steps AS step ON step.id = receipt.step_id
      WHERE receipt.run_id = ? AND receipt.receipt_type IN ('completed', 'waiting', 'failed')
        AND COALESCE(json_extract(receipt.detail_json, '$.responseText'), '') != '' AND ${UNSETTLED}
      LIMIT 1
    `).get(runId));
  }

  /** Settle these answers as carried by `parentTurnId`; refs that name no answer are ignored, a repeat is a no-op. */
  recordDelivered(args: { answers: ReadonlyArray<{ runId: string; sequence: number }>; parentTurnId: string; now: string }) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO delegated_answer_deliveries (run_id, sequence, parent_turn_id, created_at)
      SELECT run_id, sequence, ?, ? FROM run_receipts
      WHERE run_id = ? AND sequence = ? AND receipt_type IN ('completed', 'waiting', 'failed')
    `);
    this.db.transaction(() => {
      for (const answer of args.answers) insert.run(args.parentTurnId, args.now, answer.runId, answer.sequence);
    }).immediate();
  }
}

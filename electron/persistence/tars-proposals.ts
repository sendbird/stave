import {
  TarsActionReceiptSchema, TarsActionRecordSchema, TarsDecisionAnswerSchema, isTarsDecisionClosure, type TarsActionReceipt, type TarsDecisionAnswer,
} from "../../src/lib/tars/conversation";
import { tarsDecisionTargets, tarsReceiptDecisionId } from "../../src/lib/tars/decisions";
import { TarsMessageSchema } from "../../src/lib/tars/conversation";
import { tarsEventKey } from "../../src/lib/tars/events";
import { TARS_CI_FIX_ROUNDS } from "../../src/lib/tars/pr-checks";
import type { TarsResponsibility } from "../../src/lib/tars/types";

interface ReceiptDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
}

/**
 * The one rule for which proposals speak for a responsibility: the control
 * receipts of the newest message that proposed a control for it, whatever
 * their status. A newer message supersedes every older proposal for good, so a
 * refused, confirmed or expired newer proposal never brings an older one back.
 * Controls in that one message are alternatives offered together ("continue,
 * otherwise cancel"); confirming one moves the revision, which retires the rest.
 * The snapshot's `pendingDecisions` and the host's confirmation check both read
 * this. Receipts are inserted in proposal order, so `rowid` orders them.
 */
export function readLatestTarsControls(db: unknown, responsibilityId?: string): Map<string, TarsActionReceipt[]> {
  const database = db as ReceiptDatabase;
  const rows = responsibilityId === undefined
    ? database.prepare(`SELECT body_json FROM tars_action_receipts
        WHERE json_extract(body_json, '$.action.kind') = 'control' ORDER BY rowid`).all()
    : database.prepare(`SELECT body_json FROM tars_action_receipts
        WHERE json_extract(body_json, '$.action.kind') = 'control'
          AND json_extract(body_json, '$.action.responsibilityId') = ? ORDER BY rowid`).all(responsibilityId);
  const latest = new Map<string, TarsActionReceipt[]>();
  for (const row of rows) {
    const receipt = TarsActionReceiptSchema.safeParse(JSON.parse((row as { body_json: string }).body_json));
    if (!receipt.success || receipt.data.action.kind !== "control") continue;
    const id = receipt.data.action.responsibilityId;
    const current = latest.get(id);
    if (current?.[0]?.messageId === receipt.data.messageId) current.push(receipt.data);
    else latest.set(id, [receipt.data]);
  }
  return latest;
}

/** Whether the tables decision answers read exist on this connection; a store opened without the conversation has none. */
export function hasTarsDecisionTables(db: unknown): boolean {
  const row = (db as ReceiptDatabase).prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'
    AND name IN ('tars_action_receipts', 'tars_messages', 'tars_action_records', 'tars_decision_answers')`).get() as { count: number };
  return row.count === 4;
}

function parseRows<T>(rows: unknown[], schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): T[] {
  return rows.flatMap((row) => { const parsed = schema.safeParse(JSON.parse((row as { body_json: string }).body_json)); return parsed.success ? [parsed.data] : []; });
}

/** Answers by decision id, in one read. */
export function readTarsAnswers(db: unknown, ids: readonly string[]): Map<string, TarsDecisionAnswer> {
  if (!ids.length) return new Map();
  const rows = (db as ReceiptDatabase).prepare("SELECT body_json FROM tars_decision_answers WHERE decision_id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify([...new Set(ids)]));
  return new Map(parseRows(rows, TarsDecisionAnswerSchema).map((answer) => [answer.decisionId, answer]));
}

/**
 * `<message>:<responsibility>` pairs settled by an answered decision of that
 * message: its other decisions on the same work were alternatives and retire.
 * Decisions on other work in the same message stay open. A refused answer or
 * confirmation settles nothing, and neither does a dismissal or a withdrawal,
 * which closes only its own card; `except` leaves out the decision being
 * confirmed, whose own record exists while it is checked.
 * The conversation card applies the same rule (`projectTarsDecisions`).
 */
export function readSettledTarsTargets(db: unknown, messageIds: readonly string[], except?: string): Set<string> {
  const database = db as ReceiptDatabase;
  const settled = new Set<string>();
  for (const messageId of new Set(messageIds)) {
    const receipts = parseRows(database.prepare("SELECT body_json FROM tars_action_receipts WHERE message_id = ?").all(messageId), TarsActionReceiptSchema);
    const ids = receipts.flatMap((receipt) => { const id = tarsReceiptDecisionId(receipt); return id && id !== except ? [id] : []; });
    if (!ids.length) continue;
    const answers = readTarsAnswers(db, ids);
    const records = new Map(parseRows(database.prepare("SELECT body_json FROM tars_action_records WHERE request_id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(ids)), TarsActionRecordSchema).map((record) => [record.requestId, record]));
    for (const receipt of receipts) {
      const id = tarsReceiptDecisionId(receipt);
      if (!id || id === except) continue;
      const answer = answers.get(id);
      const record = records.get(id);
      if (!(answer && answer.status !== "rejected" && !isTarsDecisionClosure(answer)) && !(record && record.status !== "rejected")) continue;
      for (const target of tarsDecisionTargets(receipt)) settled.add(`${messageId}:${target}`);
    }
  }
  return settled;
}

/**
 * Questions that can still wait: proposed asks of the newest message (a later
 * message means the conversation moved on, except Tars's own automatic
 * follow-up about other work). Answers, siblings and their targets' revisions
 * are checked by the caller, as the card does.
 */
export function readOpenTarsAsks(db: unknown): TarsActionReceipt[] {
  return parseRows((db as ReceiptDatabase).prepare(`SELECT r.body_json FROM tars_action_receipts r JOIN tars_messages m ON m.id = r.message_id
    WHERE json_extract(r.body_json, '$.action.kind') = 'ask' AND json_extract(r.body_json, '$.status') = 'proposed'
      AND NOT EXISTS (SELECT 1 FROM tars_messages later WHERE later.rowid > m.rowid
        AND json_extract(later.body_json, '$.origin.kind') IS NOT 'followUp')
    ORDER BY r.rowid`).all(), TarsActionReceiptSchema);
}

/** PR notices have reply/review options rather than revision-bound run controls. */
export function readTarsPrAskTarget(db: unknown, receipt: TarsActionReceipt, rows: ReadonlyMap<string, TarsResponsibility>): TarsResponsibility | null {
  const stored = (db as ReceiptDatabase).prepare("SELECT body_json FROM tars_messages WHERE id = ?").get(receipt.messageId) as { body_json: string } | undefined;
  const message = stored ? TarsMessageSchema.safeParse(JSON.parse(stored.body_json)) : null;
  const origin = message?.success ? message.data.origin : undefined;
  if (origin?.kind !== "followUp" || (origin.reason !== "ciPassed" && origin.reason !== "ciFailed")) return null;
  const row = rows.get(origin.responsibilityId);
  const publication = row?.publication;
  const head = publication?.commit;
  if (!row || row.state !== "completed" || publication?.state !== "opened" || !head || publication.checks?.headSha !== head ||
      origin.eventKey !== tarsEventKey({ kind: origin.reason, responsibilityId: row.id, episode: head })) return null;
  const current = origin.reason === "ciPassed" ? publication.checks.state === "passed"
    : publication.checks.state === "failed" && (publication.watch?.fixRounds ?? 0) >= TARS_CI_FIX_ROUNDS;
  return current ? row : null;
}

/**
 * The messages the conversation moved on from: a later message exists that is
 * not Tars's own automatic follow-up about other work. A proposal or a
 * question of such a message no longer waits (`projectTarsDecisions` reads
 * the same rule from conversation order).
 */
export function readMovedOnTarsMessages(db: unknown, messageIds: readonly string[]): Set<string> {
  if (!messageIds.length) return new Set();
  const rows = (db as ReceiptDatabase).prepare(`SELECT m.id AS id FROM tars_messages m WHERE m.id IN (SELECT value FROM json_each(?))
    AND EXISTS (SELECT 1 FROM tars_messages later WHERE later.rowid > m.rowid AND json_extract(later.body_json, '$.origin.kind') IS NOT 'followUp')`)
    .all(JSON.stringify([...new Set(messageIds)])) as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

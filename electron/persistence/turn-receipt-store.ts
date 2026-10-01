import type Database from "better-sqlite3";
import type { BridgeEvent } from "../providers/types";
import {
  prepareTurnEventPayload,
  parseTurnEventPayload,
  type PersistedTurnStreamEvent,
} from "./turn-event-payload";
import {
  finishTurnReceipt,
  observeTurnEvent,
  parseTurnReceipt,
} from "./turn-terminal-receipt";

export function getTurnReceipt(db: Database.Database, turnId: string) {
  const row = db
    .prepare("SELECT receipt_json FROM turns WHERE id = ?")
    .get(turnId) as { receipt_json: string | null } | undefined;
  return parseTurnReceipt(row?.receipt_json ?? null);
}

export function finalizeTurnReceipt(
  db: Database.Database,
  turnId: string,
  completedAt: string,
  stopReason?: string,
) {
  const receipt = getTurnReceipt(db, turnId);
  if (receipt)
    db.prepare("UPDATE turns SET receipt_json = ? WHERE id = ?").run(
      JSON.stringify(finishTurnReceipt(receipt, completedAt, stopReason)),
      turnId,
    );
}

/** Called inside the event-write transaction, before payload truncation/pruning.
 * Only accepted inserts contribute evidence; replays cannot change the result.
 */
export function insertTurnEventWithReceipt(
  db: Database.Database,
  args: {
    turnId: string;
    sequence: number;
    event: BridgeEvent;
    createdAt?: string;
  },
) {
  const prepared = prepareTurnEventPayload(args.event);
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO turn_events
    (id, turn_id, sequence, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `${args.turnId}-${args.sequence}`,
      args.turnId,
      args.sequence,
      prepared.eventType,
      prepared.payloadJson,
      args.createdAt ?? new Date().toISOString(),
    );
  if (Number(result.changes) > 0) {
    const receipt = getTurnReceipt(db, args.turnId);
    if (receipt && !receipt.completedAt)
      db.prepare("UPDATE turns SET receipt_json = ? WHERE id = ?").run(
        JSON.stringify(observeTurnEvent(receipt, args.event)),
        args.turnId,
      );
  }
}

export function readTurnStreamEvents(
  db: Database.Database,
  args: { turnId: string; sinceSequence?: number },
): PersistedTurnStreamEvent[] {
  const rows = db
    .prepare(
      `SELECT sequence, event_type, payload_json FROM turn_events
    WHERE turn_id = ? AND sequence > ? ORDER BY sequence ASC`,
    )
    .all(args.turnId, args.sinceSequence ?? 0) as Array<{
    sequence: number;
    event_type: string;
    payload_json: string;
  }>;
  return rows.map((row) => {
    const parsed = parseTurnEventPayload(row.payload_json);
    return {
      sequence: row.sequence,
      eventType: row.event_type,
      event: parsed.event,
      truncated: parsed.truncated,
    };
  });
}

import { randomUUID } from "node:crypto";
import { z } from "zod";

interface OutboxStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface OutboxDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => OutboxStatement;
}

export const MARTIN_OUTBOX_KINDS = ["event", "links_merge"] as const;
export const MARTIN_OUTBOX_STATUSES = [
  "pending",
  "delivered",
  "failed",
  "held",
] as const;

export type MartinOutboxKind =
  (typeof MARTIN_OUTBOX_KINDS)[number];
export type MartinOutboxStatus =
  (typeof MARTIN_OUTBOX_STATUSES)[number];

export const MartinOutboxEntrySchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
    kind: z.enum(MARTIN_OUTBOX_KINDS),
    payloadJson: z.string().min(1),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
    deliveredAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(MARTIN_OUTBOX_STATUSES),
  })
  .strict();

export type MartinOutboxEntry = z.infer<
  typeof MartinOutboxEntrySchema
>;

interface OutboxRow {
  id: string;
  workspace_id: string;
  project_ref: string;
  kind: string;
  payload_json: string;
  attempts: number;
  next_attempt_at: string;
  created_at: string;
  delivered_at: string | null;
  status: string;
}

const SELECT_COLUMNS = `
  id,
  workspace_id,
  project_ref,
  kind,
  payload_json,
  attempts,
  next_attempt_at,
  created_at,
  delivered_at,
  status
`;

function parseEntry(row: OutboxRow): MartinOutboxEntry {
  return MartinOutboxEntrySchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    projectRef: row.project_ref,
    kind: row.kind,
    payloadJson: row.payload_json,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    status: row.status,
  });
}

export class MartinSyncOutboxStore {
  private readonly db: OutboxDatabase;

  constructor(database: unknown) {
    this.db = database as OutboxDatabase;
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS martin_sync_outbox (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_ref TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('event', 'links_merge')),
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        status TEXT NOT NULL CHECK (
          status IN ('pending', 'delivered', 'failed', 'held')
        )
      );

      CREATE INDEX IF NOT EXISTS idx_martin_outbox_due
        ON martin_sync_outbox (status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_martin_outbox_workspace
        ON martin_sync_outbox (workspace_id, status);
    `);
  }

  private get(id: string): MartinOutboxEntry | null {
    const row = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM martin_sync_outbox
         WHERE id = ?`,
      )
      .get(id) as OutboxRow | undefined;
    return row ? parseEntry(row) : null;
  }

  enqueue(input: {
    workspaceId: string;
    projectRef: string;
    kind: "event";
    payloadJson: string;
    now: string;
  }): MartinOutboxEntry {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO martin_sync_outbox (
           id, workspace_id, project_ref, kind, payload_json, attempts,
           next_attempt_at, created_at, delivered_at, status
         ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL, 'pending')`,
      )
      .run(
        id,
        input.workspaceId,
        input.projectRef,
        input.kind,
        input.payloadJson,
        input.now,
        input.now,
      );
    return this.get(id)!;
  }

  upsertLinksMerge(input: {
    workspaceId: string;
    projectRef: string;
    payloadJson: string;
    nextAttemptAt: string;
    now: string;
  }): MartinOutboxEntry {
    const updated = this.db
      .prepare(
        `UPDATE martin_sync_outbox
         SET project_ref = ?, payload_json = ?, attempts = 0,
             next_attempt_at = ?, delivered_at = NULL
         WHERE workspace_id = ? AND kind = 'links_merge'
           AND status IN ('pending', 'held')`,
      )
      .run(
        input.projectRef,
        input.payloadJson,
        input.nextAttemptAt,
        input.workspaceId,
      );
    if (Number(updated.changes ?? 0) > 0) {
      const row = this.db
        .prepare(
          `SELECT ${SELECT_COLUMNS}
           FROM martin_sync_outbox
           WHERE workspace_id = ? AND kind = 'links_merge'
             AND status IN ('pending', 'held')
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
        )
        .get(input.workspaceId) as OutboxRow;
      return parseEntry(row);
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO martin_sync_outbox (
           id, workspace_id, project_ref, kind, payload_json, attempts,
           next_attempt_at, created_at, delivered_at, status
         ) VALUES (?, ?, ?, 'links_merge', ?, 0, ?, ?, NULL, 'pending')`,
      )
      .run(
        id,
        input.workspaceId,
        input.projectRef,
        input.payloadJson,
        input.nextAttemptAt,
        input.now,
      );
    return this.get(id)!;
  }

  listDue(args: { now: string; limit: number }): MartinOutboxEntry[] {
    const limit = Math.max(1, Math.min(100, Math.trunc(args.limit)));
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM martin_sync_outbox
         WHERE status = 'pending' AND next_attempt_at <= ?
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
      )
      .all(args.now, limit) as OutboxRow[];
    return rows.map(parseEntry);
  }

  markDelivered(id: string, deliveredAt: string): void {
    this.db
      .prepare(
        `UPDATE martin_sync_outbox
         SET status = 'delivered', delivered_at = ?
         WHERE id = ?`,
      )
      .run(deliveredAt, id);
  }

  markRetry(id: string, attempts: number, nextAttemptAt: string): void {
    this.db
      .prepare(
        `UPDATE martin_sync_outbox
         SET status = 'pending', attempts = ?, next_attempt_at = ?
         WHERE id = ?`,
      )
      .run(attempts, nextAttemptAt, id);
  }

  markFailed(id: string): void {
    this.db
      .prepare(
        `UPDATE martin_sync_outbox SET status = 'failed' WHERE id = ?`,
      )
      .run(id);
  }

  setWorkspaceHeld(workspaceId: string, held: boolean): number {
    const result = this.db
      .prepare(
        `UPDATE martin_sync_outbox
         SET status = ?
         WHERE workspace_id = ? AND status = ?`,
      )
      .run(
        held ? "held" : "pending",
        workspaceId,
        held ? "pending" : "held",
      );
    return Number(result.changes ?? 0);
  }

  retryFailed(): number {
    const result = this.db
      .prepare(
        `UPDATE martin_sync_outbox
         SET status = 'pending', attempts = 0, delivered_at = NULL,
             next_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE status = 'failed'`,
      )
      .run();
    return Number(result.changes ?? 0);
  }

  counts(): { pending: number; failed: number } {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status IN ('pending', 'held') THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM martin_sync_outbox`,
      )
      .get() as { pending: number | null; failed: number | null };
    return {
      pending: Number(row.pending ?? 0),
      failed: Number(row.failed ?? 0),
    };
  }

  pruneDeliveredBefore(cutoff: string): number {
    const result = this.db
      .prepare(
        `DELETE FROM martin_sync_outbox
         WHERE status = 'delivered' AND delivered_at < ?`,
      )
      .run(cutoff);
    return Number(result.changes ?? 0);
  }
}

/**
 * Durable storage for wake-ups and their occurrences.
 *
 * Used by: `electron/persistence/sqlite-store.ts` (delegation) and, through it,
 * `electron/host-service/wake-up-runtime.ts`.
 *
 * These are deliberately NOT ledger tables. The run ledger records delegated
 * execution — runs, steps, receipts. A wake-up records wake-ups on a task the
 * user already owns, which has a different lifetime and no claim semantics.
 */
import {
  WakeUpOccurrenceSchema,
  WakeUpSchema,
  WAKE_UP_LIMITS,
  type WakeUp,
  type WakeUpOccurrence,
} from "../../src/lib/supervision/wake-up-policy";

interface WakeUpStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface WakeUpDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => WakeUpStatement;
}

interface WakeUpRow {
  id: string;
  workspace_id: string;
  task_id: string;
  project_path: string;
  prompt: string;
  trigger_json: string;
  fingerprint_json: string;
  state: string;
  pause_reason: string | null;
  stop_reason: string | null;
  reason_detail: string | null;
  next_run_at: string | null;
  last_occurrence_at: string | null;
  occurrence_count: number;
  skipped_count: number;
  max_occurrences: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WakeUpOccurrenceRow {
  id: string;
  wake_up_id: string;
  idempotency_key: string;
  workspace_id: string;
  task_id: string;
  turn_id: string | null;
  outcome: string;
  reason: string | null;
  scheduled_for: string;
  recorded_at: string;
}

const WAKE_UP_COLUMNS = `
  id,
  workspace_id,
  task_id,
  project_path,
  prompt,
  trigger_json,
  fingerprint_json,
  state,
  pause_reason,
  stop_reason,
  reason_detail,
  next_run_at,
  last_occurrence_at,
  occurrence_count,
  skipped_count,
  max_occurrences,
  expires_at,
  created_at,
  updated_at
`;

const OCCURRENCE_COLUMNS = `
  id,
  wake_up_id,
  idempotency_key,
  workspace_id,
  task_id,
  turn_id,
  outcome,
  reason,
  scheduled_for,
  recorded_at
`;

function parseWakeUpRow(row: WakeUpRow): WakeUp {
  return WakeUpSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    repositoryPath: row.project_path,
    prompt: row.prompt,
    trigger: JSON.parse(row.trigger_json),
    fingerprint: JSON.parse(row.fingerprint_json),
    state: row.state,
    pauseReason: row.pause_reason,
    stopReason: row.stop_reason,
    reasonDetail: row.reason_detail,
    nextRunAt: row.next_run_at,
    lastOccurrenceAt: row.last_occurrence_at,
    occurrenceCount: row.occurrence_count,
    skippedCount: row.skipped_count,
    maxOccurrences: row.max_occurrences,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseOccurrenceRow(
  row: WakeUpOccurrenceRow,
): WakeUpOccurrence {
  return WakeUpOccurrenceSchema.parse({
    id: row.id,
    wakeUpId: row.wake_up_id,
    idempotencyKey: row.idempotency_key,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    turnId: row.turn_id,
    outcome: row.outcome,
    reason: row.reason,
    scheduledFor: row.scheduled_for,
    recordedAt: row.recorded_at,
  });
}

// temporary-migration: wake-up-tables
/** Names written before wake-ups were renamed from task heartbeats. */
const LEGACY_WAKE_UP_TABLES = [
  ["task_heartbeats", "wake_ups"],
  ["task_heartbeat_occurrences", "wake_up_occurrences"],
] as const;
const LEGACY_WAKE_UP_INDEXES = [
  "idx_task_heartbeats_task",
  "idx_task_heartbeats_due",
  "idx_task_heartbeat_occurrence_key",
  "idx_task_heartbeat_occurrences_recent",
];

/**
 * Renames the legacy tables, the occurrence table's legacy `heartbeat_id`
 * column and drops the legacy index names (the bootstrap recreates them under
 * the new names). Runs before the bootstrap, once: afterwards no legacy name
 * exists. If an empty new table was already created next to a legacy one, the
 * legacy data wins; if both hold rows, the legacy table is left untouched and
 * reported rather than merged.
 */
export function migrateLegacyWakeUpTables(db: WakeUpDatabase) {
  const tableExists = (name: string) =>
    Boolean(
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(name),
    );
  const rowCount = (name: string) =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get() as { count: number })
      .count;
  db.exec("SAVEPOINT legacy_wake_up_tables");
  try {
    for (const [legacy, current] of LEGACY_WAKE_UP_TABLES) {
      if (!tableExists(legacy)) continue;
      if (tableExists(current)) {
        if (rowCount(current) > 0) {
          console.warn(
            `[persistence] kept legacy table ${legacy}: ${current} already has rows`,
          );
          continue;
        }
        db.exec(`DROP TABLE ${current}`);
      }
      db.exec(`ALTER TABLE ${legacy} RENAME TO ${current}`);
    }
    const occurrenceColumns = tableExists("wake_up_occurrences")
      ? (db.prepare("PRAGMA table_info(wake_up_occurrences)").all() as Array<{
          name: string;
        }>)
      : [];
    if (occurrenceColumns.some((column) => column.name === "heartbeat_id")) {
      db.exec(
        "ALTER TABLE wake_up_occurrences RENAME COLUMN heartbeat_id TO wake_up_id",
      );
    }
    for (const index of LEGACY_WAKE_UP_INDEXES) {
      db.exec(`DROP INDEX IF EXISTS ${index}`);
    }
    db.exec("RELEASE legacy_wake_up_tables");
  } catch (error) {
    db.exec("ROLLBACK TO legacy_wake_up_tables");
    db.exec("RELEASE legacy_wake_up_tables");
    throw error;
  }
}
// end temporary-migration: wake-up-tables

export class WakeUpStore {
  private readonly db: WakeUpDatabase;

  constructor(database: unknown) {
    this.db = database as WakeUpDatabase;
    // temporary-migration: wake-up-tables
    migrateLegacyWakeUpTables(this.db);
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wake_ups (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        prompt TEXT NOT NULL,
        trigger_json TEXT NOT NULL,
        fingerprint_json TEXT NOT NULL,
        state TEXT NOT NULL,
        pause_reason TEXT,
        stop_reason TEXT,
        reason_detail TEXT,
        next_run_at TEXT,
        last_occurrence_at TEXT,
        occurrence_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        max_occurrences INTEGER,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_wake_ups_task
        ON wake_ups (task_id);

      CREATE INDEX IF NOT EXISTS idx_wake_ups_due
        ON wake_ups (state, next_run_at);

      CREATE TABLE IF NOT EXISTS wake_up_occurrences (
        id TEXT PRIMARY KEY,
        wake_up_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        turn_id TEXT,
        outcome TEXT NOT NULL,
        reason TEXT,
        scheduled_for TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_wake_up_occurrence_key
        ON wake_up_occurrences (wake_up_id, idempotency_key);

      CREATE INDEX IF NOT EXISTS idx_wake_up_occurrences_recent
        ON wake_up_occurrences (wake_up_id, recorded_at DESC);
    `);
  }

  list(): WakeUp[] {
    const rows = this.db
      .prepare(
        `SELECT ${WAKE_UP_COLUMNS}
         FROM wake_ups
         ORDER BY created_at DESC, id ASC`,
      )
      .all() as WakeUpRow[];
    return rows.map(parseWakeUpRow);
  }

  /** Everything the scheduler still has to look at. */
  listActive(): WakeUp[] {
    const rows = this.db
      .prepare(
        `SELECT ${WAKE_UP_COLUMNS}
         FROM wake_ups
         WHERE state != 'stopped'
         ORDER BY created_at ASC, id ASC`,
      )
      .all() as WakeUpRow[];
    return rows.map(parseWakeUpRow);
  }

  listForWorkspace(workspaceId: string): WakeUp[] {
    const rows = this.db
      .prepare(
        `SELECT ${WAKE_UP_COLUMNS}
         FROM wake_ups
         WHERE workspace_id = ?
         ORDER BY created_at DESC, id ASC`,
      )
      .all(workspaceId) as WakeUpRow[];
    return rows.map(parseWakeUpRow);
  }

  get(id: string): WakeUp | null {
    const row = this.db
      .prepare(
        `SELECT ${WAKE_UP_COLUMNS} FROM wake_ups WHERE id = ?`,
      )
      .get(id) as WakeUpRow | undefined;
    return row ? parseWakeUpRow(row) : null;
  }

  getByTaskId(taskId: string): WakeUp | null {
    const row = this.db
      .prepare(
        `SELECT ${WAKE_UP_COLUMNS} FROM wake_ups WHERE task_id = ?`,
      )
      .get(taskId) as WakeUpRow | undefined;
    return row ? parseWakeUpRow(row) : null;
  }

  upsert(input: WakeUp): WakeUp {
    const wakeUp = WakeUpSchema.parse(input);
    this.db
      .prepare(
        `INSERT INTO wake_ups (
           id,
           workspace_id,
           task_id,
           project_path,
           prompt,
           trigger_json,
           fingerprint_json,
           state,
           pause_reason,
           stop_reason,
           reason_detail,
           next_run_at,
           last_occurrence_at,
           occurrence_count,
           skipped_count,
           max_occurrences,
           expires_at,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           prompt = excluded.prompt,
           trigger_json = excluded.trigger_json,
           fingerprint_json = excluded.fingerprint_json,
           state = excluded.state,
           pause_reason = excluded.pause_reason,
           stop_reason = excluded.stop_reason,
           reason_detail = excluded.reason_detail,
           next_run_at = excluded.next_run_at,
           last_occurrence_at = excluded.last_occurrence_at,
           occurrence_count = excluded.occurrence_count,
           skipped_count = excluded.skipped_count,
           max_occurrences = excluded.max_occurrences,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        wakeUp.id,
        wakeUp.workspaceId,
        wakeUp.taskId,
        wakeUp.repositoryPath,
        wakeUp.prompt,
        JSON.stringify(wakeUp.trigger),
        JSON.stringify(wakeUp.fingerprint),
        wakeUp.state,
        wakeUp.pauseReason,
        wakeUp.stopReason,
        wakeUp.reasonDetail,
        wakeUp.nextRunAt,
        wakeUp.lastOccurrenceAt,
        wakeUp.occurrenceCount,
        wakeUp.skippedCount,
        wakeUp.maxOccurrences,
        wakeUp.expiresAt,
        wakeUp.createdAt,
        wakeUp.updatedAt,
      );
    return this.get(wakeUp.id)!;
  }

  remove(id: string): boolean {
    this.db
      .prepare("DELETE FROM wake_up_occurrences WHERE wake_up_id = ?")
      .run(id);
    const result = this.db
      .prepare("DELETE FROM wake_ups WHERE id = ?")
      .run(id);
    return Number(result.changes ?? 0) > 0;
  }

  /**
   * Records one occurrence, or reports that it already exists. The unique index
   * on (wake_up_id, idempotency_key) is what makes a duplicate delivery
   * harmless: `false` means "this instant was already handled, do not fire".
   */
  recordOccurrence(occurrence: WakeUpOccurrence): boolean {
    const parsed = WakeUpOccurrenceSchema.parse(occurrence);
    const result = this.db
      .prepare(
        `INSERT INTO wake_up_occurrences (
           id,
           wake_up_id,
           idempotency_key,
           workspace_id,
           task_id,
           turn_id,
           outcome,
           reason,
           scheduled_for,
           recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(wake_up_id, idempotency_key) DO NOTHING`,
      )
      .run(
        parsed.id,
        parsed.wakeUpId,
        parsed.idempotencyKey,
        parsed.workspaceId,
        parsed.taskId,
        parsed.turnId,
        parsed.outcome,
        parsed.reason,
        parsed.scheduledFor,
        parsed.recordedAt,
      );
    return Number(result.changes ?? 0) > 0;
  }

  attachOccurrenceTurn(args: { id: string; turnId: string }) {
    this.db
      .prepare("UPDATE wake_up_occurrences SET turn_id = ? WHERE id = ?")
      .run(args.turnId, args.id);
  }

  listOccurrences(args: {
    wakeUpId: string;
    limit?: number;
  }): WakeUpOccurrence[] {
    // The clamp must cover everything pruning can retain: up to
    // `maxRetainedOccurrences` recent rows PLUS up to
    // `minRetainedFiredOccurrences` protected `fired` rows. Clamping to the
    // general cap alone would hide the protected `fired` rows from the
    // supervisor's already-consumed check, and an invisible receipt is the
    // same duplicate wake the retention floor exists to prevent.
    const limit = Math.min(
      Math.max(args.limit ?? 20, 1),
      WAKE_UP_LIMITS.maxRetainedOccurrences +
        WAKE_UP_LIMITS.minRetainedFiredOccurrences,
    );
    const rows = this.db
      .prepare(
        `SELECT ${OCCURRENCE_COLUMNS}
         FROM wake_up_occurrences
         WHERE wake_up_id = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT ?`,
      )
      .all(args.wakeUpId, limit) as WakeUpOccurrenceRow[];
    return rows.map(parseOccurrenceRow);
  }

  /**
   * History pruning, with one exemption: `fired` rows survive past the general
   * cap up to `keepFired`.
   *
   * They are not kept for display. A completion wake-up asks "have I already
   * consumed this finished child" by looking for that child's `fired` row, and
   * the ledger goes on reporting the child for as long as it sits in the
   * ledger's own list window. If a burst of `deferred` rows pushed that one
   * `fired` row out of the retained window, the completion would look new again
   * and wake the task a second time.
   */
  pruneOccurrences(args: {
    wakeUpId: string;
    keep?: number;
    keepFired?: number;
  }): number {
    const keep = Math.max(
      args.keep ?? WAKE_UP_LIMITS.maxRetainedOccurrences,
      1,
    );
    const keepFired = Math.max(
      args.keepFired ?? WAKE_UP_LIMITS.minRetainedFiredOccurrences,
      1,
    );
    const result = this.db
      .prepare(
        `DELETE FROM wake_up_occurrences
         WHERE wake_up_id = ?
           AND id NOT IN (
             SELECT id FROM wake_up_occurrences
             WHERE wake_up_id = ?
             ORDER BY recorded_at DESC, id DESC
             LIMIT ?
           )
           AND id NOT IN (
             SELECT id FROM wake_up_occurrences
             WHERE wake_up_id = ? AND outcome = 'fired'
             ORDER BY recorded_at DESC, id DESC
             LIMIT ?
           )`,
      )
      .run(args.wakeUpId, args.wakeUpId, keep, args.wakeUpId, keepFired);
    return Number(result.changes ?? 0);
  }
}

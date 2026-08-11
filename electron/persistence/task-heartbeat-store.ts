/**
 * Durable storage for task heartbeats and their occurrences.
 *
 * Used by: `electron/persistence/sqlite-store.ts` (delegation) and, through it,
 * `electron/host-service/task-supervisor-runtime.ts`.
 *
 * These are deliberately NOT ledger tables. The run ledger records delegated
 * execution — runs, steps, receipts. A heartbeat records wake-ups on a task the
 * user already owns, which has a different lifetime and no claim semantics.
 */
import {
  TaskHeartbeatOccurrenceSchema,
  TaskHeartbeatSchema,
  TASK_HEARTBEAT_LIMITS,
  type TaskHeartbeat,
  type TaskHeartbeatOccurrence,
} from "../../src/lib/automation/task-supervisor";

interface TaskHeartbeatStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface TaskHeartbeatDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => TaskHeartbeatStatement;
}

interface TaskHeartbeatRow {
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

interface TaskHeartbeatOccurrenceRow {
  id: string;
  heartbeat_id: string;
  idempotency_key: string;
  workspace_id: string;
  task_id: string;
  turn_id: string | null;
  outcome: string;
  reason: string | null;
  scheduled_for: string;
  recorded_at: string;
}

const HEARTBEAT_COLUMNS = `
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
  heartbeat_id,
  idempotency_key,
  workspace_id,
  task_id,
  turn_id,
  outcome,
  reason,
  scheduled_for,
  recorded_at
`;

function parseHeartbeatRow(row: TaskHeartbeatRow): TaskHeartbeat {
  return TaskHeartbeatSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    projectPath: row.project_path,
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
  row: TaskHeartbeatOccurrenceRow,
): TaskHeartbeatOccurrence {
  return TaskHeartbeatOccurrenceSchema.parse({
    id: row.id,
    heartbeatId: row.heartbeat_id,
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

export class TaskHeartbeatStore {
  private readonly db: TaskHeartbeatDatabase;

  constructor(database: unknown) {
    this.db = database as TaskHeartbeatDatabase;
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_heartbeats (
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

      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_heartbeats_task
        ON task_heartbeats (task_id);

      CREATE INDEX IF NOT EXISTS idx_task_heartbeats_due
        ON task_heartbeats (state, next_run_at);

      CREATE TABLE IF NOT EXISTS task_heartbeat_occurrences (
        id TEXT PRIMARY KEY,
        heartbeat_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        turn_id TEXT,
        outcome TEXT NOT NULL,
        reason TEXT,
        scheduled_for TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_heartbeat_occurrence_key
        ON task_heartbeat_occurrences (heartbeat_id, idempotency_key);

      CREATE INDEX IF NOT EXISTS idx_task_heartbeat_occurrences_recent
        ON task_heartbeat_occurrences (heartbeat_id, recorded_at DESC);
    `);
  }

  list(): TaskHeartbeat[] {
    const rows = this.db
      .prepare(
        `SELECT ${HEARTBEAT_COLUMNS}
         FROM task_heartbeats
         ORDER BY created_at DESC, id ASC`,
      )
      .all() as TaskHeartbeatRow[];
    return rows.map(parseHeartbeatRow);
  }

  /** Everything the scheduler still has to look at. */
  listActive(): TaskHeartbeat[] {
    const rows = this.db
      .prepare(
        `SELECT ${HEARTBEAT_COLUMNS}
         FROM task_heartbeats
         WHERE state != 'stopped'
         ORDER BY created_at ASC, id ASC`,
      )
      .all() as TaskHeartbeatRow[];
    return rows.map(parseHeartbeatRow);
  }

  listForWorkspace(workspaceId: string): TaskHeartbeat[] {
    const rows = this.db
      .prepare(
        `SELECT ${HEARTBEAT_COLUMNS}
         FROM task_heartbeats
         WHERE workspace_id = ?
         ORDER BY created_at DESC, id ASC`,
      )
      .all(workspaceId) as TaskHeartbeatRow[];
    return rows.map(parseHeartbeatRow);
  }

  get(id: string): TaskHeartbeat | null {
    const row = this.db
      .prepare(
        `SELECT ${HEARTBEAT_COLUMNS} FROM task_heartbeats WHERE id = ?`,
      )
      .get(id) as TaskHeartbeatRow | undefined;
    return row ? parseHeartbeatRow(row) : null;
  }

  getByTaskId(taskId: string): TaskHeartbeat | null {
    const row = this.db
      .prepare(
        `SELECT ${HEARTBEAT_COLUMNS} FROM task_heartbeats WHERE task_id = ?`,
      )
      .get(taskId) as TaskHeartbeatRow | undefined;
    return row ? parseHeartbeatRow(row) : null;
  }

  upsert(input: TaskHeartbeat): TaskHeartbeat {
    const heartbeat = TaskHeartbeatSchema.parse(input);
    this.db
      .prepare(
        `INSERT INTO task_heartbeats (
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
        heartbeat.id,
        heartbeat.workspaceId,
        heartbeat.taskId,
        heartbeat.projectPath,
        heartbeat.prompt,
        JSON.stringify(heartbeat.trigger),
        JSON.stringify(heartbeat.fingerprint),
        heartbeat.state,
        heartbeat.pauseReason,
        heartbeat.stopReason,
        heartbeat.reasonDetail,
        heartbeat.nextRunAt,
        heartbeat.lastOccurrenceAt,
        heartbeat.occurrenceCount,
        heartbeat.skippedCount,
        heartbeat.maxOccurrences,
        heartbeat.expiresAt,
        heartbeat.createdAt,
        heartbeat.updatedAt,
      );
    return this.get(heartbeat.id)!;
  }

  remove(id: string): boolean {
    this.db
      .prepare("DELETE FROM task_heartbeat_occurrences WHERE heartbeat_id = ?")
      .run(id);
    const result = this.db
      .prepare("DELETE FROM task_heartbeats WHERE id = ?")
      .run(id);
    return Number(result.changes ?? 0) > 0;
  }

  /**
   * Records one occurrence, or reports that it already exists. The unique index
   * on (heartbeat_id, idempotency_key) is what makes a duplicate delivery
   * harmless: `false` means "this instant was already handled, do not fire".
   */
  recordOccurrence(occurrence: TaskHeartbeatOccurrence): boolean {
    const parsed = TaskHeartbeatOccurrenceSchema.parse(occurrence);
    const result = this.db
      .prepare(
        `INSERT INTO task_heartbeat_occurrences (
           id,
           heartbeat_id,
           idempotency_key,
           workspace_id,
           task_id,
           turn_id,
           outcome,
           reason,
           scheduled_for,
           recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(heartbeat_id, idempotency_key) DO NOTHING`,
      )
      .run(
        parsed.id,
        parsed.heartbeatId,
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
      .prepare("UPDATE task_heartbeat_occurrences SET turn_id = ? WHERE id = ?")
      .run(args.turnId, args.id);
  }

  listOccurrences(args: {
    heartbeatId: string;
    limit?: number;
  }): TaskHeartbeatOccurrence[] {
    // The clamp must cover everything pruning can retain: up to
    // `maxRetainedOccurrences` recent rows PLUS up to
    // `minRetainedFiredOccurrences` protected `fired` rows. Clamping to the
    // general cap alone would hide the protected `fired` rows from the
    // supervisor's already-consumed check, and an invisible receipt is the
    // same duplicate wake the retention floor exists to prevent.
    const limit = Math.min(
      Math.max(args.limit ?? 20, 1),
      TASK_HEARTBEAT_LIMITS.maxRetainedOccurrences +
        TASK_HEARTBEAT_LIMITS.minRetainedFiredOccurrences,
    );
    const rows = this.db
      .prepare(
        `SELECT ${OCCURRENCE_COLUMNS}
         FROM task_heartbeat_occurrences
         WHERE heartbeat_id = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT ?`,
      )
      .all(args.heartbeatId, limit) as TaskHeartbeatOccurrenceRow[];
    return rows.map(parseOccurrenceRow);
  }

  /**
   * History pruning, with one exemption: `fired` rows survive past the general
   * cap up to `keepFired`.
   *
   * They are not kept for display. A completion heartbeat asks "have I already
   * consumed this finished child" by looking for that child's `fired` row, and
   * the ledger goes on reporting the child for as long as it sits in the
   * ledger's own list window. If a burst of `deferred` rows pushed that one
   * `fired` row out of the retained window, the completion would look new again
   * and wake the task a second time.
   */
  pruneOccurrences(args: {
    heartbeatId: string;
    keep?: number;
    keepFired?: number;
  }): number {
    const keep = Math.max(
      args.keep ?? TASK_HEARTBEAT_LIMITS.maxRetainedOccurrences,
      1,
    );
    const keepFired = Math.max(
      args.keepFired ?? TASK_HEARTBEAT_LIMITS.minRetainedFiredOccurrences,
      1,
    );
    const result = this.db
      .prepare(
        `DELETE FROM task_heartbeat_occurrences
         WHERE heartbeat_id = ?
           AND id NOT IN (
             SELECT id FROM task_heartbeat_occurrences
             WHERE heartbeat_id = ?
             ORDER BY recorded_at DESC, id DESC
             LIMIT ?
           )
           AND id NOT IN (
             SELECT id FROM task_heartbeat_occurrences
             WHERE heartbeat_id = ? AND outcome = 'fired'
             ORDER BY recorded_at DESC, id DESC
             LIMIT ?
           )`,
      )
      .run(args.heartbeatId, args.heartbeatId, keep, args.heartbeatId, keepFired);
    return Number(result.changes ?? 0);
  }
}

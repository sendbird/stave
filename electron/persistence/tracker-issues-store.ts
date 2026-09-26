/**
 * Local cache for tracker tickets and the Stave runs they started.
 *
 * This store holds ticket metadata only. It must never persist a credential, a
 * lease id, or a lease hash: those already live in the connector vault keyed by
 * job id, and duplicating them here would spread the same secret into a file
 * that exists purely so the task list can render without a network round trip.
 * That is why the schema is thinner than the runtime state it supports — the
 * missing columns are deliberate, not an oversight to be filled in later.
 */
import {
  TrackerIssueSchema,
  TrackerIssueStaveLinkSchema,
  type TrackerSourceId,
  type TrackerIssue,
  type TrackerIssueLinkState,
  type TrackerIssueStaveLink,
} from "../../src/lib/tracker-issues/types";

interface TrackerIssuesStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface TrackerIssuesDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => TrackerIssuesStatement;
  transaction: <TResult>(callback: () => TResult) => () => TResult;
}

interface TrackerIssueRow {
  source: string;
  task_ref: string;
  task_json: string;
}

interface TrackerKickoffRow {
  id: string;
  source: string;
  task_ref: string;
  task_key: string;
  workspace_id: string;
  stave_task_id: string | null;
  crane_job_id: string | null;
  state: string;
  error_code: string | null;
  local_turn_json: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Kickoff states that will never move again on their own.
 *
 * Retention only ever deletes these. A `running` or `needs_input` row older
 * than the cutoff means a run was lost without ever reporting an outcome, and
 * that is a bug worth leaving visible rather than a row to quietly drop.
 */
export const TRACKER_ISSUE_TERMINAL_LINK_STATES: TrackerIssueLinkState[] = [
  "completed",
  "failed",
  "cancelled",
];

/**
 * Refs per `IN (...)` batch.
 *
 * A refresh can hand back thousands of refs at once and SQLite caps bound
 * variables per statement, so the lookup is chunked well below any build's
 * limit instead of trusting the caller's list to stay small.
 */
const REF_CHUNK_SIZE = 400;

const TASK_COLUMNS = `source, task_ref, task_json`;

const KICKOFF_COLUMNS = `id, source, task_ref, task_key, workspace_id,
  stave_task_id, crane_job_id, state, error_code, created_at, updated_at, local_turn_json`;

const KICKOFF_ORDER = `ORDER BY created_at DESC, id ASC`;

function parseKickoffRow(row: TrackerKickoffRow): TrackerIssueStaveLink {
  return TrackerIssueStaveLinkSchema.parse({
    id: row.id,
    source: row.source,
    taskRef: row.task_ref,
    taskKey: row.task_key,
    workspaceId: row.workspace_id,
    staveTaskId: row.stave_task_id,
    craneJobId: row.crane_job_id,
    state: row.state,
    errorCode: row.error_code,
    ...(row.local_turn_json
      ? { localTurn: JSON.parse(row.local_turn_json) }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function compareKickoffs(
  left: TrackerIssueStaveLink,
  right: TrackerIssueStaveLink,
): number {
  return left.createdAt === right.createdAt
    ? left.id.localeCompare(right.id)
    : right.createdAt.localeCompare(left.createdAt);
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export interface TrackerIssuesStoreOptions {
  /**
   * Called once per cached row that no longer parses, so a list that silently
   * shrinks after an upgrade is still traceable to the rows that caused it.
   */
  onUnreadableTaskRow?: (details: {
    source: string;
    taskRef: string;
    error: unknown;
  }) => void;
}

// temporary-migration: tracker-issue-tables
/** Names written before the Tasks surface was renamed to Issues. */
const LEGACY_TRACKER_TABLES = [
  ["tracker_tasks_cache", "tracker_issues_cache"],
  ["tracker_task_kickoffs", "tracker_issue_kickoffs"],
] as const;
const LEGACY_TRACKER_INDEXES = [
  "idx_tracker_tasks_cache_recent",
  "idx_tracker_task_kickoffs_task",
  "idx_tracker_task_kickoffs_crane_job",
  "idx_tracker_task_kickoffs_stave_task",
];

/**
 * Renames the legacy tables and drops the legacy index names; the bootstrap
 * recreates the indexes under the new names. An empty new table next to a
 * legacy one yields to the legacy data; if both hold rows the legacy table is
 * kept and reported rather than merged. Runs once, before the bootstrap.
 */
export function migrateLegacyTrackerIssueTables(db: TrackerIssuesDatabase) {
  const tableExists = (name: string) =>
    Boolean(
      db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(name),
    );
  const rowCount = (name: string) =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get() as { count: number })
      .count;
  db.transaction(() => {
    for (const [legacy, current] of LEGACY_TRACKER_TABLES) {
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
    for (const index of LEGACY_TRACKER_INDEXES) {
      db.exec(`DROP INDEX IF EXISTS ${index}`);
    }
  })();
}
// end temporary-migration: tracker-issue-tables

export class TrackerIssuesStore {
  private readonly db: TrackerIssuesDatabase;
  private readonly options: TrackerIssuesStoreOptions;
  private unreadableTaskRowCount = 0;

  constructor(database: unknown, options: TrackerIssuesStoreOptions = {}) {
    this.db = database as TrackerIssuesDatabase;
    this.options = options;
    // temporary-migration: tracker-issue-tables
    migrateLegacyTrackerIssueTables(this.db);
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracker_issues_cache (
        source TEXT NOT NULL,
        task_ref TEXT NOT NULL,
        task_key TEXT NOT NULL,
        task_json TEXT NOT NULL,
        task_updated_at TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (source, task_ref)
      );

      CREATE INDEX IF NOT EXISTS idx_tracker_issues_cache_recent
        ON tracker_issues_cache (source, task_updated_at DESC);

      CREATE TABLE IF NOT EXISTS tracker_issue_kickoffs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        task_ref TEXT NOT NULL,
        task_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        stave_task_id TEXT,
        crane_job_id TEXT,
        state TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tracker_issue_kickoffs_task
        ON tracker_issue_kickoffs (source, task_ref);

      CREATE INDEX IF NOT EXISTS idx_tracker_issue_kickoffs_crane_job
        ON tracker_issue_kickoffs (crane_job_id);

      CREATE INDEX IF NOT EXISTS idx_tracker_issue_kickoffs_stave_task
        ON tracker_issue_kickoffs (stave_task_id);
    `);
    const columns = this.db
      .prepare("PRAGMA table_info(tracker_issue_kickoffs)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "local_turn_json")) {
      this.db.exec(
        "ALTER TABLE tracker_issue_kickoffs ADD COLUMN local_turn_json TEXT",
      );
    }
  }

  /** How many cached ticket rows have been skipped as unreadable since open. */
  getUnreadableTaskRowCount(): number {
    return this.unreadableTaskRowCount;
  }

  private readTaskRow(row: TrackerIssueRow): TrackerIssue | null {
    try {
      return TrackerIssueSchema.parse(JSON.parse(row.task_json));
    } catch (error) {
      // A row written by a newer build can carry a shape this one rejects.
      // Skipping it keeps the rest of the list usable; throwing would let a
      // single ticket blank the whole surface until the cache is cleared.
      this.unreadableTaskRowCount += 1;
      this.options.onUnreadableTaskRow?.({
        source: row.source,
        taskRef: row.task_ref,
        error,
      });
      return null;
    }
  }

  /**
   * Swap one source's cached tickets for a freshly fetched set.
   *
   * Scoped to a single source and run as one transaction, so a tracker that
   * fails or returns an unusable row part-way through leaves both its own
   * previous rows and every other source's rows exactly as they were.
   */
  replaceSourceTasks(
    source: TrackerSourceId,
    tasks: TrackerIssue[],
    fetchedAt: string,
  ): void {
    const deleteStatement = this.db.prepare(
      `DELETE FROM tracker_issues_cache WHERE source = ?`,
    );
    const insertStatement = this.db.prepare(
      `INSERT INTO tracker_issues_cache (
         source, task_ref, task_key, task_json, task_updated_at, fetched_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      deleteStatement.run(source);
      for (const candidate of tasks) {
        const task = TrackerIssueSchema.parse(candidate);
        if (task.source !== source) {
          throw new Error(
            "A cached tracker issue must belong to the source it is written under.",
          );
        }
        insertStatement.run(
          task.source,
          task.ref,
          task.key,
          JSON.stringify(task),
          task.updatedAt,
          fetchedAt,
        );
      }
    })();
  }

  listSourceTasks(source?: TrackerSourceId): TrackerIssue[] {
    const rows = this.db
      .prepare(
        `SELECT ${TASK_COLUMNS}
         FROM tracker_issues_cache
         ${source ? "WHERE source = ?" : ""}
         ORDER BY task_updated_at DESC, source ASC, task_ref ASC`,
      )
      .all(...(source ? [source] : [])) as TrackerIssueRow[];

    const tasks: TrackerIssue[] = [];
    for (const row of rows) {
      const task = this.readTaskRow(row);
      if (task) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  /** Null for a missing row and for an unreadable one, per `readTaskRow`. */
  getTask(source: TrackerSourceId, taskRef: string): TrackerIssue | null {
    const row = this.db
      .prepare(
        `SELECT ${TASK_COLUMNS}
         FROM tracker_issues_cache
         WHERE source = ? AND task_ref = ?`,
      )
      .get(source, taskRef) as TrackerIssueRow | undefined;
    return row ? this.readTaskRow(row) : null;
  }

  upsertKickoff(link: TrackerIssueStaveLink): void {
    const kickoff = TrackerIssueStaveLinkSchema.parse(link);
    this.db
      .prepare(
        `INSERT INTO tracker_issue_kickoffs (
           id, source, task_ref, task_key, workspace_id, stave_task_id,
           crane_job_id, state, error_code, created_at, updated_at, local_turn_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           task_key = excluded.task_key,
           workspace_id = excluded.workspace_id,
           stave_task_id = excluded.stave_task_id,
           crane_job_id = excluded.crane_job_id,
           state = excluded.state,
           error_code = excluded.error_code,
           local_turn_json = excluded.local_turn_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        kickoff.id,
        kickoff.source,
        kickoff.taskRef,
        kickoff.taskKey,
        kickoff.workspaceId,
        kickoff.staveTaskId,
        kickoff.craneJobId,
        kickoff.state,
        kickoff.errorCode,
        kickoff.createdAt,
        kickoff.updatedAt,
        kickoff.localTurn ? JSON.stringify(kickoff.localTurn) : null,
      );
  }

  private queryKickoffs(
    where: string,
    params: unknown[],
    limit?: number,
  ): TrackerKickoffRow[] {
    return this.db
      .prepare(
        `SELECT ${KICKOFF_COLUMNS}
         FROM tracker_issue_kickoffs
         ${where}
         ${KICKOFF_ORDER}
         ${limit ? `LIMIT ${limit}` : ""}`,
      )
      .all(...params) as TrackerKickoffRow[];
  }

  private firstKickoff(
    where: string,
    params: unknown[],
  ): TrackerIssueStaveLink | null {
    const [row] = this.queryKickoffs(where, params, 1);
    return row ? parseKickoffRow(row) : null;
  }

  listKickoffs(
    args: { source?: TrackerSourceId; taskRefs?: string[] } = {},
  ): TrackerIssueStaveLink[] {
    const sourceClause = args.source ? ["source = ?"] : [];
    const sourceParams = args.source ? [args.source] : [];

    if (!args.taskRefs) {
      const where = sourceClause.length ? `WHERE ${sourceClause[0]}` : "";
      return this.queryKickoffs(where, sourceParams).map(parseKickoffRow);
    }

    const rows: TrackerKickoffRow[] = [];
    for (const batch of chunk([...new Set(args.taskRefs)], REF_CHUNK_SIZE)) {
      const clauses = [
        ...sourceClause,
        `task_ref IN (${batch.map(() => "?").join(", ")})`,
      ];
      rows.push(
        ...this.queryKickoffs(`WHERE ${clauses.join(" AND ")}`, [
          ...sourceParams,
          ...batch,
        ]),
      );
    }

    // Each batch is ordered only within itself, so the merged result is sorted
    // once here to keep the contract identical to the single-statement path.
    return rows.map(parseKickoffRow).sort(compareKickoffs);
  }

  findKickoffByCraneJobId(craneJobId: string): TrackerIssueStaveLink | null {
    return this.firstKickoff("WHERE crane_job_id = ?", [craneJobId]);
  }

  findKickoffByStaveTask(taskId: string): TrackerIssueStaveLink | null {
    return this.firstKickoff("WHERE stave_task_id = ?", [taskId]);
  }

  findLatestKickoffForTask(
    source: TrackerSourceId,
    taskRef: string,
  ): TrackerIssueStaveLink | null {
    return this.firstKickoff("WHERE source = ? AND task_ref = ?", [
      source,
      taskRef,
    ]);
  }

  /** Drops finished kickoffs older than the cutoff; see the terminal list. */
  pruneKickoffsBefore(cutoff: string): number {
    const placeholders = TRACKER_ISSUE_TERMINAL_LINK_STATES.map(() => "?").join(
      ", ",
    );
    const result = this.db
      .prepare(
        `DELETE FROM tracker_issue_kickoffs
         WHERE state IN (${placeholders})
           AND updated_at < ?`,
      )
      .run(...TRACKER_ISSUE_TERMINAL_LINK_STATES, cutoff);
    return Number(result.changes ?? 0);
  }
}

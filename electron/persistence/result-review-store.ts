import { ListTaskReadStatesArgsSchema, SetTaskReadStatesArgsSchema, type ListTaskReadStatesArgs, type SetTaskReadStatesArgs, type SetTaskReadStatesResult, type TaskReadNotificationChange, type TaskReadState, type TaskReadTarget } from "../../src/lib/task-read-state";
import {
  APP_NOTIFICATION_KINDS,
  buildNotificationExpiresAt,
  isNotificationAttentionKind,
  isTaskCompletionNotificationKind,
  isTaskReadAttentionKind,
  type AppNotificationKind,
} from "../../src/lib/notifications/notification.types";
import type {
  ListResultReviewsArgs,
  ResultReview,
  ResultReviewPage,
  SetResultMarkedReviewedArgs,
  SetResultReviewedArgs,
  SetResultsReviewedArgs,
} from "../../src/lib/reviews/result-review";
import { ResultEvidenceSchema } from "../../src/lib/reviews/result-evidence";

interface ReviewDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

const COLUMNS = `id, project_path AS repositoryPath, project_name AS repositoryName,
  workspace_id AS workspaceId, workspace_name AS workspaceName,
  task_id AS taskId, task_title AS taskTitle, turn_id AS turnId,
  outcome, summary, created_at AS createdAt, reviewed_at AS reviewedAt,
  marked_reviewed_at AS markedReviewedAt`;
const EVIDENCE_COLUMN = `(SELECT evidence_json FROM result_review_evidence WHERE scope_key = json_array(result_reviews.project_path, result_reviews.workspace_id, result_reviews.task_id, result_reviews.turn_id)) AS evidenceJson`;
const INSERT_COLUMNS = `id, project_path, project_name, workspace_id,
  workspace_name, task_id, task_title, turn_id, outcome, summary, created_at`;

function sourceValues(prefix: string) {
  return `${prefix}id, ${prefix}project_path, COALESCE(${prefix}project_name, 'Project'),
    ${prefix}workspace_id, COALESCE(${prefix}workspace_name, 'Workspace'),
    ${prefix}task_id, COALESCE(${prefix}task_title, ${prefix}title), ${prefix}turn_id,
    CASE WHEN ${prefix}kind = 'task.turn_failed' THEN 'failed' ELSE 'completed' END,
    substr(${prefix}body, 1, 2000), ${prefix}created_at`;
}

function sourcePredicate(prefix: string) {
  return `${prefix}kind IN ('task.turn_completed', 'task.turn_failed')
    AND length(trim(${prefix}project_path)) > 0
    AND length(trim(${prefix}workspace_id)) > 0
    AND length(trim(${prefix}task_id)) > 0
    AND length(trim(${prefix}turn_id)) > 0`;
}

const sqlKinds = (predicate: (kind: AppNotificationKind) => boolean) =>
  APP_NOTIFICATION_KINDS.filter(predicate).map(kind => `'${kind}'`).join(", ");
const READ_ATTENTION_KINDS_SQL = sqlKinds(isTaskReadAttentionKind);
const PENDING_ATTENTION_KINDS_SQL = sqlKinds(isNotificationAttentionKind);
const COMPLETION_KINDS_SQL = sqlKinds(isTaskCompletionNotificationKind);
/** Targets travel as one JSON array so a batch is one statement, not one per task. */
const TARGETS_CTE = `WITH targets(ord, workspace_id, task_id) AS (
  SELECT CAST(key AS INTEGER), json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?))`;
const IN_TARGETS = "(workspace_id, task_id) IN (SELECT workspace_id, task_id FROM targets)";
const LATEST_RESULT_ID = `(SELECT r.id FROM result_reviews r WHERE r.workspace_id = t.workspace_id AND r.task_id = t.task_id
  ORDER BY r.created_at DESC, r.id DESC LIMIT 1)`;
const NOTIFICATION_CHANGE = "RETURNING id, read_at AS readAt, expires_at AS expiresAt";
const encodeTargets = (targets: readonly TaskReadTarget[]) =>
  JSON.stringify(targets.map(target => [target.workspaceId, target.taskId]));
/** Read sets the usual retention, except on attention that is still answerable. */
const READ_NOTIFICATION_SET = `read_at = COALESCE(read_at, ?), expires_at = CASE
  WHEN kind IN (${PENDING_ATTENTION_KINDS_SQL}) AND resolved_at IS NULL THEN NULL
  ELSE COALESCE(expires_at, ?) END`;

function prepareTaskReadStatements(db: ReviewDatabase) {
  return {
    list: db.prepare(`${TARGETS_CTE}
      SELECT t.workspace_id AS workspaceId, t.task_id AS taskId,
        (SELECT r.reviewed_at IS NULL FROM result_reviews r WHERE r.workspace_id = t.workspace_id AND r.task_id = t.task_id
          ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS latestUnread,
        EXISTS (SELECT 1 FROM notifications n WHERE n.workspace_id = t.workspace_id AND n.task_id = t.task_id
          AND n.kind IN (${READ_ATTENTION_KINDS_SQL}) AND n.read_at IS NULL AND n.resolved_at IS NULL) AS attention,
        EXISTS (SELECT 1 FROM task_read_marks m WHERE m.workspace_id = t.workspace_id AND m.task_id = t.task_id) AS manual
      FROM targets t ORDER BY t.ord`),
    readOutputs: db.prepare(`${TARGETS_CTE}
      UPDATE result_reviews SET reviewed_at = COALESCE(reviewed_at, ?)
      WHERE id IN (SELECT ${LATEST_RESULT_ID} FROM targets t)`),
    unreadOutputs: db.prepare(`${TARGETS_CTE}
      UPDATE result_reviews SET reviewed_at = NULL
      WHERE id IN (SELECT ${LATEST_RESULT_ID} FROM targets t)`),
    readNotifications: db.prepare(`${TARGETS_CTE}
      UPDATE notifications SET ${READ_NOTIFICATION_SET}
      WHERE read_at IS NULL AND ${IN_TARGETS}
        AND (kind IN (${COMPLETION_KINDS_SQL}) OR (kind IN (${READ_ATTENTION_KINDS_SQL}) AND resolved_at IS NULL))
      ${NOTIFICATION_CHANGE}`),
    readAttention: db.prepare(`${TARGETS_CTE}
      UPDATE notifications SET ${READ_NOTIFICATION_SET}
      WHERE read_at IS NULL AND ${IN_TARGETS} AND kind IN (${READ_ATTENTION_KINDS_SQL}) AND resolved_at IS NULL
      ${NOTIFICATION_CHANGE}`),
    // Unread reopens only the latest output's completion, and clears expiry so
    // retention cannot prune what the user asked to keep unread.
    unreadNotifications: db.prepare(`${TARGETS_CTE}
      UPDATE notifications SET read_at = NULL, expires_at = NULL
      WHERE (read_at IS NOT NULL OR expires_at IS NOT NULL) AND (
        (kind IN (${READ_ATTENTION_KINDS_SQL}) AND resolved_at IS NULL AND ${IN_TARGETS})
        OR (kind IN (${COMPLETION_KINDS_SQL}) AND (workspace_id, task_id, turn_id) IN (
          SELECT r.workspace_id, r.task_id, r.turn_id FROM targets t JOIN result_reviews r ON r.id = ${LATEST_RESULT_ID})))
      ${NOTIFICATION_CHANGE}`),
    deleteMarks: db.prepare(`${TARGETS_CTE} DELETE FROM task_read_marks WHERE ${IN_TARGETS}`),
    insertMarks: db.prepare(`${TARGETS_CTE}
      INSERT OR IGNORE INTO task_read_marks (workspace_id, task_id) SELECT workspace_id, task_id FROM targets`),
  };
}

/** Result history has no notification-retention dependency. Both host and
 * renderer notifications enter this transactionally, including replay. */
export class ResultReviewStore {
  constructor(private readonly db: ReviewDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_read_marks (workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, PRIMARY KEY(workspace_id, task_id));
      CREATE TABLE IF NOT EXISTS result_reviews (
        id TEXT NOT NULL PRIMARY KEY,
        project_path TEXT NOT NULL, project_name TEXT NOT NULL,
        workspace_id TEXT NOT NULL, workspace_name TEXT NOT NULL,
        task_id TEXT NOT NULL, task_title TEXT NOT NULL, turn_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('completed', 'failed')),
        summary TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT,
        UNIQUE(project_path, workspace_id, task_id, turn_id)
      );
      CREATE INDEX IF NOT EXISTS idx_result_reviews_pending
        ON result_reviews(reviewed_at, created_at, id);
      CREATE INDEX IF NOT EXISTS idx_result_reviews_task
        ON result_reviews(workspace_id, task_id, created_at, id);
      CREATE INDEX IF NOT EXISTS idx_result_reviews_latest_task
        ON result_reviews(project_path, workspace_id, task_id, created_at DESC, id DESC);
      CREATE TABLE IF NOT EXISTS result_review_evidence (
        scope_key TEXT NOT NULL PRIMARY KEY,
        evidence_json TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS capture_result_review
      AFTER INSERT ON notifications WHEN ${sourcePredicate("NEW.")}
      BEGIN
        INSERT OR IGNORE INTO result_reviews (${INSERT_COLUMNS})
        VALUES (${sourceValues("NEW.")});
      END;
      INSERT OR IGNORE INTO result_reviews (${INSERT_COLUMNS})
        SELECT ${sourceValues("")} FROM notifications WHERE ${sourcePredicate("")};
      CREATE TRIGGER IF NOT EXISTS capture_result_review_evidence
      AFTER INSERT ON notifications
      WHEN ${sourcePredicate("NEW.")} AND json_valid(NEW.payload_json)
        AND json_type(NEW.payload_json, '$.resultEvidence') = 'object'
      BEGIN
        INSERT OR IGNORE INTO result_review_evidence (scope_key, evidence_json)
        VALUES (json_array(NEW.project_path, NEW.workspace_id, NEW.task_id, NEW.turn_id), json_extract(NEW.payload_json, '$.resultEvidence'));
      END;
      INSERT OR IGNORE INTO result_review_evidence (scope_key, evidence_json)
        SELECT json_array(project_path, workspace_id, task_id, turn_id), json_extract(payload_json, '$.resultEvidence') FROM notifications
        WHERE ${sourcePredicate("")} AND json_valid(payload_json)
          AND json_type(payload_json, '$.resultEvidence') = 'object';
    `);
    // Expand-only: the explicit reviewed mark, added once to tables from before it.
    const columns = db.prepare("PRAGMA table_info(result_reviews)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "marked_reviewed_at")) {
      db.exec("ALTER TABLE result_reviews ADD COLUMN marked_reviewed_at TEXT");
    }
  }

  /** Prepared on first use: the notifications table is created by its own store. */
  private taskReadStatementCache: ReturnType<typeof prepareTaskReadStatements> | null = null;
  private get taskReadStatements() {
    return (this.taskReadStatementCache ??= prepareTaskReadStatements(this.db));
  }

  /** One query for every target, whatever the batch size. */
  listTaskReadStates(input: ListTaskReadStatesArgs): TaskReadState[] {
    const args = ListTaskReadStatesArgsSchema.parse(input);
    if (!args.targets.length) return [];
    const rows = this.taskReadStatements.list.all(encodeTargets(args.targets)) as Array<{
      workspaceId: string; taskId: string; latestUnread: number | null; attention: number; manual: number;
    }>;
    return rows.map(row => ({
      workspaceId: row.workspaceId,
      taskId: row.taskId,
      unread: Boolean(row.latestUnread === 1 || row.attention || (row.latestUnread === null && row.manual)),
    }));
  }

  /**
   * Completion read state remains in result_reviews; task_read_marks only holds
   * a manual reminder for tasks with no output. The task's completion and
   * attention notifications follow the same mark so the bell count agrees.
   * Reading never resolves attention.
   */
  setTaskReadStates(input: SetTaskReadStatesArgs): SetTaskReadStatesResult {
    const args = SetTaskReadStatesArgsSchema.parse(input);
    const statements = this.taskReadStatements;
    const targets = encodeTargets(args.targets);
    const now = new Date().toISOString();
    const expiresAt = buildNotificationExpiresAt({ readAt: now });
    this.db.exec("SAVEPOINT set_task_read_state");
    try {
      let notifications: TaskReadNotificationChange[];
      if (args.read) {
        if (!args.attentionOnly) statements.readOutputs.run(targets, now);
        notifications = (args.attentionOnly ? statements.readAttention : statements.readNotifications)
          .all(targets, now, expiresAt) as TaskReadNotificationChange[];
        statements.deleteMarks.run(targets);
      } else {
        statements.unreadOutputs.run(targets);
        notifications = statements.unreadNotifications.all(targets) as TaskReadNotificationChange[];
        statements.insertMarks.run(targets);
      }
      const states = this.listTaskReadStates({ targets: args.targets });
      this.db.exec("RELEASE set_task_read_state");
      return { states, notifications };
    } catch (error) {
      this.db.exec("ROLLBACK TO set_task_read_state"); this.db.exec("RELEASE set_task_read_state"); throw error;
    }
  }

  list(args: ListResultReviewsArgs = {}): ResultReviewPage {
    const predicates: string[] = [];
    const values: unknown[] = [];
    if (args.latestPerTask) {
      // A newer read result still supersedes an older unread failure. Compare
      // against all history, not just rows surviving the caller's filters.
      predicates.push(`NOT EXISTS (
        SELECT 1 FROM result_reviews AS newer
        WHERE newer.project_path = result_reviews.project_path
          AND newer.workspace_id = result_reviews.workspace_id
          AND newer.task_id = result_reviews.task_id
          AND (newer.created_at, newer.id) > (result_reviews.created_at, result_reviews.id)
      )`);
    }
    if (args.workspaceIds) {
      predicates.push(args.workspaceIds.length ? `workspace_id IN (${args.workspaceIds.map(() => "?").join(",")})` : "0 = 1");
      values.push(...args.workspaceIds);
    }
    if (args.workspaceId) {
      predicates.push("workspace_id = ?");
      values.push(args.workspaceId);
    }
    if (args.taskId) {
      predicates.push("task_id = ?");
      values.push(args.taskId);
    }
    if (args.turnId) {
      predicates.push("turn_id = ?");
      values.push(args.turnId);
    }
    if (args.pendingOnly) predicates.push("reviewed_at IS NULL");
    const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(200, args.limit ?? 100));
    const offset = Math.max(0, args.offset ?? 0);
    const total = (
      this.db
        .prepare(`SELECT count(*) AS count FROM result_reviews ${where}`)
        .get(...values) as { count: number }
    ).count;
    const results = this.db
      .prepare(
        `SELECT ${COLUMNS}${args.includeEvidence === false ? "" : `, ${EVIDENCE_COLUMN}`} FROM result_reviews ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset).map(decodeReview);
    return { results, total, hasMore: offset + results.length < total };
  }

  setReviewed(args: SetResultReviewedArgs): ResultReview | null {
    const identity = [
      args.repositoryPath,
      args.workspaceId,
      args.taskId,
      args.turnId,
    ];
    const where =
      "project_path = ? AND workspace_id = ? AND task_id = ? AND turn_id = ?";
    // Timestamp belongs to the writer. Duplicate acknowledgement preserves it;
    // reopening a result is an explicit reversible user action.
    this.db
      .prepare(
        `UPDATE result_reviews SET reviewed_at = ${
          args.reviewed ? "COALESCE(reviewed_at, ?)" : "NULL"
        } WHERE ${where}`,
      )
      .run(...(args.reviewed ? [new Date().toISOString()] : []), ...identity);
    const row = this.db
        .prepare(`SELECT ${COLUMNS}, ${EVIDENCE_COLUMN} FROM result_reviews WHERE ${where}`)
        .get(...identity);
    return row ? decodeReview(row) : null;
  }

  /**
   * The explicit "Mark reviewed" decision. A reviewed result is also read;
   * taking the mark back keeps it read.
   */
  setMarkedReviewed(args: SetResultMarkedReviewedArgs): ResultReview | null {
    const identity = [args.repositoryPath, args.workspaceId, args.taskId, args.turnId];
    const where = "project_path = ? AND workspace_id = ? AND task_id = ? AND turn_id = ?";
    const now = new Date().toISOString();
    this.db
      .prepare(
        args.markedReviewed
          ? `UPDATE result_reviews SET marked_reviewed_at = COALESCE(marked_reviewed_at, ?), reviewed_at = COALESCE(reviewed_at, ?) WHERE ${where}`
          : `UPDATE result_reviews SET marked_reviewed_at = NULL WHERE ${where}`,
      )
      .run(...(args.markedReviewed ? [now, now] : []), ...identity);
    const row = this.db.prepare(`SELECT ${COLUMNS}, ${EVIDENCE_COLUMN} FROM result_reviews WHERE ${where}`).get(...identity);
    return row ? decodeReview(row) : null;
  }

  /**
   * Acknowledges (or reopens) many results at once.
   *
   * Wrapped in a savepoint so a partial clear can never be observed: Fleet
   * reports "N cleared" from the return value, and a half-applied bulk write
   * would make that count a lie while leaving the rail inconsistent with it.
   * A savepoint rather than BEGIN keeps this safe if a caller already opened a
   * transaction around it.
   */
  setManyReviewed(args: SetResultsReviewedArgs): number {
    const reviewedAt = new Date().toISOString();
    const statement = this.db.prepare(
      `UPDATE result_reviews SET reviewed_at = ${
        args.reviewed ? "COALESCE(reviewed_at, ?)" : "NULL"
      } WHERE project_path = ? AND workspace_id = ? AND task_id = ? AND turn_id = ?`,
    );
    this.db.exec("SAVEPOINT set_many_result_reviews");
    try {
      let updated = 0;
      for (const scope of args.scopes) {
        const result = statement.run(
          ...(args.reviewed ? [reviewedAt] : []),
          scope.repositoryPath,
          scope.workspaceId,
          scope.taskId,
          scope.turnId,
        ) as { changes?: number };
        updated += result?.changes ?? 0;
      }
      this.db.exec("RELEASE set_many_result_reviews");
      return updated;
    } catch (error) {
      this.db.exec("ROLLBACK TO set_many_result_reviews");
      this.db.exec("RELEASE set_many_result_reviews");
      throw error;
    }
  }
}

function decodeReview(row: unknown): ResultReview {
  const { evidenceJson, ...result } = row as ResultReview & { evidenceJson?: string | null };
  if (evidenceJson) {
    try {
      const evidence = ResultEvidenceSchema.safeParse(JSON.parse(evidenceJson));
      if (evidence.success) return { ...result, evidence: evidence.data };
    } catch { /* Legacy evidence is optional; never invent a captured result. */ }
  }
  return result;
}

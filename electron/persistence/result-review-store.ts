import type {
  ListResultReviewsArgs,
  ResultReview,
  ResultReviewPage,
  SetResultReviewedArgs,
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

const COLUMNS = `id, project_path AS projectPath, project_name AS projectName,
  workspace_id AS workspaceId, workspace_name AS workspaceName,
  task_id AS taskId, task_title AS taskTitle, turn_id AS turnId,
  outcome, summary, created_at AS createdAt, reviewed_at AS reviewedAt`;
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

/** Result history has no notification-retention dependency. Both host and
 * renderer notifications enter this transactionally, including replay. */
export class ResultReviewStore {
  constructor(private readonly db: ReviewDatabase) {
    db.exec(`
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
  }

  list(args: ListResultReviewsArgs = {}): ResultReviewPage {
    const predicates: string[] = [];
    const values: unknown[] = [];
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
      args.projectPath,
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

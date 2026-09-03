/**
 * Durable storage for project memory ("project brain").
 *
 * Used by: `electron/persistence/sqlite-store.ts` (delegation) and, through it,
 * the renderer IPC handlers in main and the Local MCP tools in host-service.
 *
 * Rows are scoped by `project_path` and are never read across projects. An
 * FTS5 trigram index over `content` backs recall by the task's first message;
 * when the bundled SQLite lacks FTS5 the store degrades to `LIKE` and keeps
 * working. Dedup happens in code (trigram Jaccard on normalized text) so the
 * rule is identical on both index paths and unit-testable without SQLite.
 */
import { randomUUID } from "node:crypto";
import {
  PROJECT_MEMORY_CONTENT_MAX_CHARS,
  PROJECT_MEMORY_INJECTION_MAX_ITEMS,
  PROJECT_MEMORY_STALE_AFTER_MS,
  PROJECT_MEMORY_STALE_CONFIDENCE_FLOOR,
  PROJECT_MEMORY_DUPLICATE_SIMILARITY,
  ProjectMemoryKindSchema,
  createProjectMemorySimilarityMatcher,
  extractProjectMemoryQueryTerms,
  normalizeProjectMemoryContent,
  orderProjectMemoriesForInjection,
  type ProjectMemory,
  type ProjectMemoryKind,
  type ProjectMemoryRememberResult,
} from "../../src/lib/project-memory";

interface ProjectMemoryStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface ProjectMemoryDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => ProjectMemoryStatement;
}

interface ProjectMemoryRow {
  id: string;
  project_path: string;
  kind: string;
  content: string;
  source_task_id: string | null;
  source_turn_id: string | null;
  confidence: number;
  created_at: number;
  last_confirmed_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const COLUMNS = `
  id,
  project_path,
  kind,
  content,
  source_task_id,
  source_turn_id,
  confidence,
  created_at,
  last_confirmed_at,
  updated_at,
  deleted_at
`;

/** Bound on rows scanned for in-code dedup; a project never gets near this. */
const DEDUP_SCAN_LIMIT = 2000;

export type ProjectMemoryIndexMode = "fts5-trigram" | "fts5" | "like";

function parseRow(row: ProjectMemoryRow): ProjectMemory {
  return {
    id: row.id,
    projectPath: row.project_path,
    kind: ProjectMemoryKindSchema.parse(row.kind),
    content: row.content,
    sourceTaskId: row.source_task_id,
    sourceTurnId: row.source_turn_id,
    confidence: row.confidence,
    createdAt: row.created_at,
    lastConfirmedAt: row.last_confirmed_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function assertContent(value: string) {
  const content = normalizeProjectMemoryContent(value);
  if (!content) {
    throw new Error("Project memory content is required.");
  }
  if (content.length > PROJECT_MEMORY_CONTENT_MAX_CHARS) {
    throw new Error(
      `Project memory content must be at most ${PROJECT_MEMORY_CONTENT_MAX_CHARS} characters.`,
    );
  }
  return content;
}

function escapeFtsTerm(term: string) {
  return `"${term.replaceAll('"', '""')}"`;
}

export class ProjectMemoryStore {
  private readonly db: ProjectMemoryDatabase;
  private indexMode: ProjectMemoryIndexMode = "like";

  constructor(database: unknown) {
    this.db = database as ProjectMemoryDatabase;
    this.bootstrap();
  }

  get index() {
    return this.indexMode;
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_memories (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source_task_id TEXT,
        source_turn_id TEXT,
        confidence REAL NOT NULL,
        created_at INTEGER NOT NULL,
        last_confirmed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_project_memories_project
        ON project_memories (project_path, deleted_at, confidence DESC, last_confirmed_at DESC);
    `);
    this.indexMode = this.bootstrapFts();
  }

  /**
   * External-content FTS table kept in sync by triggers. Trigram first (best
   * for substring and CJK matches), then the default tokenizer, then none.
   */
  private bootstrapFts(): ProjectMemoryIndexMode {
    const attempts: Array<{
      mode: ProjectMemoryIndexMode;
      tokenize: string;
    }> = [
      { mode: "fts5-trigram", tokenize: ", tokenize='trigram'" },
      { mode: "fts5", tokenize: "" },
    ];
    for (const attempt of attempts) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS project_memories_fts
            USING fts5(content, content='project_memories', content_rowid='rowid'${attempt.tokenize});
        `);
      } catch {
        continue;
      }
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS project_memories_ai
          AFTER INSERT ON project_memories BEGIN
            INSERT INTO project_memories_fts(rowid, content)
              VALUES (new.rowid, new.content);
          END;
        CREATE TRIGGER IF NOT EXISTS project_memories_ad
          AFTER DELETE ON project_memories BEGIN
            INSERT INTO project_memories_fts(project_memories_fts, rowid, content)
              VALUES ('delete', old.rowid, old.content);
          END;
        CREATE TRIGGER IF NOT EXISTS project_memories_au
          AFTER UPDATE OF content ON project_memories BEGIN
            INSERT INTO project_memories_fts(project_memories_fts, rowid, content)
              VALUES ('delete', old.rowid, old.content);
            INSERT INTO project_memories_fts(rowid, content)
              VALUES (new.rowid, new.content);
          END;
      `);
      return attempt.mode;
    }
    return "like";
  }

  list(args: { projectPath: string; includeDeleted?: boolean }) {
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM project_memories
         WHERE project_path = ?
           ${args.includeDeleted ? "" : "AND deleted_at IS NULL"}
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC`,
      )
      .all(args.projectPath) as ProjectMemoryRow[];
    return rows.map(parseRow);
  }

  get(id: string): ProjectMemory | null {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM project_memories WHERE id = ?`)
      .get(id) as ProjectMemoryRow | undefined;
    return row ? parseRow(row) : null;
  }

  /**
   * Insert, or — when a same-kind near-duplicate already exists for the
   * project — confirm that row instead: bump `last_confirmed_at` and keep the
   * higher confidence. A soft-deleted duplicate is left deleted, so
   * re-extraction of a fact the user removed does not resurrect it.
   */
  remember(args: {
    projectPath: string;
    kind: ProjectMemoryKind;
    content: string;
    confidence: number;
    sourceTaskId?: string | null;
    sourceTurnId?: string | null;
    now?: number;
  }): ProjectMemoryRememberResult | null {
    const content = assertContent(args.content);
    const kind = ProjectMemoryKindSchema.parse(args.kind);
    const confidence = clampConfidence(args.confidence);
    const now = args.now ?? Date.now();

    const similarity = createProjectMemorySimilarityMatcher(content);
    const duplicate = this.dedupCandidates({
      projectPath: args.projectPath,
      kind,
      content,
    }).find(
      (existing) =>
        similarity(existing.content) >= PROJECT_MEMORY_DUPLICATE_SIMILARITY,
    );

    if (duplicate) {
      if (duplicate.deletedAt !== null) {
        return null;
      }
      const nextConfidence = Math.max(duplicate.confidence, confidence);
      this.db
        .prepare(
          `UPDATE project_memories
           SET confidence = ?, last_confirmed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(nextConfidence, now, now, duplicate.id);
      return {
        memory: {
          ...duplicate,
          confidence: nextConfidence,
          lastConfirmedAt: now,
          updatedAt: now,
        },
        outcome: "confirmed",
      };
    }

    const memory: ProjectMemory = {
      id: randomUUID(),
      projectPath: args.projectPath,
      kind,
      content,
      sourceTaskId: args.sourceTaskId ?? null,
      sourceTurnId: args.sourceTurnId ?? null,
      confidence,
      createdAt: now,
      lastConfirmedAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.db
      .prepare(
        `INSERT INTO project_memories (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        memory.id,
        memory.projectPath,
        memory.kind,
        memory.content,
        memory.sourceTaskId,
        memory.sourceTurnId,
        memory.confidence,
        memory.createdAt,
        memory.lastConfirmedAt,
        memory.updatedAt,
      );
    return { memory, outcome: "inserted" };
  }

  /**
   * Rows worth comparing against a new memory. Deleted rows are included on
   * purpose: a soft-deleted duplicate must block re-insertion. With FTS the
   * candidate set is the rows sharing any query term; without it, the whole
   * same-kind slice of the project (bounded, a project never gets near it).
   * Live rows come first so an active duplicate wins over a deleted one.
   */
  private dedupCandidates(args: {
    projectPath: string;
    kind: ProjectMemoryKind;
    content: string;
  }): ProjectMemory[] {
    if (this.indexMode !== "like") {
      const terms = extractProjectMemoryQueryTerms(args.content, 12);
      if (terms.length > 0) {
        try {
          const rows = this.db
            .prepare(
              `SELECT ${qualifiedColumns("m")}
               FROM project_memories_fts f
               JOIN project_memories m ON m.rowid = f.rowid
               WHERE project_memories_fts MATCH ?
                 AND m.project_path = ? AND m.kind = ?
               ORDER BY m.deleted_at IS NOT NULL, bm25(project_memories_fts)
               LIMIT 64`,
            )
            .all(
              terms.map(escapeFtsTerm).join(" OR "),
              args.projectPath,
              args.kind,
            ) as ProjectMemoryRow[];
          return rows.map(parseRow);
        } catch {
          // Fall through to the scan below.
        }
      }
    }
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM project_memories
         WHERE project_path = ? AND kind = ?
         ORDER BY deleted_at IS NOT NULL, last_confirmed_at DESC
         LIMIT ${DEDUP_SCAN_LIMIT}`,
      )
      .all(args.projectPath, args.kind) as ProjectMemoryRow[];
    return rows.map(parseRow);
  }

  update(args: {
    id: string;
    kind?: ProjectMemoryKind;
    content?: string;
    now?: number;
  }): ProjectMemory | null {
    const current = this.get(args.id);
    if (!current || current.deletedAt !== null) {
      return null;
    }
    const kind = args.kind ? ProjectMemoryKindSchema.parse(args.kind) : current.kind;
    const content =
      args.content !== undefined ? assertContent(args.content) : current.content;
    const now = args.now ?? Date.now();
    this.db
      .prepare(
        `UPDATE project_memories
         SET kind = ?, content = ?, updated_at = ?, last_confirmed_at = ?
         WHERE id = ?`,
      )
      .run(kind, content, now, now, args.id);
    return { ...current, kind, content, updatedAt: now, lastConfirmedAt: now };
  }

  /** Soft delete. Returns false when the row is unknown or already deleted. */
  softDelete(args: { id: string; now?: number }) {
    const now = args.now ?? Date.now();
    const result = this.db
      .prepare(
        `UPDATE project_memories
         SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, args.id);
    return Number(result.changes ?? 0) > 0;
  }

  /**
   * Rows for injection: not deleted, not stale, strongest first, with rows the
   * query text matches promoted ahead of the default order. Bounded by
   * `limit`; the caller applies the byte cap on the rendered lines.
   */
  recall(args: {
    projectPath: string;
    query?: string | null;
    limit?: number;
    now?: number;
  }): ProjectMemory[] {
    const now = args.now ?? Date.now();
    const limit = args.limit ?? PROJECT_MEMORY_INJECTION_MAX_ITEMS;
    const staleBefore = now - PROJECT_MEMORY_STALE_AFTER_MS;

    const matched = this.recallByQuery({
      projectPath: args.projectPath,
      query: args.query ?? "",
      limit,
      staleBefore,
    });
    if (matched.length >= limit) {
      return matched.slice(0, limit);
    }
    const matchedIds = new Set(matched.map((memory) => memory.id));

    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM project_memories
         WHERE ${activeWhereClause("")}
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC
         LIMIT ?`,
      )
      .all(args.projectPath, staleBefore, limit) as ProjectMemoryRow[];
    const rest = orderProjectMemoriesForInjection(
      rows.map(parseRow),
      now,
    ).filter((memory) => !matchedIds.has(memory.id));
    return [...matched, ...rest].slice(0, limit);
  }

  private recallByQuery(args: {
    projectPath: string;
    query: string;
    limit: number;
    staleBefore: number;
  }): ProjectMemory[] {
    const terms = extractProjectMemoryQueryTerms(args.query);
    if (terms.length === 0) {
      return [];
    }
    if (this.indexMode !== "like") {
      try {
        const match = terms.map(escapeFtsTerm).join(" OR ");
        const rows = this.db
          .prepare(
            `SELECT ${qualifiedColumns("m")}
             FROM project_memories_fts f
             JOIN project_memories m ON m.rowid = f.rowid
             WHERE project_memories_fts MATCH ?
               AND ${activeWhereClause("m.")}
             ORDER BY bm25(project_memories_fts), m.confidence DESC, m.id ASC
             LIMIT ?`,
          )
          .all(
            match,
            args.projectPath,
            args.staleBefore,
            args.limit,
          ) as ProjectMemoryRow[];
        return rows.map(parseRow);
      } catch {
        // A MATCH expression SQLite rejects must never cost the turn its memory.
        return [];
      }
    }
    const likeTerms = terms.slice(0, 8);
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM project_memories
         WHERE ${activeWhereClause("")}
           AND (${likeTerms.map(() => "lower(content) LIKE ?").join(" OR ")})
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC
         LIMIT ?`,
      )
      .all(
        args.projectPath,
        args.staleBefore,
        ...likeTerms.map(
          (term) => `%${term.replaceAll("%", "").replaceAll("_", "")}%`,
        ),
        args.limit,
      ) as ProjectMemoryRow[];
    return rows.map(parseRow);
  }
}

const COLUMN_NAMES = COLUMNS.split(",").map((column) => column.trim());

function qualifiedColumns(alias: string) {
  return COLUMN_NAMES.map((column) => `${alias}.${column}`).join(", ");
}

/** Binds, in order: project_path, stale-before timestamp. */
function activeWhereClause(prefix: string) {
  return `${prefix}project_path = ?
      AND ${prefix}deleted_at IS NULL
      AND NOT (${prefix}confidence < ${PROJECT_MEMORY_STALE_CONFIDENCE_FLOOR}
               AND ${prefix}last_confirmed_at < ?)`;
}

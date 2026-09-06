/**
 * Durable storage for project memory ("project brain").
 *
 * Used by: `electron/persistence/sqlite-store.ts` (delegation) and, through it,
 * the renderer IPC handlers in main and the Local MCP tools in host-service.
 *
 * Rows are scoped by `project_path` and are never read across projects. An
 * FTS5 trigram index over `content` backs recall by the current request;
 * when the bundled SQLite lacks FTS5 the store degrades to literal substring lookup and keeps
 * working. Dedup compares exact normalized text so the
 * rule is identical on both index paths and unit-testable without SQLite.
 */
import { randomUUID } from "node:crypto";
import {
  PROJECT_MEMORY_CONTENT_MAX_CHARS,
  PROJECT_MEMORY_INJECTION_MAX_ITEMS,
  PROJECT_MEMORY_CORE_MAX_ITEMS,
  PROJECT_MEMORY_CANDIDATE_MAX_ITEMS,
  PROJECT_MEMORY_STALE_AFTER_MS,
  PROJECT_MEMORY_STALE_CONFIDENCE_FLOOR,
  ProjectMemoryKindSchema,
  ProjectMemoryRecallModeSchema,
  ProjectMemorySearchOptionsSchema,
  isSameProjectMemoryContent,
  extractProjectMemoryQueryTerms,
  normalizeProjectMemoryContent,
  type ProjectMemory,
  type ProjectMemoryKind,
  type ProjectMemoryRecallMode,
  type ProjectMemorySearchOptions,
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
  recall_mode: string;
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
  recall_mode,
  content,
  source_task_id,
  source_turn_id,
  confidence,
  created_at,
  last_confirmed_at,
  updated_at,
  deleted_at
`;

export type ProjectMemoryIndexMode = "fts5-trigram" | "fts5" | "like";

function parseRow(row: ProjectMemoryRow): ProjectMemory {
  return {
    id: row.id,
    projectPath: row.project_path,
    kind: ProjectMemoryKindSchema.parse(row.kind),
    recallMode: ProjectMemoryRecallModeSchema.parse(row.recall_mode),
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
    // Additive migration: existing explicit memories become searchable;
    // automatically extracted rows remain available for curation, not recall.
    const columns = this.db.prepare("PRAGMA table_info(project_memories)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "recall_mode")) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const current = this.db.prepare("PRAGMA table_info(project_memories)").all() as Array<{ name: string }>;
        if (!current.some((column) => column.name === "recall_mode")) {
          this.db.exec(`ALTER TABLE project_memories ADD COLUMN recall_mode TEXT NOT NULL DEFAULT 'candidate';
            UPDATE project_memories SET recall_mode = 'contextual' WHERE confidence >= 0.7;`);
        }
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    this.indexMode = this.bootstrapFts();
    // Main and host-service have separate connections: enforce capacity at
    // the write boundary, not just in the friendly preflight above it.
    for (const event of ["INSERT", "UPDATE"] as const) {
      this.db.exec(`CREATE TRIGGER IF NOT EXISTS project_memories_core_${event.toLowerCase()}
        BEFORE ${event} ON project_memories
        WHEN new.recall_mode = 'core' AND new.deleted_at IS NULL
        AND (SELECT count(*) FROM project_memories WHERE project_path = new.project_path
          AND recall_mode = 'core' AND deleted_at IS NULL AND id != new.id) >= ${PROJECT_MEMORY_CORE_MAX_ITEMS}
        BEGIN SELECT RAISE(ABORT, 'Core memory is full; consolidate or unpin an existing memory first.'); END;`);
    }
  }

  /**
   * External-content FTS table kept in sync by triggers. Trigram first (best
   * for substring and CJK matches), then the default tokenizer, then none.
   */
  private bootstrapFts(): ProjectMemoryIndexMode {
    const existed = Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE name = 'project_memories_fts'").get());
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
      if (!existed) {
        this.db.exec("INSERT INTO project_memories_fts(project_memories_fts) VALUES ('rebuild')");
      }
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

  search(args: { projectPath: string } & ProjectMemorySearchOptions) {
    const { projectPath, ...options } = args;
    const parsed = ProjectMemorySearchOptionsSchema.parse(options);
    const terms = extractProjectMemoryQueryTerms(parsed.query ?? "", 8);
    const offset = parsed.offset ?? 0;
    const conditions = ["project_path = ?", "deleted_at IS NULL"];
    const params: unknown[] = [projectPath];
    if (parsed.recallMode) {
      conditions.push("recall_mode = ?");
      params.push(parsed.recallMode);
    }
    if (parsed.query?.trim()) {
      if (!terms.length) return { memories: [], nextOffset: null };
      conditions.push(`(${terms.map(() => "instr(lower(content), ?) > 0").join(" OR ")})`);
      params.push(...terms);
    }
    const rows = this.db.prepare(`SELECT ${COLUMNS} FROM project_memories
      WHERE ${conditions.join(" AND ")} ORDER BY id ASC LIMIT 13 OFFSET ?`)
      .all(...params, offset) as ProjectMemoryRow[];
    return {
      memories: rows.slice(0, 12).map(parseRow),
      nextOffset: rows.length > 12 ? offset + 12 : null,
    };
  }

  /**
   * Insert, or — when a same-kind exact duplicate already exists for the
   * project — confirm that row instead: bump `last_confirmed_at` and keep the
   * higher confidence. A soft-deleted duplicate is left deleted, so
   * re-extraction of a fact the user removed does not resurrect it.
   */
  remember(args: {
    projectPath: string;
    kind: ProjectMemoryKind;
    content: string;
    confidence: number;
    recallMode?: ProjectMemoryRecallMode;
    sourceTaskId?: string | null;
    sourceTurnId?: string | null;
    now?: number;
  }): ProjectMemoryRememberResult | null {
    const content = assertContent(args.content);
    const kind = ProjectMemoryKindSchema.parse(args.kind);
    const confidence = clampConfidence(args.confidence);
    const now = args.now ?? Date.now();
    const recallMode = ProjectMemoryRecallModeSchema.parse(
      confidence < 0.7 ? "candidate" : (args.recallMode ?? "contextual"),
    );

    const duplicate = this.dedupCandidates({
      projectPath: args.projectPath,
      kind,
      content,
    }).find(
      (existing) =>
        isSameProjectMemoryContent(existing.content, content),
    );

    if (duplicate) {
      if (duplicate.deletedAt !== null) {
        return null;
      }
      const nextConfidence = Math.max(duplicate.confidence, confidence);
      // Re-extraction must neither demote nor reconfirm curated memory.
      if (recallMode === "candidate" && duplicate.recallMode !== "candidate") {
        return { memory: duplicate, outcome: "confirmed" };
      }
      const nextMode = recallMode === "candidate" ? "candidate" :
        (args.recallMode ?? (duplicate.recallMode === "candidate" ? recallMode : duplicate.recallMode));
      this.assertCoreCapacity(args.projectPath, nextMode, duplicate.id);
      const confirmed = this.db
        .prepare(
          `UPDATE project_memories
           SET confidence = ?, last_confirmed_at = ?, updated_at = ?, recall_mode = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(nextConfidence, now, now, nextMode, duplicate.id);
      if (Number(confirmed.changes ?? 0) === 0) return null;
      return {
        memory: {
          ...duplicate,
          confidence: nextConfidence,
          recallMode: nextMode,
          lastConfirmedAt: now,
          updatedAt: now,
        },
        outcome: "confirmed",
      };
    }

    this.assertCoreCapacity(args.projectPath, recallMode);
    if (recallMode === "candidate") {
      const count = this.db.prepare(`SELECT count(*) AS count FROM project_memories
        WHERE project_path = ? AND deleted_at IS NULL AND recall_mode = 'candidate'`).get(args.projectPath) as { count: number };
      if (count.count >= PROJECT_MEMORY_CANDIDATE_MAX_ITEMS) return null;
    }

    const memory: ProjectMemory = {
      id: randomUUID(),
      projectPath: args.projectPath,
      kind,
      recallMode,
      content,
      sourceTaskId: args.sourceTaskId ?? null,
      sourceTurnId: args.sourceTurnId ?? null,
      confidence,
      createdAt: now,
      lastConfirmedAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const inserted = this.db
      .prepare(
        `INSERT INTO project_memories (${COLUMNS})
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
         WHERE (? != 'candidate' OR (SELECT count(*) FROM project_memories
           WHERE project_path = ? AND deleted_at IS NULL AND recall_mode = 'candidate') < ${PROJECT_MEMORY_CANDIDATE_MAX_ITEMS})
         AND NOT EXISTS (SELECT 1 FROM project_memories WHERE project_path = ? AND kind = ? AND content = ?)`,
      )
      .run(
        memory.id,
        memory.projectPath,
        memory.kind,
        memory.recallMode,
        memory.content,
        memory.sourceTaskId,
        memory.sourceTurnId,
        memory.confidence,
        memory.createdAt,
        memory.lastConfirmedAt,
        memory.updatedAt,
        memory.recallMode,
        memory.projectPath,
        memory.projectPath,
        memory.kind,
        memory.content,
      );
    if (Number(inserted.changes ?? 0) === 0) return null;
    return { memory, outcome: "inserted" };
  }

  /** Stored content is normalized at every write; exact lookup includes tombstones. */
  private dedupCandidates(args: {
    projectPath: string;
    kind: ProjectMemoryKind;
    content: string;
  }): ProjectMemory[] {
    const rows = this.db.prepare(`SELECT ${COLUMNS} FROM project_memories
      WHERE project_path = ? AND kind = ? AND content = ?
      ORDER BY deleted_at IS NOT NULL, id ASC LIMIT 1`)
      .all(args.projectPath, args.kind, args.content) as ProjectMemoryRow[];
    return rows.map(parseRow);
  }

  update(args: {
    id: string;
    projectPath: string;
    recallMode?: ProjectMemoryRecallMode;
    kind?: ProjectMemoryKind;
    content?: string;
    now?: number;
  }): ProjectMemory | null {
    const current = this.get(args.id);
    if (!current || current.deletedAt !== null || current.projectPath !== args.projectPath) {
      return null;
    }
    const kind = args.kind ? ProjectMemoryKindSchema.parse(args.kind) : current.kind;
    const content =
      args.content !== undefined ? assertContent(args.content) : current.content;
    const now = args.now ?? Date.now();
    const recallMode = ProjectMemoryRecallModeSchema.parse(args.recallMode ?? current.recallMode);
    this.assertCoreCapacity(current.projectPath, recallMode, current.id);
    const updated = this.db
      .prepare(
        `UPDATE project_memories
         SET kind = ?, content = ?, updated_at = ?, last_confirmed_at = ?, recall_mode = ?, confidence = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(kind, content, now, now, recallMode, 0.9, args.id);
    if (Number(updated.changes ?? 0) === 0) return null;
    return { ...current, kind, content, recallMode, confidence: 0.9, updatedAt: now, lastConfirmedAt: now };
  }

  private assertCoreCapacity(projectPath: string, mode: ProjectMemoryRecallMode, id = "") {
    if (mode !== "core") return;
    const row = this.db.prepare(`SELECT count(*) AS count FROM project_memories
      WHERE project_path = ? AND recall_mode = 'core' AND deleted_at IS NULL AND id != ?`).get(projectPath, id) as { count: number };
    if (row.count >= PROJECT_MEMORY_CORE_MAX_ITEMS) {
      throw new Error(`Keep at most ${PROJECT_MEMORY_CORE_MAX_ITEMS} core memories. Merge or change an existing core memory to contextual first.`);
    }
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
   * Recall only curated core and query matches, never unrelated fallback.
   * The caller applies the character cap on the rendered block.
   */
  recall(args: {
    projectPath: string;
    query?: string | null;
    limit?: number;
    now?: number;
  }): ProjectMemory[] {
    const now = args.now ?? Date.now();
    const limit = Math.max(0, Math.min(PROJECT_MEMORY_INJECTION_MAX_ITEMS, Math.floor(args.limit ?? PROJECT_MEMORY_INJECTION_MAX_ITEMS)));
    const staleBefore = now - PROJECT_MEMORY_STALE_AFTER_MS;
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM project_memories
         WHERE ${activeWhereClause("")}
           AND recall_mode = 'core'
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC
         LIMIT ?`,
      )
      .all(args.projectPath, staleBefore, Math.min(limit, PROJECT_MEMORY_CORE_MAX_ITEMS)) as ProjectMemoryRow[];
    const core = rows.map(parseRow);
    const matched = this.recallByQuery({
      projectPath: args.projectPath,
      query: args.query ?? "",
      limit,
      staleBefore,
    });
    const coreIds = new Set(core.map((memory) => memory.id));
    return [...core, ...matched.filter((memory) => !coreIds.has(memory.id))].slice(0, limit);
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
    if (this.indexMode !== "like" && terms.every((term) => term.length >= 3)) {
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
        // Fall back to literal substring lookup.
      }
    }
    const likeTerms = terms.slice(0, 8);
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM project_memories
         WHERE ${activeWhereClause("")}
           AND (${likeTerms.map(() => "instr(lower(content), ?) > 0").join(" OR ")})
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC
         LIMIT ?`,
      )
      .all(
        args.projectPath,
        args.staleBefore,
        ...likeTerms,
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
      AND ${prefix}recall_mode != 'candidate'
      AND NOT (${prefix}confidence < ${PROJECT_MEMORY_STALE_CONFIDENCE_FLOOR}
               AND ${prefix}last_confirmed_at < ?)`;
}

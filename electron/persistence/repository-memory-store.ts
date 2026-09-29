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
import { RepositoryMemorySettingsStore } from "./repository-memory-settings-store";
import {
  REPOSITORY_MEMORY_CONTENT_MAX_CHARS,
  REPOSITORY_MEMORY_INJECTION_MAX_ITEMS,
  REPOSITORY_MEMORY_CORE_MAX_ITEMS,
  REPOSITORY_MEMORY_CANDIDATE_MAX_ITEMS,
  REPOSITORY_MEMORY_STALE_AFTER_MS,
  REPOSITORY_MEMORY_STALE_CONFIDENCE_FLOOR,
  RepositoryMemoryKindSchema,
  RepositoryMemoryRecallModeSchema,
  RepositoryMemorySearchOptionsSchema,
  isSameRepositoryMemoryContent,
  extractRepositoryMemoryQueryTerms,
  normalizeRepositoryMemoryContent,
  type RepositoryMemory,
  type RepositoryMemoryKind,
  type RepositoryMemoryRecallMode,
  type RepositoryMemorySearchOptions,
  type RepositoryMemoryRememberResult,
} from "../../src/lib/repository-memory";

interface RepositoryMemoryStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface RepositoryMemoryDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => RepositoryMemoryStatement;
}

interface RepositoryMemoryRow {
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

export type RepositoryMemoryIndexMode = "fts5-trigram" | "fts5" | "like";

function parseRow(row: RepositoryMemoryRow): RepositoryMemory {
  return {
    id: row.id,
    repositoryPath: row.project_path,
    kind: RepositoryMemoryKindSchema.parse(row.kind),
    recallMode: RepositoryMemoryRecallModeSchema.parse(row.recall_mode),
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
  const content = normalizeRepositoryMemoryContent(value);
  if (!content) {
    throw new Error("Project memory content is required.");
  }
  if (content.length > REPOSITORY_MEMORY_CONTENT_MAX_CHARS) {
    throw new Error(
      `Project memory content must be at most ${REPOSITORY_MEMORY_CONTENT_MAX_CHARS} characters.`,
    );
  }
  return content;
}

function escapeFtsTerm(term: string) {
  return `"${term.replaceAll('"', '""')}"`;
}

// temporary-migration: repository-memory-tables
function tableColumns(db: RepositoryMemoryDatabase, name: string) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  if (!exists) return [];
  return db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>;
}

/**
 * The repository-memory rows used to live in `project_memories`. The projects
 * feature now owns that table, so an existing path-scoped table is renamed
 * before projects create theirs. Runs once; afterwards the legacy names are gone.
 */
export function migrateLegacyRepositoryMemoryTables(db: RepositoryMemoryDatabase) {
  const legacyColumns = tableColumns(db, "project_memories");
  const legacyMemory =
    legacyColumns.some((column) => column.name === "project_path") &&
    !legacyColumns.some((column) => column.name === "project_id");
  const currentMemory = tableColumns(db, "repository_memories").length > 0;
  const legacySettings = tableColumns(db, "project_memory_settings").length > 0;
  const currentSettings = tableColumns(db, "repository_memory_settings").length > 0;
  if (!legacyMemory && !legacySettings) return;

  db.exec("SAVEPOINT legacy_repository_memory_tables");
  try {
    if (legacyMemory && !currentMemory) {
      db.exec(`
        DROP TRIGGER IF EXISTS project_memories_ai;
        DROP TRIGGER IF EXISTS project_memories_ad;
        DROP TRIGGER IF EXISTS project_memories_au;
        DROP TRIGGER IF EXISTS project_memories_core_insert;
        DROP TRIGGER IF EXISTS project_memories_core_update;
        DROP TABLE IF EXISTS project_memories_fts;
        DROP INDEX IF EXISTS idx_project_memories_project;
        ALTER TABLE project_memories RENAME TO repository_memories;
      `);
    } else if (legacyMemory && currentMemory) {
      console.warn(
        "[persistence] left legacy project_memories in place because repository_memories already exists",
      );
    }
    if (legacySettings && !currentSettings) {
      db.exec("ALTER TABLE project_memory_settings RENAME TO repository_memory_settings");
    }
    db.exec("RELEASE legacy_repository_memory_tables");
  } catch (error) {
    db.exec("ROLLBACK TO legacy_repository_memory_tables");
    db.exec("RELEASE legacy_repository_memory_tables");
    throw error;
  }
}
// end temporary-migration: repository-memory-tables

export class RepositoryMemoryStore {
  readonly settings: RepositoryMemorySettingsStore;
  private readonly db: RepositoryMemoryDatabase;
  private indexMode: RepositoryMemoryIndexMode = "like";

  constructor(database: unknown) {
    this.db = database as RepositoryMemoryDatabase;
    // temporary-migration: repository-memory-tables
    migrateLegacyRepositoryMemoryTables(this.db);
    this.bootstrap();
    this.settings = new RepositoryMemorySettingsStore(database);
  }

  get index() {
    return this.indexMode;
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repository_memories (
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

      CREATE INDEX IF NOT EXISTS idx_repository_memories_project
        ON repository_memories (project_path, deleted_at, confidence DESC, last_confirmed_at DESC);
    `);
    // Additive migration: existing explicit memories become searchable;
    // automatically extracted rows remain available for curation, not recall.
    const columns = this.db.prepare("PRAGMA table_info(repository_memories)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "recall_mode")) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const current = this.db.prepare("PRAGMA table_info(repository_memories)").all() as Array<{ name: string }>;
        if (!current.some((column) => column.name === "recall_mode")) {
          this.db.exec(`ALTER TABLE repository_memories ADD COLUMN recall_mode TEXT NOT NULL DEFAULT 'candidate';
            UPDATE repository_memories SET recall_mode = 'contextual' WHERE confidence >= 0.7;`);
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
      this.db.exec(`CREATE TRIGGER IF NOT EXISTS repository_memories_core_${event.toLowerCase()}
        BEFORE ${event} ON repository_memories
        WHEN new.recall_mode = 'core' AND new.deleted_at IS NULL
        AND (SELECT count(*) FROM repository_memories WHERE project_path = new.project_path
          AND recall_mode = 'core' AND deleted_at IS NULL AND id != new.id) >= ${REPOSITORY_MEMORY_CORE_MAX_ITEMS}
        BEGIN SELECT RAISE(ABORT, 'Core memory is full; consolidate or unpin an existing memory first.'); END;`);
    }
  }

  /**
   * External-content FTS table kept in sync by triggers. Trigram first (best
   * for substring and CJK matches), then the default tokenizer, then none.
   */
  private bootstrapFts(): RepositoryMemoryIndexMode {
    const existed = Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE name = 'repository_memories_fts'").get());
    const attempts: Array<{
      mode: RepositoryMemoryIndexMode;
      tokenize: string;
    }> = [
      { mode: "fts5-trigram", tokenize: ", tokenize='trigram'" },
      { mode: "fts5", tokenize: "" },
    ];
    for (const attempt of attempts) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS repository_memories_fts
            USING fts5(content, content='repository_memories', content_rowid='rowid'${attempt.tokenize});
        `);
      } catch {
        continue;
      }
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS repository_memories_ai
          AFTER INSERT ON repository_memories BEGIN
            INSERT INTO repository_memories_fts(rowid, content)
              VALUES (new.rowid, new.content);
          END;
        CREATE TRIGGER IF NOT EXISTS repository_memories_ad
          AFTER DELETE ON repository_memories BEGIN
            INSERT INTO repository_memories_fts(repository_memories_fts, rowid, content)
              VALUES ('delete', old.rowid, old.content);
          END;
        CREATE TRIGGER IF NOT EXISTS repository_memories_au
          AFTER UPDATE OF content ON repository_memories BEGIN
            INSERT INTO repository_memories_fts(repository_memories_fts, rowid, content)
              VALUES ('delete', old.rowid, old.content);
            INSERT INTO repository_memories_fts(rowid, content)
              VALUES (new.rowid, new.content);
          END;
      `);
      if (!existed) {
        this.db.exec("INSERT INTO repository_memories_fts(repository_memories_fts) VALUES ('rebuild')");
      }
      return attempt.mode;
    }
    return "like";
  }

  list(args: { repositoryPath: string; includeDeleted?: boolean }) {
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM repository_memories
         WHERE project_path = ?
           ${args.includeDeleted ? "" : "AND deleted_at IS NULL"}
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC`,
      )
      .all(args.repositoryPath) as RepositoryMemoryRow[];
    return rows.map(parseRow);
  }

  get(id: string): RepositoryMemory | null {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM repository_memories WHERE id = ?`)
      .get(id) as RepositoryMemoryRow | undefined;
    return row ? parseRow(row) : null;
  }

  search(args: { repositoryPath: string } & RepositoryMemorySearchOptions) {
    const { repositoryPath, ...options } = args;
    const parsed = RepositoryMemorySearchOptionsSchema.parse(options);
    const terms = extractRepositoryMemoryQueryTerms(parsed.query ?? "", 8);
    const offset = parsed.offset ?? 0;
    const conditions = ["project_path = ?", "deleted_at IS NULL"];
    const params: unknown[] = [repositoryPath];
    if (parsed.recallMode) {
      conditions.push("recall_mode = ?");
      params.push(parsed.recallMode);
    }
    if (parsed.query?.trim()) {
      if (!terms.length) return { memories: [], nextOffset: null };
      conditions.push(`(${terms.map(() => "instr(lower(content), ?) > 0").join(" OR ")})`);
      params.push(...terms);
    }
    const rows = this.db.prepare(`SELECT ${COLUMNS} FROM repository_memories
      WHERE ${conditions.join(" AND ")} ORDER BY id ASC LIMIT 13 OFFSET ?`)
      .all(...params, offset) as RepositoryMemoryRow[];
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
    repositoryPath: string;
    kind: RepositoryMemoryKind;
    content: string;
    confidence: number;
    recallMode?: RepositoryMemoryRecallMode;
    sourceTaskId?: string | null;
    sourceTurnId?: string | null;
    collectionRevision?: number;
    sourceCreatedAt?: number | null;
    now?: number;
  }): RepositoryMemoryRememberResult | null {
    const content = assertContent(args.content);
    const kind = RepositoryMemoryKindSchema.parse(args.kind);
    const confidence = clampConfidence(args.confidence);
    const policy = this.settings.get(args.repositoryPath);
    // Agent tool writes and summary extraction share the user's opt-in.
    if (!policy.collectAutomatically) return null;
    const automatic = confidence < 0.7;
    if (automatic && (
      !policy.kinds.includes(kind) ||
      (args.collectionRevision ?? 0) !== policy.revision ||
      (policy.resetBefore > 0 && (!args.sourceCreatedAt || args.sourceCreatedAt <= policy.resetBefore))
    )) return null;
    const now = args.now ?? Date.now();
    const recallMode = RepositoryMemoryRecallModeSchema.parse(
      confidence < 0.7 ? "candidate" : (args.recallMode ?? "contextual"),
    );

    const duplicate = this.dedupCandidates({
      repositoryPath: args.repositoryPath,
      kind,
      content,
    }).find(
      (existing) =>
        isSameRepositoryMemoryContent(existing.content, content),
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
      this.assertCoreCapacity(args.repositoryPath, nextMode, duplicate.id);
      const confirmed = this.db
        .prepare(
          `UPDATE repository_memories
           SET confidence = ?, last_confirmed_at = ?, updated_at = ?, recall_mode = ?
           WHERE id = ? AND deleted_at IS NULL
             AND (? = 0 OR COALESCE((SELECT revision FROM repository_memory_settings WHERE project_path = ?), 0) = ?)`,
        )
        .run(nextConfidence, now, now, nextMode, duplicate.id, Number(automatic), args.repositoryPath, policy.revision);
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

    this.assertCoreCapacity(args.repositoryPath, recallMode);
    if (recallMode === "candidate") {
      const count = this.db.prepare(`SELECT count(*) AS count FROM repository_memories
        WHERE project_path = ? AND deleted_at IS NULL AND recall_mode = 'candidate'`).get(args.repositoryPath) as { count: number };
      if (count.count >= REPOSITORY_MEMORY_CANDIDATE_MAX_ITEMS) return null;
    }

    const memory: RepositoryMemory = {
      id: randomUUID(),
      repositoryPath: args.repositoryPath,
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
        `INSERT INTO repository_memories (${COLUMNS})
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
         WHERE (? != 'candidate' OR (SELECT count(*) FROM repository_memories
           WHERE project_path = ? AND deleted_at IS NULL AND recall_mode = 'candidate') < ${REPOSITORY_MEMORY_CANDIDATE_MAX_ITEMS})
         AND NOT EXISTS (SELECT 1 FROM repository_memories WHERE project_path = ? AND kind = ? AND content = ?)
         AND (? = 0 OR COALESCE((SELECT revision FROM repository_memory_settings WHERE project_path = ?), 0) = ?)`,
      )
      .run(
        memory.id,
        memory.repositoryPath,
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
        memory.repositoryPath,
        memory.repositoryPath,
        memory.kind,
        memory.content,
        Number(automatic),
        args.repositoryPath,
        policy.revision,
      );
    if (Number(inserted.changes ?? 0) === 0) return null;
    return { memory, outcome: "inserted" };
  }

  /** Stored content is normalized at every write; exact lookup includes tombstones. */
  private dedupCandidates(args: {
    repositoryPath: string;
    kind: RepositoryMemoryKind;
    content: string;
  }): RepositoryMemory[] {
    const rows = this.db.prepare(`SELECT ${COLUMNS} FROM repository_memories
      WHERE project_path = ? AND kind = ? AND content = ?
      ORDER BY deleted_at IS NOT NULL, id ASC LIMIT 1`)
      .all(args.repositoryPath, args.kind, args.content) as RepositoryMemoryRow[];
    return rows.map(parseRow);
  }

  update(args: {
    id: string;
    repositoryPath: string;
    recallMode?: RepositoryMemoryRecallMode;
    kind?: RepositoryMemoryKind;
    content?: string;
    now?: number;
  }): RepositoryMemory | null {
    const current = this.get(args.id);
    if (!current || current.deletedAt !== null || current.repositoryPath !== args.repositoryPath) {
      return null;
    }
    const kind = args.kind ? RepositoryMemoryKindSchema.parse(args.kind) : current.kind;
    const content =
      args.content !== undefined ? assertContent(args.content) : current.content;
    const now = args.now ?? Date.now();
    const recallMode = RepositoryMemoryRecallModeSchema.parse(args.recallMode ?? current.recallMode);
    this.assertCoreCapacity(current.repositoryPath, recallMode, current.id);
    const updated = this.db
      .prepare(
        `UPDATE repository_memories
         SET kind = ?, content = ?, updated_at = ?, last_confirmed_at = ?, recall_mode = ?, confidence = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(kind, content, now, now, recallMode, 0.9, args.id);
    if (Number(updated.changes ?? 0) === 0) return null;
    return { ...current, kind, content, recallMode, confidence: 0.9, updatedAt: now, lastConfirmedAt: now };
  }

  private assertCoreCapacity(repositoryPath: string, mode: RepositoryMemoryRecallMode, id = "") {
    if (mode !== "core") return;
    const row = this.db.prepare(`SELECT count(*) AS count FROM repository_memories
      WHERE project_path = ? AND recall_mode = 'core' AND deleted_at IS NULL AND id != ?`).get(repositoryPath, id) as { count: number };
    if (row.count >= REPOSITORY_MEMORY_CORE_MAX_ITEMS) {
      throw new Error(`Keep at most ${REPOSITORY_MEMORY_CORE_MAX_ITEMS} core memories. Merge or change an existing core memory to contextual first.`);
    }
  }

  /** Soft delete. Returns false when the row is unknown or already deleted. */
  softDelete(args: { id: string; now?: number }) {
    const now = args.now ?? Date.now();
    const result = this.db
      .prepare(
        `UPDATE repository_memories
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
    repositoryPath: string;
    query?: string | null;
    limit?: number;
    now?: number;
  }): RepositoryMemory[] {
    if (!this.settings.get(args.repositoryPath).useMemory) return [];
    const now = args.now ?? Date.now();
    const limit = Math.max(0, Math.min(REPOSITORY_MEMORY_INJECTION_MAX_ITEMS, Math.floor(args.limit ?? REPOSITORY_MEMORY_INJECTION_MAX_ITEMS)));
    const staleBefore = now - REPOSITORY_MEMORY_STALE_AFTER_MS;
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM repository_memories
         WHERE ${activeWhereClause("")}
           AND recall_mode = 'core'
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC
         LIMIT ?`,
      )
      .all(args.repositoryPath, staleBefore, Math.min(limit, REPOSITORY_MEMORY_CORE_MAX_ITEMS)) as RepositoryMemoryRow[];
    const core = rows.map(parseRow);
    const matched = this.recallByQuery({
      repositoryPath: args.repositoryPath,
      query: args.query ?? "",
      limit,
      staleBefore,
    });
    const coreIds = new Set(core.map((memory) => memory.id));
    return [...core, ...matched.filter((memory) => !coreIds.has(memory.id))].slice(0, limit);
  }

  private recallByQuery(args: {
    repositoryPath: string;
    query: string;
    limit: number;
    staleBefore: number;
  }): RepositoryMemory[] {
    const terms = extractRepositoryMemoryQueryTerms(args.query);
    if (terms.length === 0) {
      return [];
    }
    if (this.indexMode !== "like" && terms.every((term) => term.length >= 3)) {
      try {
        const match = terms.map(escapeFtsTerm).join(" OR ");
        const rows = this.db
          .prepare(
            `SELECT ${qualifiedColumns("m")}
             FROM repository_memories_fts f
             JOIN repository_memories m ON m.rowid = f.rowid
             WHERE repository_memories_fts MATCH ?
               AND ${activeWhereClause("m.")}
             ORDER BY bm25(repository_memories_fts), m.confidence DESC, m.id ASC
             LIMIT ?`,
          )
          .all(
            match,
            args.repositoryPath,
            args.staleBefore,
            args.limit,
          ) as RepositoryMemoryRow[];
        return rows.map(parseRow);
      } catch {
        // Fall back to literal substring lookup.
      }
    }
    const likeTerms = terms.slice(0, 8);
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}
         FROM repository_memories
         WHERE ${activeWhereClause("")}
           AND (${likeTerms.map(() => "instr(lower(content), ?) > 0").join(" OR ")})
         ORDER BY confidence DESC, last_confirmed_at DESC, id ASC
         LIMIT ?`,
      )
      .all(
        args.repositoryPath,
        args.staleBefore,
        ...likeTerms,
        args.limit,
      ) as RepositoryMemoryRow[];
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
      AND NOT (${prefix}confidence < ${REPOSITORY_MEMORY_STALE_CONFIDENCE_FLOOR}
               AND ${prefix}last_confirmed_at < ?)`;
}

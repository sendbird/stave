import { createHash } from "node:crypto";
import {
  MAX_ARCHIVED_WORKSPACE_DOCUMENTS,
  MAX_WORKSPACE_DOCUMENT_CATALOG_ENTRIES,
  MAX_WORKSPACE_DOCUMENT_REVISIONS,
  MAX_WORKSPACE_DOCUMENT_TURN_LINKS,
  type RecordWorkspaceDocumentsArgs,
  type WorkspaceDocumentActivity,
  type WorkspaceDocumentCatalogEntry,
  type WorkspaceDocumentChange,
  type WorkspaceDocumentRevisionAuthor,
  type WorkspaceDocumentRevisionMeta,
} from "../../src/lib/documents/workspace-document-schemas";

interface DocumentDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

interface LatestRevisionRow {
  revision: number;
  content_hash: string;
  content: string;
}

/** Present only in the current delete trigger; an older one lacks it. */
const ARCHIVE_TRIGGER_MARKER = "workspace_document_archived_workspaces";

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Revision history for workspace documents. The Markdown file stays the
 * working copy; each sync stores a new revision only when a document's content
 * differs from the newest one already recorded. When a workspace is deleted,
 * only the newest revision of each of its documents is kept, with the
 * workspace's name, so other tasks can still read and attach it; at most
 * `MAX_ARCHIVED_WORKSPACE_DOCUMENTS` such documents are kept across all deleted
 * workspaces.
 */
export class WorkspaceDocumentStore {
  constructor(private readonly db: DocumentDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS workspace_document_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      revision INTEGER NOT NULL,
      author TEXT NOT NULL CHECK(author IN ('agent', 'external')),
      task_id TEXT,
      turn_id TEXT,
      content_hash TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(workspace_id, file_path, revision)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_document_revisions_turn
      ON workspace_document_revisions(workspace_id, turn_id);
    CREATE TABLE IF NOT EXISTS workspace_document_archived_workspaces (
      workspace_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      deleted_at TEXT NOT NULL
    );`);
    this.ensureDeleteTrigger();
  }

  /**
   * Replaces the workspace-delete trigger when the stored one predates the
   * current definition (an older one deleted every revision). Runs in a
   * savepoint so no delete can slip between the drop and the create.
   */
  private ensureDeleteTrigger() {
    const existing = this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'clear_workspace_document_revisions'",
      )
      .get() as { sql: string } | undefined;
    if (existing?.sql.includes(ARCHIVE_TRIGGER_MARKER)) {
      return;
    }
    this.db.exec("SAVEPOINT workspace_document_delete_trigger");
    try {
      this.db.exec(`DROP TRIGGER IF EXISTS clear_workspace_document_revisions;
    CREATE TRIGGER clear_workspace_document_revisions
    AFTER DELETE ON workspace_meta BEGIN
      INSERT OR REPLACE INTO workspace_document_archived_workspaces (workspace_id, name, deleted_at)
        SELECT OLD.id, OLD.name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE EXISTS (
          SELECT 1 FROM workspace_document_revisions WHERE workspace_id = OLD.id
        );
      DELETE FROM workspace_document_revisions
        WHERE workspace_id = OLD.id
          AND revision < (
            SELECT MAX(latest.revision) FROM workspace_document_revisions latest
            WHERE latest.workspace_id = OLD.id
              AND latest.file_path = workspace_document_revisions.file_path
          );
      DELETE FROM workspace_document_revisions
        WHERE workspace_id IN (SELECT workspace_id FROM workspace_document_archived_workspaces)
          AND id NOT IN (
            SELECT id FROM workspace_document_revisions
            WHERE workspace_id IN (SELECT workspace_id FROM workspace_document_archived_workspaces)
            ORDER BY created_at DESC, id DESC
            LIMIT ${MAX_ARCHIVED_WORKSPACE_DOCUMENTS}
          );
      DELETE FROM workspace_document_archived_workspaces
        WHERE workspace_id NOT IN (
          SELECT DISTINCT workspace_id FROM workspace_document_revisions
        );
    END;`);
      this.db.exec("RELEASE workspace_document_delete_trigger");
    } catch (error) {
      this.db.exec("ROLLBACK TO workspace_document_delete_trigger");
      this.db.exec("RELEASE workspace_document_delete_trigger");
      throw error;
    }
  }

  /**
   * Records every document whose content differs from its newest revision and
   * returns those changes. A workspace Stave has not persisted yet records
   * nothing, so no row can outlive the workspace it belongs to.
   */
  record(args: RecordWorkspaceDocumentsArgs): WorkspaceDocumentChange[] {
    if (
      !this.db
        .prepare("SELECT id FROM workspace_meta WHERE id = ?")
        .get(args.workspaceId)
    ) {
      return [];
    }
    // A deleted workspace id that is in use again is live, not archived.
    this.db
      .prepare("DELETE FROM workspace_document_archived_workspaces WHERE workspace_id = ?")
      .run(args.workspaceId);
    const latest = this.db.prepare(
      `SELECT revision, content_hash, content FROM workspace_document_revisions
       WHERE workspace_id = ? AND file_path = ?
       ORDER BY revision DESC LIMIT 1`,
    );
    const touched = this.db.prepare(
      `SELECT 1 FROM workspace_document_revisions
       WHERE workspace_id = ? AND file_path = ? AND task_id = ? LIMIT 1`,
    );
    const insert = this.db.prepare(
      `INSERT INTO workspace_document_revisions
       (workspace_id, file_path, revision, author, task_id, turn_id, content_hash, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const prune = this.db.prepare(
      `DELETE FROM workspace_document_revisions
       WHERE workspace_id = ? AND file_path = ? AND revision <= ?`,
    );
    const createdAt = new Date().toISOString();
    const changes: WorkspaceDocumentChange[] = [];
    this.db.exec("SAVEPOINT record_workspace_documents");
    try {
      for (const document of args.documents) {
        const contentHash = hashContent(document.content);
        const previous = latest.get(args.workspaceId, document.filePath) as
          | LatestRevisionRow
          | undefined;
        if (previous?.content_hash === contentHash) {
          continue;
        }
        const touchedByTask = Boolean(
          args.relevantTaskId &&
            previous &&
            touched.get(args.workspaceId, document.filePath, args.relevantTaskId),
        );
        const revision = (previous?.revision ?? 0) + 1;
        insert.run(
          args.workspaceId,
          document.filePath,
          revision,
          args.author,
          args.taskId ?? null,
          args.turnId ?? null,
          contentHash,
          document.content,
          createdAt,
        );
        prune.run(
          args.workspaceId,
          document.filePath,
          revision - MAX_WORKSPACE_DOCUMENT_REVISIONS,
        );
        changes.push({
          filePath: document.filePath,
          revision,
          previousRevision: previous?.revision ?? null,
          previousContent: previous?.content ?? null,
          content: document.content,
          touchedByTask,
        });
      }
      this.db.exec("RELEASE record_workspace_documents");
    } catch (error) {
      this.db.exec("ROLLBACK TO record_workspace_documents");
      this.db.exec("RELEASE record_workspace_documents");
      throw error;
    }
    return changes;
  }

  activity(workspaceId: string): WorkspaceDocumentActivity {
    const documents = (
      this.db
        .prepare(
          `SELECT r.file_path, r.revision, r.author, r.created_at, counts.total
           FROM workspace_document_revisions r
           JOIN (
             SELECT file_path, MAX(revision) AS latest, COUNT(*) AS total
             FROM workspace_document_revisions
             WHERE workspace_id = ?
             GROUP BY file_path
           ) counts ON counts.file_path = r.file_path AND counts.latest = r.revision
           WHERE r.workspace_id = ?
           ORDER BY r.created_at DESC, r.file_path ASC`,
        )
        .all(workspaceId, workspaceId) as {
        file_path: string;
        revision: number;
        author: WorkspaceDocumentRevisionAuthor;
        created_at: string;
        total: number;
      }[]
    ).map((row) => ({
      filePath: row.file_path,
      latestRevision: row.revision,
      latestAuthor: row.author,
      latestCreatedAt: row.created_at,
      revisionCount: row.total,
    }));
    const turnLinks = (
      this.db
        .prepare(
          `SELECT turn_id, task_id, file_path, revision
           FROM workspace_document_revisions
           WHERE workspace_id = ? AND author = 'agent' AND turn_id IS NOT NULL
           ORDER BY id DESC LIMIT ?`,
        )
        .all(workspaceId, MAX_WORKSPACE_DOCUMENT_TURN_LINKS) as {
        turn_id: string;
        task_id: string | null;
        file_path: string;
        revision: number;
      }[]
    ).map((row) => ({
      turnId: row.turn_id,
      taskId: row.task_id,
      filePath: row.file_path,
      revision: row.revision,
    }));
    return { documents, turnLinks };
  }

  /**
   * The newest revision of every document outside `excludeWorkspaceId`, most
   * recent first, from live and deleted workspaces. Content is read separately.
   */
  catalog(excludeWorkspaceId?: string): WorkspaceDocumentCatalogEntry[] {
    return (
      this.db
        .prepare(
          `SELECT r.workspace_id, r.file_path, r.revision, r.created_at,
             COALESCE(meta.name, archived.name) AS workspace_name,
             archived.workspace_id IS NOT NULL AS deleted
           FROM workspace_document_revisions r
           JOIN (
             SELECT workspace_id, file_path, MAX(revision) AS latest
             FROM workspace_document_revisions
             GROUP BY workspace_id, file_path
           ) newest ON newest.workspace_id = r.workspace_id
             AND newest.file_path = r.file_path
             AND newest.latest = r.revision
           LEFT JOIN workspace_meta meta ON meta.id = r.workspace_id
           LEFT JOIN workspace_document_archived_workspaces archived
             ON archived.workspace_id = r.workspace_id
           WHERE r.workspace_id != ?
             AND (meta.id IS NOT NULL OR archived.workspace_id IS NOT NULL)
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT ?`,
        )
        .all(excludeWorkspaceId ?? "", MAX_WORKSPACE_DOCUMENT_CATALOG_ENTRIES) as {
        workspace_id: string;
        file_path: string;
        revision: number;
        created_at: string;
        workspace_name: string;
        deleted: number;
      }[]
    ).map((row) => ({
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      workspaceDeleted: Boolean(row.deleted),
      filePath: row.file_path,
      revision: row.revision,
      updatedAt: row.created_at,
    }));
  }

  revisions(workspaceId: string, filePath: string): WorkspaceDocumentRevisionMeta[] {
    return (
      this.db
        .prepare(
          `SELECT revision, author, task_id, turn_id, created_at
           FROM workspace_document_revisions
           WHERE workspace_id = ? AND file_path = ?
           ORDER BY revision DESC`,
        )
        .all(workspaceId, filePath) as {
        revision: number;
        author: WorkspaceDocumentRevisionAuthor;
        task_id: string | null;
        turn_id: string | null;
        created_at: string;
      }[]
    ).map((row) => ({
      revision: row.revision,
      author: row.author,
      taskId: row.task_id,
      turnId: row.turn_id,
      createdAt: row.created_at,
    }));
  }

  content(workspaceId: string, filePath: string, revision: number): string | null {
    const row = this.db
      .prepare(
        `SELECT content FROM workspace_document_revisions
         WHERE workspace_id = ? AND file_path = ? AND revision = ?`,
      )
      .get(workspaceId, filePath, revision) as { content: string } | undefined;
    return row?.content ?? null;
  }
}

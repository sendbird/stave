import type Database from "better-sqlite3";
import {
  applyHandoffDraft,
  emptyHandoffRecord,
  parseTaskHandoffRecord,
  type HandoffDraftAuthors,
  type TaskHandoffRecord,
} from "../../src/lib/task-context/handoff-record";
import type {
  ReadTaskHandoffArgs,
  SaveTaskHandoffArgs,
  SaveTaskHandoffResponse,
} from "../../src/lib/task-context/handoff-record-ipc";

type Db = Database.Database;

/**
 * Expand-only: older databases gain the table on open. A trigger on `tasks`
 * removes a task's record when the task row is deleted (deleting the task,
 * closing its workspace), so no delete path has to remember it. Task rows are
 * upserted in place, never deleted and inserted again, so saving a workspace
 * keeps the records.
 */
export function ensureTaskHandoffTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_handoff_records (
      workspace_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, task_id)
    );
    CREATE TRIGGER IF NOT EXISTS task_handoff_records_follow_task
      AFTER DELETE ON tasks
      BEGIN
        DELETE FROM task_handoff_records
        WHERE workspace_id = OLD.workspace_id
          AND workspace_id || ':' || task_id = OLD.id;
      END;
  `);
}

export class TaskHandoffStore {
  constructor(private readonly db: Db) {
    ensureTaskHandoffTable(db);
  }

  /** The task's record; an empty record at revision 0 when none was saved. */
  read(args: ReadTaskHandoffArgs): TaskHandoffRecord {
    const row = this.db
      .prepare("SELECT record_json FROM task_handoff_records WHERE workspace_id = ? AND task_id = ?")
      .get(args.workspaceId, args.taskId) as { record_json: string } | undefined;
    return parseTaskHandoffRecord(row?.record_json) ?? emptyHandoffRecord();
  }

  /**
   * Save a draft made from `baseRevision`. A record saved since then is a
   * conflict: nothing is written and the stored record comes back, so the
   * person editing decides. Only a task row of this workspace can have a
   * record: anything else (a deleted task, another workspace's task, an id
   * that names no task) is refused, so no record outlives its task's trigger.
   */
  save(args: SaveTaskHandoffArgs & { at?: string }): SaveTaskHandoffResponse {
    let response: SaveTaskHandoffResponse = { ok: false, message: "Not saved." };
    this.db.transaction(() => {
      const task = this.db
        .prepare("SELECT 1 FROM tasks WHERE id = ? AND workspace_id = ?")
        .get(`${args.workspaceId}:${args.taskId}`, args.workspaceId);
      if (!task) {
        response = { ok: false, missingTask: true, message: "The task is not stored in this workspace." };
        return;
      }
      const current = this.read(args);
      if (current.revision !== args.baseRevision) {
        response = { ok: false, conflict: true, record: current };
        return;
      }
      const at = args.at ?? new Date().toISOString();
      const next = applyHandoffDraft({
        record: current,
        draft: args.draft,
        authors: args.authors as HandoffDraftAuthors | undefined,
        at,
      });
      if (next !== current) {
        this.db
          .prepare(
            `INSERT INTO task_handoff_records (workspace_id, task_id, record_json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(workspace_id, task_id) DO UPDATE SET
              record_json = excluded.record_json,
              updated_at = excluded.updated_at`,
          )
          .run(args.workspaceId, args.taskId, JSON.stringify(next), at);
      }
      response = { ok: true, record: next };
    }).immediate(); // IMMEDIATE: it reads before it writes; see SqliteStore.persistTaskTurnDelta.
    return response;
  }
}

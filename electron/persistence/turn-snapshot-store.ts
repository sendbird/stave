import type Database from "better-sqlite3";
export interface TurnSnapshotRow {
  workspaceId: string;
  taskId: string;
  turnId: string;
  snapshotId: string;
  indexTree: string;
  createdAt: string;
  cwd: string;
  ref: string;
}
export class TurnSnapshotStore {
  constructor(private db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS turn_file_snapshots (workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, turn_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, index_tree TEXT NOT NULL, created_at TEXT NOT NULL, cwd TEXT NOT NULL, ref TEXT NOT NULL, PRIMARY KEY(workspace_id,task_id,turn_id));
   CREATE TABLE IF NOT EXISTS turn_file_restore_undo (workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(workspace_id,task_id));`);
  }
  list(workspaceId: string, taskId?: string): TurnSnapshotRow[] {
    return this.db.prepare(`SELECT workspace_id AS workspaceId,task_id AS taskId,turn_id AS turnId,snapshot_id AS snapshotId,index_tree AS indexTree,created_at AS createdAt,cwd,ref FROM turn_file_snapshots WHERE workspace_id=? ${taskId ? "AND task_id=?" : ""} ORDER BY rowid DESC`).all(...(taskId ? [workspaceId, taskId] : [workspaceId])) as TurnSnapshotRow[];
  }
  forPath(cwd: string): TurnSnapshotRow[] {
    return this.db.prepare("SELECT workspace_id AS workspaceId,task_id AS taskId,turn_id AS turnId,snapshot_id AS snapshotId,index_tree AS indexTree,created_at AS createdAt,cwd,ref FROM turn_file_snapshots WHERE cwd=? ORDER BY rowid DESC").all(cwd) as TurnSnapshotRow[];
  }
  put(row: TurnSnapshotRow) {
    this.db.prepare("INSERT OR REPLACE INTO turn_file_snapshots VALUES (?,?,?,?,?,?,?,?)").run(row.workspaceId, row.taskId, row.turnId, row.snapshotId, row.indexTree, row.createdAt, row.cwd, row.ref);
  }
  remove(row: TurnSnapshotRow) {
    this.db.prepare("DELETE FROM turn_file_snapshots WHERE workspace_id=? AND task_id=? AND turn_id=?").run(row.workspaceId, row.taskId, row.turnId);
  }
  undo(workspaceId: string, taskId: string): {
    before: TurnSnapshotRow;
    after: string;
  } | null {
    const row = this.db.prepare("SELECT value_json FROM turn_file_restore_undo WHERE workspace_id=? AND task_id=?").get(workspaceId, taskId) as {
      value_json: string;
    } | undefined;
    return row ? JSON.parse(row.value_json) : null;
  }
  saveUndo(workspaceId: string, taskId: string, value: {
    before: TurnSnapshotRow;
    after: string;
  } | null) {
    if (value)
      this.db.prepare("INSERT OR REPLACE INTO turn_file_restore_undo VALUES (?,?,?)").run(workspaceId, taskId, JSON.stringify(value));
    else
      this.db.prepare("DELETE FROM turn_file_restore_undo WHERE workspace_id=? AND task_id=?").run(workspaceId, taskId);
  }
}

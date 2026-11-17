import { execFileSync } from "node:child_process";
import type Database from "better-sqlite3";
import type { TurnSnapshotSkipReason } from "../../src/lib/turn-snapshots";

export interface TurnSnapshotRow {
  workspaceId: string;
  taskId: string;
  turnId: string;
  snapshotId: string;
  /** Empty when the staged state could not be recorded, such as during a merge conflict. */
  indexTree: string;
  createdAt: string;
  cwd: string;
  /** The repository's common git directory; refs stay removable after a worktree is gone. */
  gitDir: string;
  ref: string;
}

export interface TurnSnapshotSkip {
  turnId: string;
  reason: TurnSnapshotSkipReason;
}

/** The pre-restore state kept for one undo; never listed as a turn and never pruned with turns. */
export interface TurnSnapshotBackup {
  before: TurnSnapshotRow;
  after: string;
}

export interface TurnSnapshotRefOwner {
  gitDir: string;
  ref: string;
}

const COLUMNS = "workspace_id AS workspaceId,task_id AS taskId,turn_id AS turnId,snapshot_id AS snapshotId,index_tree AS indexTree,created_at AS createdAt,cwd,git_dir AS gitDir,ref";

export class TurnSnapshotStore {
  constructor(private db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS turn_snapshots (workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, turn_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, index_tree TEXT NOT NULL, created_at TEXT NOT NULL, cwd TEXT NOT NULL, git_dir TEXT NOT NULL, ref TEXT NOT NULL, skip_reason TEXT, PRIMARY KEY(workspace_id,task_id,turn_id));
   CREATE TABLE IF NOT EXISTS turn_snapshot_backups (workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, index_tree TEXT NOT NULL, created_at TEXT NOT NULL, cwd TEXT NOT NULL, git_dir TEXT NOT NULL, ref TEXT NOT NULL, after TEXT NOT NULL, PRIMARY KEY(workspace_id,task_id));`);
  }

  /** Captured turn snapshots, newest first. */
  list(workspaceId: string, taskId?: string): TurnSnapshotRow[] {
    return this.db.prepare(`SELECT ${COLUMNS} FROM turn_snapshots WHERE skip_reason IS NULL AND workspace_id=? ${taskId ? "AND task_id=?" : ""} ORDER BY rowid DESC`).all(...(taskId ? [workspaceId, taskId] : [workspaceId])) as TurnSnapshotRow[];
  }

  /** Turns whose capture was skipped, newest first. */
  skipped(workspaceId: string, taskId: string): TurnSnapshotSkip[] {
    return this.db.prepare("SELECT turn_id AS turnId, skip_reason AS reason FROM turn_snapshots WHERE skip_reason IS NOT NULL AND workspace_id=? AND task_id=? ORDER BY rowid DESC").all(workspaceId, taskId) as TurnSnapshotSkip[];
  }

  /** A permanently deleted task never gains new snapshot rows. */
  taskDeleted(workspaceId: string, taskId: string) {
    return Boolean(this.db.prepare("SELECT 1 FROM deleted_tasks WHERE workspace_id=? AND task_id=?").get(workspaceId, taskId));
  }

  forPath(cwd: string): TurnSnapshotRow[] {
    return this.db.prepare(`SELECT ${COLUMNS} FROM turn_snapshots WHERE skip_reason IS NULL AND cwd=? ORDER BY rowid DESC`).all(cwd) as TurnSnapshotRow[];
  }

  put(row: TurnSnapshotRow) {
    this.db.prepare("INSERT OR REPLACE INTO turn_snapshots (workspace_id,task_id,turn_id,snapshot_id,index_tree,created_at,cwd,git_dir,ref,skip_reason) VALUES (?,?,?,?,?,?,?,?,?,NULL)")
      .run(row.workspaceId, row.taskId, row.turnId, row.snapshotId, row.indexTree, row.createdAt, row.cwd, row.gitDir, row.ref);
  }

  putSkipped(args: { workspaceId: string; taskId: string; turnId: string; reason: TurnSnapshotSkipReason; cwd: string }) {
    this.db.prepare("INSERT OR IGNORE INTO turn_snapshots (workspace_id,task_id,turn_id,snapshot_id,index_tree,created_at,cwd,git_dir,ref,skip_reason) VALUES (?,?,?,'','',?,?,'','',?)")
      .run(args.workspaceId, args.taskId, args.turnId, new Date().toISOString(), args.cwd, args.reason);
  }

  remove(row: { workspaceId: string; taskId: string; turnId: string }) {
    this.db.prepare("DELETE FROM turn_snapshots WHERE workspace_id=? AND task_id=? AND turn_id=?").run(row.workspaceId, row.taskId, row.turnId);
  }

  /** Skipped markers beyond the retention limit, oldest last. */
  pruneSkipped(workspaceId: string, taskId: string, limit: number) {
    this.db.prepare("DELETE FROM turn_snapshots WHERE rowid IN (SELECT rowid FROM turn_snapshots WHERE skip_reason IS NOT NULL AND workspace_id=? AND task_id=? ORDER BY rowid DESC LIMIT -1 OFFSET ?)").run(workspaceId, taskId, limit);
  }

  backup(workspaceId: string, taskId: string): TurnSnapshotBackup | null {
    const row = this.db.prepare(`SELECT workspace_id AS workspaceId,task_id AS taskId,'' AS turnId,snapshot_id AS snapshotId,index_tree AS indexTree,created_at AS createdAt,cwd,git_dir AS gitDir,ref,after FROM turn_snapshot_backups WHERE workspace_id=? AND task_id=?`).get(workspaceId, taskId) as (TurnSnapshotRow & { after: string }) | undefined;
    if (!row) return null;
    const { after, ...before } = row;
    return { before, after };
  }

  saveBackup(value: TurnSnapshotBackup) {
    const row = value.before;
    this.db.prepare("INSERT OR REPLACE INTO turn_snapshot_backups VALUES (?,?,?,?,?,?,?,?,?)")
      .run(row.workspaceId, row.taskId, row.snapshotId, row.indexTree, row.createdAt, row.cwd, row.gitDir, row.ref, value.after);
  }

  removeBackup(workspaceId: string, taskId: string) {
    this.db.prepare("DELETE FROM turn_snapshot_backups WHERE workspace_id=? AND task_id=?").run(workspaceId, taskId);
  }

}

const pendingRefDeletes = new WeakMap<Database.Database, TurnSnapshotRefOwner[]>();
const hasSnapshotTables = (db: Database.Database) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'turn_snapshot_backups'").get());

/**
 * Permanent task and workspace deletion remove snapshot rows inside their
 * transaction. The refs are deleted afterwards by `flushDeletedTurnSnapshotRefs`,
 * because git is outside the transaction. Omit `taskId` for a whole workspace.
 */
export function deleteTurnSnapshotRows(db: Database.Database, args: { workspaceId: string; taskId?: string }) {
  if (!hasSnapshotTables(db)) return;
  const scope = args.taskId ? "workspace_id=? AND task_id=?" : "workspace_id=?";
  const params = args.taskId ? [args.workspaceId, args.taskId] : [args.workspaceId];
  const refs = db.prepare(`SELECT git_dir AS gitDir, ref FROM turn_snapshots WHERE ${scope} AND ref != '' UNION ALL SELECT git_dir AS gitDir, ref FROM turn_snapshot_backups WHERE ${scope}`)
    .all(...params, ...params) as TurnSnapshotRefOwner[];
  db.prepare(`DELETE FROM turn_snapshots WHERE ${scope}`).run(...params);
  db.prepare(`DELETE FROM turn_snapshot_backups WHERE ${scope}`).run(...params);
  pendingRefDeletes.set(db, [...pendingRefDeletes.get(db) ?? [], ...refs]);
}

/** Delete refs whose rows are gone; a rolled-back deletion still has its rows and keeps its refs. */
export function flushDeletedTurnSnapshotRefs(db: Database.Database) {
  const pending = pendingRefDeletes.get(db);
  if (!pending?.length) return;
  pendingRefDeletes.delete(db);
  const stillOwned = db.prepare("SELECT 1 FROM turn_snapshots WHERE ref = ? UNION ALL SELECT 1 FROM turn_snapshot_backups WHERE ref = ? LIMIT 1");
  removeTurnSnapshotRefs(pending.filter(({ ref }) => !stillOwned.get(ref, ref)));
}

/**
 * Delete hidden snapshot refs from their repositories. The common git directory
 * is used so refs of a removed worktree are still found. A repository that no
 * longer exists has nothing left to delete.
 */
export function removeTurnSnapshotRefs(refs: readonly TurnSnapshotRefOwner[]) {
  const byRepository = new Map<string, Set<string>>();
  for (const { gitDir, ref } of refs) {
    if (!gitDir || !ref.startsWith("refs/stave/")) continue;
    const set = byRepository.get(gitDir) ?? new Set<string>();
    set.add(ref);
    byRepository.set(gitDir, set);
  }
  for (const [gitDir, set] of byRepository) {
    try {
      execFileSync("git", ["--git-dir", gitDir, "update-ref", "--stdin"], {
        input: [...set].map(ref => `delete ${ref}\n`).join(""),
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch (error) {
      console.warn("[turn-snapshots] could not delete snapshot refs", { refs: set.size, error: String(error) });
    }
  }
}

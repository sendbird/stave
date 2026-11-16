import type Database from "better-sqlite3";
import { normalizeComparablePath } from "../../src/lib/source-control-worktrees";
import type { PersistenceRepositoryRegistryEntry } from "./types";

export interface ArchivedWorkspaceRecord {
  workspaceId: string;
  repositoryPath: string;
  path: string;
  branch: string;
  name: string;
  archivedAt: string;
  readOnly: boolean;
  creationOptions?: { useRootNodeModulesSymlink: boolean; initCommand?: string; linkedWorktree?: boolean; linkedSymlinkNames?: string[] };
}

/** Archive identity is separate from history; an absent marker means active. */
export class WorkspaceArchiveStore {
  constructor(private readonly db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS workspace_archives (
      workspace_id TEXT PRIMARY KEY,
      repository_path TEXT NOT NULL,
      path TEXT NOT NULL,
      branch TEXT NOT NULL,
      name TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      read_only INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS workspace_deletions (workspace_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_workspace_archives_repository
      ON workspace_archives(repository_path, archived_at);`);
    const columns = db.prepare("PRAGMA table_info(workspace_archives)").all() as {name:string}[];
    if (!columns.some(column => column.name === "creation_options_json")) db.exec("ALTER TABLE workspace_archives ADD COLUMN creation_options_json TEXT");
  }

  list(args: { repositoryPath?: string } = {}): ArchivedWorkspaceRecord[] {
    return this.db.prepare(`SELECT workspace_id AS workspaceId,
      repository_path AS repositoryPath, path, branch, name,
      archived_at AS archivedAt, read_only AS readOnly, creation_options_json AS creationOptionsJson FROM workspace_archives
      ${args.repositoryPath === undefined ? "" : "WHERE repository_path = ?"}
      ORDER BY archived_at DESC`).all(...(args.repositoryPath === undefined ? [] : [args.repositoryPath]))
      .map((row) => {
        const {creationOptionsJson, ...record} = row as Omit<ArchivedWorkspaceRecord, "readOnly"> & { readOnly: number; creationOptionsJson: string | null };
        return { ...record, readOnly: Boolean(record.readOnly), ...(creationOptionsJson ? {creationOptions:JSON.parse(creationOptionsJson)} : {}) };
      });
  }

  /** Stale registry snapshots cannot resurrect archived identities or erase tombstones. */
  protectRegistry(repositories: PersistenceRepositoryRegistryEntry[]): PersistenceRepositoryRegistryEntry[] {
    const archived = this.list();
    const deleted = new Set((this.db.prepare("SELECT workspace_id FROM workspace_deletions").all() as Array<{ workspace_id: string }>).map(row => row.workspace_id));

    return repositories.map((repository) => {
      const records = archived.filter((record) => record.repositoryPath === repository.repositoryPath);
      const ids = new Set([...deleted, ...records.map((record) => record.workspaceId)]);
      const workspaces = repository.workspaces.filter((workspace) => !ids.has(workspace.id));
      const withoutArchived = <T>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).filter(([id]) => !ids.has(id)));
      return { ...repository, workspaces,
        activeWorkspaceId: ids.has(repository.activeWorkspaceId) ? workspaces[0]?.id ?? "" : repository.activeWorkspaceId,
        workspacePathById: withoutArchived(repository.workspacePathById),
        workspaceBranchById: withoutArchived(repository.workspaceBranchById),
        workspaceDefaultById: withoutArchived(repository.workspaceDefaultById),
        archivedWorkspacePaths: records.map(record => record.path) };
    });
  }

  private registry(): PersistenceRepositoryRegistryEntry[] {
    const row = this.db.prepare("SELECT value_json FROM app_state WHERE key = 'project_registry'").get() as { value_json: string } | undefined;
    return row ? JSON.parse(row.value_json) : [];
  }

  private saveRegistry(repositories: PersistenceRepositoryRegistryEntry[]) {
    this.db.prepare(`INSERT INTO app_state(key,value_json,updated_at) VALUES('project_registry',?,?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
      .run(JSON.stringify(repositories), new Date().toISOString());
  }

  archive(args: { workspaceId: string; repositoryPath: string; path: string; branch: string; name: string; creationOptions?: ArchivedWorkspaceRecord["creationOptions"] }): ArchivedWorkspaceRecord {
    return this.db.transaction(() => {
      const existing = this.list().find((record) => record.workspaceId === args.workspaceId);
      if (existing) return existing;
      if (!this.db.prepare("SELECT 1 FROM workspaces WHERE id = ?").get(args.workspaceId)) {
        throw new Error("Workspace history does not exist");
      }
      const repositories = this.registry();
      const repository = repositories.find((entry) => entry.repositoryPath === args.repositoryPath);
      if (!repository || !repository.workspaces.some((workspace) => workspace.id === args.workspaceId) ||
          normalizeComparablePath(repository.workspacePathById[args.workspaceId]) !== normalizeComparablePath(args.path)) {
        throw new Error("Workspace does not belong to this repository");
      }
      if (repository.workspaceDefaultById[args.workspaceId] || normalizeComparablePath(args.path) === normalizeComparablePath(args.repositoryPath)) {
        throw new Error("Cannot archive the default workspace");
      }
      const archivedAt = new Date().toISOString();
      this.db.prepare(`INSERT INTO workspace_archives(workspace_id,repository_path,path,branch,name,archived_at,creation_options_json)
        VALUES(?,?,?,?,?,?,?)`).run(args.workspaceId,args.repositoryPath,args.path,args.branch,args.name,archivedAt, args.creationOptions ? JSON.stringify(args.creationOptions) : null);
      repository.workspaces = repository.workspaces.filter((workspace) => workspace.id !== args.workspaceId);
      if (args.creationOptions?.linkedWorktree) repository.linkedWorkspacePaths = (repository.linkedWorkspacePaths ?? []).filter(entry => normalizeComparablePath(entry) !== normalizeComparablePath(args.path));
      for (const map of [repository.workspacePathById, repository.workspaceBranchById, repository.workspaceDefaultById]) delete map[args.workspaceId];
      repository.archivedWorkspacePaths = [...new Set([...(repository.archivedWorkspacePaths ?? []),args.path])];
      if (repository.activeWorkspaceId === args.workspaceId) repository.activeWorkspaceId = repository.workspaces[0]?.id ?? "";
      this.saveRegistry(repositories);
      return { ...args, archivedAt, readOnly: false };
    }).immediate();
  }

  listIdentities(): {workspaceId:string;repositoryPath:string}[] {
    return this.db.prepare("SELECT workspace_id AS workspaceId, repository_path AS repositoryPath FROM workspace_archives").all() as {workspaceId:string;repositoryPath:string}[];
  }

  listDeletedIds(): string[] {
    return (this.db.prepare("SELECT workspace_id FROM workspace_deletions").all() as {workspace_id:string}[]).map(row=>row.workspace_id);
  }

  assertNotDeleted(workspaceId: string) {
    if (this.db.prepare("SELECT 1 FROM workspace_deletions WHERE workspace_id = ?").get(workspaceId)) throw new Error("Workspace history was permanently deleted");
  }

  isWriteProtected(workspaceId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM workspace_archives WHERE workspace_id = ? UNION ALL SELECT 1 FROM workspace_deletions WHERE workspace_id = ? LIMIT 1").get(workspaceId, workspaceId));
  }

  deleteHistoryRows(workspaceId: string): void {
    this.db.prepare("INSERT OR IGNORE INTO workspace_deletions(workspace_id,deleted_at) VALUES(?,?)").run(workspaceId, new Date().toISOString());
    const archive = this.list().find((record) => record.workspaceId === workspaceId);
    const repositories = this.registry();
    for (const repository of repositories) {
      const workspacePath = repository.workspacePathById[workspaceId] ??
        (archive?.repositoryPath === repository.repositoryPath ? archive.path : undefined);
      if (!workspacePath && !repository.workspaces.some((workspace) => workspace.id === workspaceId)) continue;
      repository.workspaces = repository.workspaces.filter((workspace) => workspace.id !== workspaceId);
      for (const map of [repository.workspacePathById, repository.workspaceBranchById, repository.workspaceDefaultById]) delete map[workspaceId];
      if (workspacePath) repository.archivedWorkspacePaths = (repository.archivedWorkspacePaths ?? []).filter(entry => normalizeComparablePath(entry) !== normalizeComparablePath(workspacePath));
      if (repository.activeWorkspaceId === workspaceId) repository.activeWorkspaceId = repository.workspaces[0]?.id ?? "";
    }
    this.saveRegistry(repositories);
    this.db.prepare("DELETE FROM turn_events WHERE turn_id IN (SELECT id FROM turns WHERE workspace_id = ?)").run(workspaceId);
    for (const table of ["turns", "messages", "tasks"]) {
      this.db.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(workspaceId);
    }
    for (const table of ["workspaces", "workspace_meta"]) {
      this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(workspaceId);
    }
    this.db.prepare("DELETE FROM workspace_archives WHERE workspace_id = ?").run(workspaceId);
  }

  restore(args: { workspaceId: string; readOnly?: boolean }): ArchivedWorkspaceRecord | null {
    return this.db.transaction(() => {
      const record = this.list().find((entry) => entry.workspaceId === args.workspaceId);
      if (!record) return null;
      if (args.readOnly) {
        this.db.prepare("UPDATE workspace_archives SET read_only = 1 WHERE workspace_id = ?").run(args.workspaceId);
        return { ...record, readOnly: true };
      }
      const repositories = this.registry();
      const repository = repositories.find((entry) => entry.repositoryPath === record.repositoryPath);
      if (!repository) throw new Error("Repository is no longer registered");
      const collision = repository.workspaces.find((entry) => entry.id !== record.workspaceId &&
        normalizeComparablePath(repository.workspacePathById[entry.id]) === normalizeComparablePath(record.path));
      if (collision) throw new Error("Workspace path is already registered");
      repository.workspaces = [...repository.workspaces.filter((entry) => entry.id !== record.workspaceId),
        { id: record.workspaceId, name: record.name, updatedAt: new Date().toISOString() }];
      repository.workspacePathById[record.workspaceId] = record.path;
      repository.workspaceBranchById[record.workspaceId] = record.branch;
      repository.workspaceDefaultById[record.workspaceId] = false;
      if (record.creationOptions?.linkedWorktree) repository.linkedWorkspacePaths = [...new Set([...(repository.linkedWorkspacePaths ?? []),record.path])];
      repository.archivedWorkspacePaths = (repository.archivedWorkspacePaths ?? []).filter((entry) =>
        normalizeComparablePath(entry) !== normalizeComparablePath(record.path));
      this.saveRegistry(repositories);
      this.db.prepare("DELETE FROM workspace_archives WHERE workspace_id = ?").run(args.workspaceId);
      return { ...record, readOnly: args.readOnly ?? false };
    }).immediate();
  }
}

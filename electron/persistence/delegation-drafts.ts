import {
  DelegationDraftScopeSchema,
  SaveDelegationDraftSchema,
  delegationDraftScopeKey,
  type DelegationDraft,
  type DelegationDraftScope,
} from "../../src/lib/collaboration/delegation-draft";

interface DraftDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

/** One bounded task-assignment form per exact project/workspace/task owner. */
export class DelegationDraftStore {
  constructor(private readonly db: DraftDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS task_delegation_drafts (
      scope_key TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      draft_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_delegation_drafts_workspace
      ON task_delegation_drafts(workspace_id);
    CREATE TRIGGER IF NOT EXISTS clear_task_delegation_drafts
    AFTER DELETE ON workspace_meta BEGIN
      DELETE FROM task_delegation_drafts WHERE workspace_id = OLD.id;
    END;`);
  }

  load(scope: DelegationDraftScope): DelegationDraft | null {
    const parsedScope = DelegationDraftScopeSchema.parse(scope);
    const row = this.db
      .prepare(
        "SELECT draft_json FROM task_delegation_drafts WHERE scope_key = ?",
      )
      .get(delegationDraftScopeKey(parsedScope)) as
      | { draft_json: string }
      | undefined;
    return row
      ? SaveDelegationDraftSchema.parse({
          scope: parsedScope,
          draft: JSON.parse(row.draft_json),
        }).draft
      : null;
  }

  save(scope: DelegationDraftScope, draft: DelegationDraft | null): void {
    const parsedScope = DelegationDraftScopeSchema.parse(scope);
    const scopeKey = delegationDraftScopeKey(parsedScope);
    if (draft === null) {
      this.db
        .prepare("DELETE FROM task_delegation_drafts WHERE scope_key = ?")
        .run(scopeKey);
      return;
    }
    const parsedDraft = SaveDelegationDraftSchema.parse({
      scope: parsedScope,
      draft,
    }).draft!;
    if (
      !this.db
        .prepare("SELECT id FROM workspace_meta WHERE id = ?")
        .get(parsedScope.workspaceId)
    ) {
      throw new Error("The workspace no longer exists.");
    }
    if (
      !this.db
        .prepare("SELECT id FROM tasks WHERE id = ? AND workspace_id = ?")
        .get(parsedScope.taskId, parsedScope.workspaceId)
    ) {
      throw new Error("The task does not belong to this workspace.");
    }
    this.db
      .prepare(
        `INSERT INTO task_delegation_drafts
          (scope_key, project_path, workspace_id, task_id, draft_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(scope_key) DO UPDATE SET
          project_path = excluded.project_path,
          workspace_id = excluded.workspace_id,
          task_id = excluded.task_id,
          draft_json = excluded.draft_json`,
      )
      .run(
        scopeKey,
        parsedScope.projectPath,
        parsedScope.workspaceId,
        parsedScope.taskId,
        JSON.stringify(parsedDraft),
      );
  }

  clearAccepted(scope: DelegationDraftScope, delegationKey: string): boolean {
    const parsedScope = DelegationDraftScopeSchema.parse(scope);
    const result = this.db
      .prepare(
        `DELETE FROM task_delegation_drafts
         WHERE scope_key = ?
           AND json_extract(draft_json, '$.pendingRequest.delegationKey') = ?`,
      )
      .run(delegationDraftScopeKey(parsedScope), delegationKey) as {
      changes?: number;
    };
    return (result.changes ?? 0) > 0;
  }
}

import {
  WorkspaceResumeBriefDraftSchema,
  type WorkspaceResumeBriefDraft,
} from "../../src/lib/workspace-resume-brief";

interface DraftDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

/** Small draft writes do not serialize the workspace or its conversations. */
export class WorkspaceDirectionDraftStore {
  constructor(private readonly db: DraftDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS workspace_direction_drafts (
      workspace_id TEXT PRIMARY KEY REFERENCES workspace_meta(id) ON DELETE CASCADE,
      draft_json TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS clear_workspace_direction_drafts
    AFTER DELETE ON workspace_meta BEGIN
      DELETE FROM workspace_direction_drafts WHERE workspace_id = OLD.id;
    END;`);
  }
  load(workspaceId: string): WorkspaceResumeBriefDraft | null {
    const row = this.db
      .prepare(
        "SELECT draft_json FROM workspace_direction_drafts WHERE workspace_id = ?",
      )
      .get(workspaceId) as { draft_json: string } | undefined;
    return row
      ? WorkspaceResumeBriefDraftSchema.parse(JSON.parse(row.draft_json))
      : null;
  }
  save(workspaceId: string, draft: WorkspaceResumeBriefDraft | null) {
    if (draft === null) {
      this.db
        .prepare(
          "DELETE FROM workspace_direction_drafts WHERE workspace_id = ?",
        )
        .run(workspaceId);
      return;
    }
    const parsed = WorkspaceResumeBriefDraftSchema.parse(draft);
    if (
      !this.db
        .prepare("SELECT id FROM workspace_meta WHERE id = ?")
        .get(workspaceId)
    ) {
      throw new Error("The workspace no longer exists.");
    }
    this.db
      .prepare(
        `INSERT INTO workspace_direction_drafts (workspace_id, draft_json) VALUES (?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET draft_json = excluded.draft_json`,
      )
      .run(workspaceId, JSON.stringify(parsed));
  }
}

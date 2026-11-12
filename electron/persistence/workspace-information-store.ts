import type Database from "better-sqlite3";
import { createEmptyWorkspaceInformation, type WorkspaceInformationState } from "../../src/lib/workspace-information";

/** Partial shell writes preserve tasks, drafts, editor artifacts and layout. Uses the caller's transaction. */
export class WorkspaceInformationStore {
  constructor(private readonly db: Database.Database) {}

  read(workspaceId: string): WorkspaceInformationState {
    const row = this.db.prepare("SELECT snapshot_json FROM workspaces WHERE id = ?").get(workspaceId) as { snapshot_json: string } | undefined;
    if (!row) throw new Error("The registered workspace has no saved Information panel.");
    return JSON.parse(row.snapshot_json).workspaceInformation ?? createEmptyWorkspaceInformation();
  }

  write(workspaceId: string, information: WorkspaceInformationState, now: string): void {
    const saved = this.db.prepare(`UPDATE workspaces SET snapshot_json = json_set(snapshot_json, '$.workspaceInformation', json(?)), updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(information), now, workspaceId);
    if (Number(saved.changes) !== 1) throw new Error("The workspace no longer exists.");
  }
}

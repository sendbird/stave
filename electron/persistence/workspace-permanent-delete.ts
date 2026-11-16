import type Database from "better-sqlite3";
import { deleteTaskRelatedRows } from "./task-permanent-delete";

/** Workspace row cleanup; the caller owns the IMMEDIATE transaction. */
export function deleteWorkspaceRelatedRows(db: Database.Database, workspaceId: string): string[] {
  const tasks = db.prepare("SELECT id FROM tasks WHERE workspace_id = ?").all(workspaceId) as {id:string}[];
  for (const task of tasks) {
    deleteTaskRelatedRows(db, { workspaceId, taskId: task.id.slice(workspaceId.length + 1) });
  }
  const scope = "workspace_id = ?";
  const params = [workspaceId];
  const artifacts = db.prepare(`SELECT DISTINCT artifacts.id, artifacts.relative_path FROM artifacts JOIN turn_events ON turn_events.payload_artifact_id = artifacts.id WHERE turn_events.turn_id IN (SELECT id FROM turns WHERE ${scope})`).all(...params) as {id:string;relative_path:string}[];
  const agentScope = scope;
  db.prepare(`DELETE FROM run_receipts WHERE run_id IN (SELECT id FROM runs WHERE ${scope})`).run(...params);
  db.prepare(`DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE ${scope})`).run(...params);
  db.prepare(`DELETE FROM runs WHERE ${scope}`).run(...params);
  for (const table of ["agent_run_stages", "agent_run_events"]) db.prepare(`DELETE FROM ${table} WHERE agent_run_id IN (SELECT id FROM agent_runs WHERE ${agentScope})`).run(...params);
  db.prepare(`DELETE FROM agent_runs WHERE ${agentScope}`).run(...params);
  db.prepare(`DELETE FROM result_review_evidence WHERE json_valid(scope_key) AND json_extract(scope_key, '$[1]') = ?`).run(...params);
  for (const table of ["result_reviews", "notifications", "wake_up_occurrences", "wake_ups"]) db.prepare(`DELETE FROM ${table} WHERE ${scope}`).run(...params);
  db.prepare(`DELETE FROM turn_events WHERE turn_id IN (SELECT id FROM turns WHERE ${scope})`).run(...params);
  for (const table of ["turns", "messages"]) db.prepare(`DELETE FROM ${table} WHERE ${scope}`).run(...params);
  const hasTable = (table: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  for (const table of ["task_handoff_records", "fleet_attention_snoozes", "tracker_issue_kickoffs", "workspace_document_revisions", "workspace_document_archived_workspaces"]) {
    if (hasTable(table)) db.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(workspaceId);
  }
  db.prepare("DELETE FROM tasks WHERE workspace_id = ?").run(workspaceId);
  for (const artifact of artifacts) db.prepare("DELETE FROM artifacts WHERE id = ?").run(artifact.id);
  return artifacts.map(artifact => artifact.relative_path);
}

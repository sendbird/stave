import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import type { PersistenceWorkspaceSnapshot } from "../../electron/persistence/types";

const [, , dbPath, scope] = process.argv;
const store = new SqliteStore({ dbPath, runMaintenance: false });
const db = new Database(dbPath);
const snapshot = {
  activeTaskId: "task", tasks: [{ id: "task", title: "Task", provider: "codex", archivedAt: "2026-01-01", updatedAt: "2026-01-01", unread: false }],
  messagesByTask: { task: [{ id: "message", role: "user", model: "user", providerId: "user", content: "Searchable history", parts: [] }] },
} as unknown as PersistenceWorkspaceSnapshot;
store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot });
const childSnapshot = { ...snapshot, activeTaskId: "child", tasks: [{ ...snapshot.tasks[0], id: "child", parentTaskId: "task" }], messagesByTask: {} };
store.upsertWorkspace({ id: "other", name: "Other", snapshot: childSnapshot });
store.beginTurn({ id: "turn", workspaceId: "workspace", taskId: "task", providerId: "codex" });
store.completeTurn({ id: "turn", completedAt: "2026-01-01" });
// A task owns its delegated ledger even when the execution lives elsewhere.
db.exec(`INSERT INTO runs VALUES ('child-run','delegated-task','task','task','/tmp/project','other','child','completed','{}','{}','now','now','now',NULL);
  INSERT INTO run_steps VALUES ('step','child-run','delegated-task-turn',NULL,'[]','completed',1,'execution','claim','hash','result','now','now','now','now',NULL);
  INSERT INTO run_receipts VALUES ('child-run','step',1,'completed','execution','complete','now','{}');
  INSERT INTO wake_ups (id,workspace_id,task_id,project_path,prompt,trigger_json,fingerprint_json,state,created_at,updated_at) VALUES ('wake','workspace','task','/tmp/project','wake','{}','{}','paused','now','now');
  INSERT INTO wake_up_occurrences (id,wake_up_id,idempotency_key,workspace_id,task_id,outcome,scheduled_for,recorded_at) VALUES ('occurrence','wake','key','workspace','task','skipped','now','now');
  INSERT INTO task_handoff_records VALUES ('workspace','task','{}','now');
  INSERT INTO agent_assignments (id,request_id,agent_config_id,state,task_id,body_json,created_at,updated_at) VALUES ('assignment','request','agent','ended','task','{"taskId":"task"}','now','now');
  INSERT INTO tracker_issue_kickoffs (id,source,task_ref,task_key,workspace_id,stave_task_id,state,created_at,updated_at) VALUES ('kickoff','tracker','ref','key','workspace','task','ended','now','now');
  INSERT INTO workspace_document_revisions (workspace_id,file_path,revision,author,task_id,turn_id,content_hash,content,created_at) VALUES ('workspace','plan.md',1,'agent','task','turn','hash','plan','now');
  INSERT INTO notifications (id,kind,title,body,workspace_id,task_id,payload_json,created_at) VALUES ('notice','task.turn_completed','Done','Done','workspace','task','{}','now');
  INSERT INTO result_reviews (id,project_path,project_name,workspace_id,workspace_name,task_id,task_title,turn_id,outcome,summary,created_at) VALUES ('result','/tmp/project','Project','workspace','Workspace','task','Task','turn','completed','Done','now');
  INSERT INTO fleet_attention_snoozes VALUES ('turn:result-ready:workspace:task:turn','workspace','tomorrow','now');`);
db.prepare("INSERT INTO result_review_evidence VALUES (?,?)").run(JSON.stringify(["/tmp/project", "workspace", "task", "turn"]), "{}");
const artifactPath = path.join(path.dirname(dbPath), "artifacts", "turn-event.json");
mkdirSync(path.dirname(artifactPath), {recursive:true});
writeFileSync(artifactPath, "private event bytes");
db.exec(`INSERT INTO artifacts(id,kind,relative_path,byte_size,created_at) VALUES ('payload','event','turn-event.json',19,'now');
  INSERT INTO turn_events(id,turn_id,sequence,event_type,payload_json,payload_artifact_id,created_at) VALUES ('event','turn',1,'test','{}','payload','now');
  INSERT INTO lens_review_records(id,task_id,workspace_id,annotation_id,captured_at,record_json) VALUES ('review','task','workspace','annotation','now','{}');`);
const sharedArtifactPath = path.join(path.dirname(artifactPath), "shared-event.json");
writeFileSync(sharedArtifactPath, "shared event bytes");
db.exec(`INSERT INTO artifacts(id,kind,relative_path,byte_size,created_at) VALUES ('shared-payload','event','shared-event.json',18,'now');
  INSERT INTO turns(id,workspace_id,task_id,provider_id,created_at,completed_at) VALUES ('other-turn','other','other-task','codex','now','now');
  INSERT INTO turn_events(id,turn_id,sequence,event_type,payload_json,payload_artifact_id,created_at) VALUES ('shared-source','turn',2,'test','{}','shared-payload','now');
  INSERT INTO turn_events(id,turn_id,sequence,event_type,payload_json,payload_artifact_id,created_at) VALUES ('shared-survivor','other-turn',1,'test','{}','shared-payload','now');`);
const remove = () => scope === "workspace"
  ? store.permanentDeleteWorkspace({ workspaceId: "workspace" })
  : store.removeTaskFromWorkspace({ workspaceId: "workspace", taskId: "task", permanently: true });
const before = () => Object.fromEntries(["runs", "run_steps", "run_receipts", "tasks", "messages", "wake_ups", "notifications"].map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get()]));
const original = before();
db.exec(`CREATE TRIGGER refuse_delete BEFORE DELETE ON ${scope === "workspace" ? "workspaces" : "tasks"} BEGIN SELECT RAISE(ABORT, 'injected deletion failure'); END`);
assert.throws(remove, /injected deletion failure/);
assert.deepEqual(before(), original, "all related cleanup must roll back together");
assert.ok(existsSync(artifactPath), "rollback keeps artifact file");
assert.equal((db.prepare("SELECT count(*) AS n FROM artifacts WHERE id='payload'").get() as {n:number}).n, 1);
assert.equal((db.prepare("SELECT count(*) AS n FROM lens_review_records WHERE id='review'").get() as {n:number}).n, 1);
db.exec("DROP TRIGGER refuse_delete");
remove();
for (const table of ["runs", "run_steps", "run_receipts", "tasks", "messages", "turns", "turn_events", "wake_ups", "wake_up_occurrences", "task_handoff_records", "notifications", "result_reviews", "result_review_evidence", "fleet_attention_snoozes"]) {
  assert.equal((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n, ["tasks", "turns", "turn_events"].includes(table) ? 1 : 0, `${scope} deletion left rows in ${table}`);
}
assert.equal((db.prepare("SELECT task_id FROM agent_assignments WHERE id='assignment'").get() as {task_id:null}).task_id, null);
assert.equal((db.prepare("SELECT json_extract(body_json,'$.taskId') AS task FROM agent_assignments WHERE id='assignment'").get() as {task:null}).task, null);
// Kept workspace documents and kickoff history must detach the deleted task.
for (const [table, column] of [["workspace_document_revisions", "task_id"], ["tracker_issue_kickoffs", "stave_task_id"]]) {
  assert.equal((db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}='task'`).get() as {n:number}).n, 0, table);
}
assert.equal((db.prepare("SELECT count(*) AS n FROM artifacts WHERE id='payload'").get() as {n:number}).n, 0, "event artifact row must be deleted");
assert.equal(existsSync(artifactPath), false, "event artifact file must be deleted after commit");
assert.equal((db.prepare("SELECT count(*) AS n FROM artifacts WHERE id='shared-payload'").get() as {n:number}).n, 1, "shared artifact survives another task's deletion");
assert.ok(existsSync(sharedArtifactPath), "shared artifact file survives");
assert.equal((db.prepare("SELECT count(*) AS n FROM lens_review_records WHERE id='review'").get() as {n:number}).n, 0, "review rows must be deleted in the transaction");
assert.equal(store.loadWorkspaceShell({workspaceId:"other"})?.tasks[0].parentTaskId, null, "surviving child must detach its deleted parent");
store.upsertWorkspace({id:"other", name:"Other", snapshot:childSnapshot});
assert.equal(store.loadWorkspaceShell({workspaceId:"other"})?.tasks[0].parentTaskId, null, "late save cannot reattach the deleted parent");
store.close();
db.close();

import { selectTaskHistoryEntries } from "../src/lib/tasks";
import type { Task } from "../src/types/chat";
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TaskHandoffStore } from "../electron/persistence/task-handoff-store";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { TrackerIssuesStore } from "../electron/persistence/tracker-issues-store";
import { WorkspaceDocumentStore } from "../electron/persistence/workspace-document-store";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { ResultReviewStore } from "../electron/persistence/result-review-store";
import { FleetAttentionSnoozeStore } from "../electron/persistence/fleet-attention-snooze-store";
import type { PersistenceWorkspaceSnapshot } from "../electron/persistence/types";
import type NativeDatabase from "better-sqlite3";

const connections: Database[] = [];
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
function setup() {
  const db = new Database(":memory:");
  connections.push(db);
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false, lensReviewRecords: { deleteTaskRows: () => async () => {} }, tars: { snapshot: () => ({ responsibilities: [] }) } });
  (store as unknown as { bootstrap(): void }).bootstrap();
  const native = db as unknown as NativeDatabase.Database;
  new RunLedgerStore(db);
  new AgentRunStore(db);
  new ResultReviewStore(native);
  new FleetAttentionSnoozeStore(db);
  new TaskHandoffStore(native);
  new WakeUpStore(db);
  new AgentAssignmentStore(db);
  new TrackerIssuesStore(db);
  new WorkspaceDocumentStore(db);
  db.exec("CREATE TABLE IF NOT EXISTS tars_responsibilities (body_json TEXT)");
  const snapshot = { version: 1, activeTaskId: "task", tasks: [{ id: "task", title: "Task", provider: "codex", updatedAt: "2026-11-16T00:00:00Z", archivedAt: "2026-11-16T00:00:00Z", unread: false }], messagesByTask: { task: [] }, terminalTabs: [], activeTerminalTabId: null, terminalDocked: false, cliSessionTabs: [], activeCliSessionTabId: null, editorTabs: [], activeEditorTabId: null } as unknown as PersistenceWorkspaceSnapshot;
  store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot });
  return { db, store, snapshot };
}
const args = { workspaceId: "workspace", taskId: "task", permanently: true };

describe("permanent task deletion with the real SQLite store", () => {
  test("deletes task-related rows and a later snapshot cannot resurrect the task", () => {
    const { db, store, snapshot } = setup();
    db.exec(`INSERT INTO runs VALUES ('run','delegated-task','task','task','/tmp/project','workspace','task','completed','{}','{}','now','now','now',NULL);
      INSERT INTO run_steps VALUES ('step','run','delegated-task-turn',NULL,'[]','completed',1,'execution','claim','hash','result','now','now','now','now',NULL);
      INSERT INTO run_receipts VALUES ('run','step',1,'completed','execution','complete','now','{}');
      INSERT INTO fleet_attention_snoozes VALUES ('turn:result-ready:workspace:task:turn','workspace','tomorrow','now');
      INSERT INTO fleet_attention_snoozes VALUES ('turn:result-ready:workspace:task-other:turn','workspace','tomorrow','now');`);
    db.prepare("INSERT INTO result_reviews (id, project_path, project_name, workspace_id, workspace_name, task_id, task_title, turn_id, outcome, summary, created_at) VALUES ('result','/tmp/project','Project','workspace','Workspace','task','Task','turn','completed','Done','now')").run();
    db.prepare("INSERT INTO result_review_evidence VALUES (?, ?)").run(JSON.stringify(["/tmp/project", "workspace", "task", "turn"]), "{}");
    db.exec("INSERT INTO notifications (id,kind,title,body,workspace_id,task_id,payload_json,created_at) VALUES ('notice','task.turn_completed','Done','Done','workspace','task','{}','now')");
    store.removeTaskFromWorkspace(args);
    for (const table of ["tasks", "runs", "run_steps", "run_receipts", "result_reviews", "result_review_evidence", "notifications"]) expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT attention_id FROM fleet_attention_snoozes").all()).toEqual([{ attention_id: "turn:result-ready:workspace:task-other:turn" }]);
    store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot });
    expect(store.loadWorkspaceShell({ workspaceId: "workspace" })?.tasks).toEqual([]);
    expect(store.persistTaskTurnDelta({ workspaceId: "workspace", taskId: "task", task: snapshot.tasks[0] })).toEqual({ ok: true, messageCount: 0 });
    expect(() => store.beginTurn({ id: "late", workspaceId: "workspace", taskId: "task", providerId: "codex" })).toThrow("permanently deleted");
  });
  test("requires archival even after a run has ended", () => {
    const { db, store, snapshot } = setup();
    store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { ...snapshot, tasks: snapshot.tasks.map((task) => ({ ...task, archivedAt: null })) } });
    db.exec("INSERT INTO agent_runs (id, repository_path, workspace_id, lead_task_id, state, created_at, updated_at, workflow_json, assignment, consent_json, fingerprint_json, current_stage_index) VALUES ('ended','/tmp/project','workspace','task','completed','now','now','{}','done','{}','{}',0)");
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("Archive the task");
  });
  test("cleans ancillary task references and preserves a parent's own ledger", () => {
    const { db, store } = setup();
    db.exec(`INSERT INTO wake_ups (id,workspace_id,task_id,project_path,prompt,trigger_json,fingerprint_json,state,created_at,updated_at) VALUES ('wake','workspace','task','/tmp/project','wake','{}','{}','paused','now','now');
      INSERT INTO wake_up_occurrences (id,wake_up_id,idempotency_key,workspace_id,task_id,outcome,scheduled_for,recorded_at) VALUES ('occurrence','wake','key','workspace','task','skipped','now','now');
      INSERT INTO task_handoff_records VALUES ('workspace','task','{}','now');
      INSERT INTO agent_assignments (id,request_id,agent_config_id,state,task_id,body_json,created_at,updated_at) VALUES ('assignment','request','agent','ended','task','{"taskId":"task"}','now','now');
      INSERT INTO tracker_issue_kickoffs (id,source,task_ref,task_key,workspace_id,stave_task_id,state,created_at,updated_at) VALUES ('kickoff','tracker','ref','key','workspace','task','ended','now','now');
      INSERT INTO workspace_document_revisions (workspace_id,file_path,revision,author,task_id,turn_id,content_hash,content,created_at) VALUES ('workspace','plan.md',1,'agent','task','turn','hash','plan','now');
      INSERT INTO runs VALUES ('parent-run','delegated-task','task','parent','/tmp/project','workspace','task','completed','{}','{}','now','now','now',NULL);
      INSERT INTO run_steps VALUES ('parent-step','parent-run','delegated-task-turn',NULL,'[]','completed',1,'execution','claim','hash','result','now','now','now','now',NULL);
      INSERT INTO run_receipts VALUES ('parent-run','parent-step',1,'completed','execution','complete','now','{}');`);
    store.removeTaskFromWorkspace(args);
    for (const table of ["wake_ups", "wake_up_occurrences", "task_handoff_records"]) expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT task_id FROM agent_assignments").get()).toEqual({ task_id: null });
    expect(db.prepare("SELECT stave_task_id FROM tracker_issue_kickoffs").get()).toEqual({ stave_task_id: null });
    expect(db.prepare("SELECT task_id, turn_id FROM workspace_document_revisions").get()).toEqual({ task_id: null, turn_id: null });
    expect(db.prepare("SELECT task_id FROM runs WHERE id='parent-run'").get()).toEqual({ task_id: null });
    expect(db.prepare("SELECT COUNT(*) AS n FROM run_receipts WHERE run_id='parent-run'").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM run_steps WHERE run_id='parent-run'").get()).toEqual({ n: 1 });
  });
  test("refuses a running turn without deleting any row", () => {
    const { db, store } = setup();
    db.exec("INSERT INTO turns (id,workspace_id,task_id,provider_id,created_at) VALUES ('turn','workspace','task','codex','now')");
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("running work");
    expect(store.loadWorkspaceShell({ workspaceId: "workspace" })?.tasks).toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM deleted_tasks").get()).toEqual({ n: 0 });
  });
  test("refuses a live child, a managed task, and work held by Tars", () => {
    const { db, store, snapshot } = setup();
    db.exec("INSERT INTO runs VALUES ('child','delegated-task','task','task','/tmp/project','workspace','child','running','{}','{}','now','now',NULL,NULL)");
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("running work");
    db.exec("DELETE FROM runs");
    store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { ...snapshot, tasks: snapshot.tasks.map((task) => ({ ...task, controlMode: "managed" })) } });
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("Managed tasks");
    store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot });
    db.prepare("INSERT INTO tars_responsibilities VALUES (?)").run(JSON.stringify({ taskId: "task", state: "running" }));
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("managed by Tars");
    expect(db.prepare("SELECT COUNT(*) AS n FROM deleted_tasks").get()).toEqual({ n: 0 });
  });
  test("preserves an ended child in another workspace and releases it into History", () => {
    const { db, store, snapshot } = setup();
    const childSnapshot: PersistenceWorkspaceSnapshot = { ...snapshot, activeTaskId: "child", openTaskTabIds: [],
      tasks: [{ ...snapshot.tasks[0]!, id: "child", parentTaskId: "task" }],
      messagesByTask: { child: [{ id: "child-message", role: "assistant", providerId: "codex", model: "model", content: "Child result", parts: [{ type: "text", text: "Child result" }], isStreaming: false }] } };
    store.upsertWorkspace({ id: "child-workspace", name: "Child workspace", snapshot: childSnapshot });
    db.exec("INSERT INTO runs VALUES ('child-run','delegated-task','task','task','/tmp/project','child-workspace','child','completed','{}','{}','now','now','now',NULL)");
    store.removeTaskFromWorkspace(args);
    let childShell = store.loadWorkspaceShell({ workspaceId: "child-workspace" })!;
    expect(childShell.tasks).toHaveLength(1);
    expect(childShell.tasks[0]!.parentTaskId).toBeNull();
    expect(selectTaskHistoryEntries({ tasks: childShell.tasks as Task[], openTaskTabIds: [] }).map((task) => task.id)).toEqual(["child"]);
    expect(store.loadAllTaskMessages({ workspaceId: "child-workspace", taskId: "child" })[0]?.content).toBe("Child result");
    expect(store.loadWorkspaceShellSummary({ workspaceId: "child-workspace" })?.tasks[0]?.parentTaskId).toBeNull();
    store.upsertWorkspace({ id: "child-workspace", name: "Child workspace", snapshot: childSnapshot });
    store.persistTaskTurnDelta({ workspaceId: "child-workspace", taskId: "child", task: childSnapshot.tasks[0] });
    childShell = store.loadWorkspaceShell({ workspaceId: "child-workspace" })!;
    expect(childShell.tasks[0]!.parentTaskId).toBeNull();
  });
  test("a failed parent deletion rolls the surviving child's parent stamp back", () => {
    const { db, store, snapshot } = setup();
    store.upsertWorkspace({ id: "child-workspace", name: "Child workspace", snapshot: { ...snapshot, tasks: [{ ...snapshot.tasks[0]!, id: "child", parentTaskId: "task" }], messagesByTask: {} } });
    db.exec("CREATE TRIGGER reject_parent_delete BEFORE DELETE ON tasks WHEN OLD.id = 'workspace:task' BEGIN SELECT RAISE(ABORT, 'blocked parent write'); END");
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("blocked parent write");
    expect(store.loadWorkspaceShell({ workspaceId: "child-workspace" })?.tasks[0]?.parentTaskId).toBe("task");
    expect(store.loadWorkspaceShellSummary({ workspaceId: "child-workspace" })?.tasks[0]?.parentTaskId).toBe("task");
    expect(store.loadWorkspaceShell({ workspaceId: "workspace" })?.tasks).toHaveLength(1);
  });
  test("rolls related deletions back when the task delete fails", () => {
    const { db, store } = setup();
    db.exec("INSERT INTO fleet_attention_snoozes VALUES ('turn:result-ready:workspace:task:turn','workspace','tomorrow','now'); CREATE TRIGGER reject_delete BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, 'blocked write'); END");
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("blocked write");
    expect(db.prepare("SELECT COUNT(*) AS n FROM fleet_attention_snoozes").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM deleted_tasks").get()).toEqual({ n: 0 });
  });
});


test("addressed host archival refuses live work and version-checks undo", () => {
  const { db, store, snapshot } = setup();
  store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { ...snapshot, tasks: snapshot.tasks.map((task) => ({ ...task, archivedAt: null })) } });
  const target = { workspaceId: "workspace", taskId: "task" };
  db.exec("INSERT INTO turns (id,workspace_id,task_id,provider_id,created_at) VALUES ('turn','workspace','task','codex','now')");
  expect(store.archiveFleetTask(target)).toEqual({ ok: false, reason: "live-work" });
  db.exec("UPDATE turns SET completed_at = 'now'");
  const archived = store.archiveFleetTask(target);
  expect(archived.ok).toBe(true);
  expect(store.loadWorkspaceShell(target)?.tasks[0]?.archivedAt).toBe(archived.archivedAt);
  expect(store.archiveFleetTask({ ...target, restore: true, expectedArchivedAt: "stale" })).toEqual({ ok: false, reason: "changed" });
  expect(store.archiveFleetTask({ ...target, restore: true, expectedArchivedAt: archived.archivedAt! })).toEqual({ ok: true, archivedAt: null });
});

test("stop preview counts persisted work without loading providers", () => {
  const { db, store } = setup();
  db.exec("INSERT INTO turns (id,workspace_id,task_id,provider_id,created_at) VALUES ('turn','workspace','task','codex','now')");
  db.exec("INSERT INTO runs VALUES ('child','delegated-task','task','task','/tmp/project','workspace','child-task','running','{}','{}','now','now',NULL,NULL)");
  const result = store.previewFleetStop({ targets: [{ workspaceId: "workspace", taskId: "task" }] });
  expect(result).toMatchObject({ ok: true, turns: 1, children: 1, runs: 0, items: [{ workspaceId: "workspace", taskId: "task", turns: 1, children: 1, runs: 0 }] });
});


for (const part of [{ type: "approval", state: "approval-requested" }, { type: "user_input", state: "input-requested", delivery: "async" }]) test(`host archive preserves a pending ${part.type} even without an active turn`, () => {
  const { store, snapshot } = setup();
  store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { ...snapshot,
    tasks: snapshot.tasks.map((task) => ({ ...task, archivedAt: null })),
    messagesByTask: { task: [{ id: "message", role: "assistant", model: "model", providerId: "codex", content: "", parts: [part] }] },
  } });
  expect(store.archiveFleetTask({ workspaceId: "workspace", taskId: "task" })).toEqual({ ok: false, reason: "pending-interaction" });
  expect(store.loadWorkspaceShell({ workspaceId: "workspace" })?.tasks[0]?.archivedAt).toBeNull();
});

test("host archive closes the task surface and links while undo preserves the current surface", () => {
  const { store, snapshot } = setup();
  store.upsertWorkspace({ id: "workspace", name: "Workspace", snapshot: { ...snapshot,
    tasks: [{ ...snapshot.tasks[0]!, archivedAt: null, unread: true }, { ...snapshot.tasks[0]!, id: "kept", archivedAt: null }],
    activeTaskId: "task", activeSurface: { kind: "task", taskId: "task" }, openTaskTabIds: ["task", "kept"],
    paneTabMeta: { "task:task": { title: "Task" }, "task:kept": { title: "Kept" } },
    terminalTabs: [{ id: "terminal", title: "Terminal", linkedTaskId: "task", cwd: "/tmp/project" }],
    cliSessionTabs: [{ id: "cli", title: "CLI", linkedTaskId: "task", providerId: "codex" }],
  } as PersistenceWorkspaceSnapshot });
  const target = { workspaceId: "workspace", taskId: "task" };
  const result = store.archiveFleetTask(target);
  expect(result.ok).toBe(true);
  const archived = store.loadWorkspaceShell(target)!;
  expect(archived.openTaskTabIds).toEqual(["kept"]);
  expect(archived.activeTaskId).toBe("kept");
  expect(archived.activeSurface).toEqual({ kind: "task", taskId: "kept" });
  expect(archived.terminalTabs?.[0]?.linkedTaskId).toBeNull();
  expect(archived.cliSessionTabs?.[0]?.linkedTaskId).toBeNull();
  expect(archived.paneTabMeta?.["task:task"]).toBeUndefined();
  expect(archived.tasks[0]?.unread).toBe(false);
  expect(store.archiveFleetTask({ ...target, restore: true, expectedArchivedAt: result.archivedAt! }).ok).toBe(true);
  const restored = store.loadWorkspaceShell(target)!;
  expect(restored.activeTaskId).toBe("kept");
  expect(restored.activeSurface).toEqual(archived.activeSurface);
  expect(restored.openTaskTabIds).toEqual(["kept"]);
});

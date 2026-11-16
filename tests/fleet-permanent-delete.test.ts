import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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
  Object.assign(store, { db, _closed: false, lensReviewRecords: { deleteTask: async () => {} } });
  (store as unknown as { bootstrap(): void }).bootstrap();
  const native = db as unknown as NativeDatabase.Database;
  new RunLedgerStore(db);
  new AgentRunStore(db);
  new ResultReviewStore(native);
  new FleetAttentionSnoozeStore(db);
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
  test("rolls related deletions back when the task delete fails", () => {
    const { db, store } = setup();
    db.exec("INSERT INTO fleet_attention_snoozes VALUES ('turn:result-ready:workspace:task:turn','workspace','tomorrow','now'); CREATE TRIGGER reject_delete BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, 'blocked write'); END");
    expect(() => store.removeTaskFromWorkspace(args)).toThrow("blocked write");
    expect(db.prepare("SELECT COUNT(*) AS n FROM fleet_attention_snoozes").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM deleted_tasks").get()).toEqual({ n: 0 });
  });
});

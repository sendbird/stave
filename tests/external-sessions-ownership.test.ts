import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { NativeSessionOwnershipReader } from "../electron/persistence/native-session-ownership";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT NOT NULL, snapshot_json TEXT NOT NULL);
    CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, provider_id TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT);
    CREATE TABLE turn_events (id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, payload_artifact_id TEXT, created_at TEXT NOT NULL);
  `);
  return db;
}

test("ids from recent turns and from stored workspace shells are Stave's; others are not", () => {
  const db = database();
  const now = Date.parse("2026-11-24T12:00:00.000Z");
  const recent = new Date(now - 60_000).toISOString();
  const stale = new Date(now - 3 * 24 * 60 * 60_000).toISOString();
  db.prepare("INSERT INTO turns VALUES (?, 'w1', 't1', 'claude-code', ?, NULL)").run("turn-live", recent);
  db.prepare("INSERT INTO turn_events VALUES ('e1', 'turn-live', 1, 'provider_session', ?, NULL, ?)").run(
    JSON.stringify({ type: "provider_session", providerId: "claude-code", nativeSessionId: "running-turn-id" }), recent);
  db.prepare("INSERT INTO turns VALUES (?, 'w1', 't1', 'codex', ?, NULL)").run("turn-old", stale);
  db.prepare("INSERT INTO turn_events VALUES ('e2', 'turn-old', 1, 'provider_session', ?, NULL, ?)").run(
    JSON.stringify({ type: "provider_session", providerId: "codex", nativeSessionId: "old-turn-id" }), stale);
  db.prepare("INSERT INTO turn_events VALUES ('e3', 'turn-live', 2, 'text', ?, NULL, ?)").run(JSON.stringify({ type: "text", text: "outside-id" }), recent);
  db.prepare("INSERT INTO workspaces VALUES ('w1', 'one', ?, ?)").run(recent, JSON.stringify({
    providerSessionByTask: { t1: { "claude-code": { nativeSessionId: "stored-task-id" } } },
    cliSessionTabs: [{ id: "tab", nativeSessionId: "cli-tab-id" }],
  }));

  const reader = new NativeSessionOwnershipReader(db);
  const owned = reader.ownedIds(["running-turn-id", "stored-task-id", "cli-tab-id", "outside-id", "old-turn-id", ""], now);
  expect([...owned].sort()).toEqual(["cli-tab-id", "running-turn-id", "stored-task-id"]);
  expect(reader.ownedIds([], now).size).toBe(0);
});

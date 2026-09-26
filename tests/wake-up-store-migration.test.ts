import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import { createWakeUp } from "../src/lib/supervision/wake-up-policy";

// Covers the temporary migration "wake-up-tables"; delete this file together
// with it (see config/temporary-migrations.json).

const LEGACY_SCHEMA = `
  CREATE TABLE task_heartbeats (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    prompt TEXT NOT NULL,
    trigger_json TEXT NOT NULL,
    fingerprint_json TEXT NOT NULL,
    state TEXT NOT NULL,
    pause_reason TEXT,
    stop_reason TEXT,
    reason_detail TEXT,
    next_run_at TEXT,
    last_occurrence_at TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    max_occurrences INTEGER,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_task_heartbeats_task ON task_heartbeats (task_id);
  CREATE INDEX idx_task_heartbeats_due ON task_heartbeats (state, next_run_at);
  CREATE TABLE task_heartbeat_occurrences (
    id TEXT PRIMARY KEY,
    heartbeat_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    turn_id TEXT,
    outcome TEXT NOT NULL,
    reason TEXT,
    scheduled_for TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_task_heartbeat_occurrence_key
    ON task_heartbeat_occurrences (heartbeat_id, idempotency_key);
  CREATE INDEX idx_task_heartbeat_occurrences_recent
    ON task_heartbeat_occurrences (heartbeat_id, recorded_at DESC);
`;

const NOW = new Date("2026-09-20T10:00:00.000Z");
const legacyWakeUp = createWakeUp({
  id: "wake-1",
  input: {
    workspaceId: "ws-1",
    taskId: "task-1",
    prompt: "Re-check CI and report only if something changed.",
    trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
    maxOccurrences: null,
    expiresAt: null,
  },
  projectPath: "/tmp/project",
  fingerprint: { providerId: "claude-code", model: "sonnet" },
  now: NOW,
});

let database: Database;

function seedLegacyRows() {
  database
    .prepare(
      `INSERT INTO task_heartbeats (
         id, workspace_id, task_id, project_path, prompt, trigger_json,
         fingerprint_json, state, next_run_at, occurrence_count, skipped_count,
         max_occurrences, expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?, ?)`,
    )
    .run(
      legacyWakeUp.id,
      legacyWakeUp.workspaceId,
      legacyWakeUp.taskId,
      legacyWakeUp.projectPath,
      legacyWakeUp.prompt,
      JSON.stringify(legacyWakeUp.trigger),
      JSON.stringify(legacyWakeUp.fingerprint),
      legacyWakeUp.state,
      legacyWakeUp.nextRunAt,
      legacyWakeUp.createdAt,
      legacyWakeUp.updatedAt,
    );
  database
    .prepare(
      `INSERT INTO task_heartbeat_occurrences (
         id, heartbeat_id, idempotency_key, workspace_id, task_id, turn_id,
         outcome, reason, scheduled_for, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "occ-1",
      "wake-1",
      "wake-1:fired:2026-09-20T11:00:00.000Z",
      "ws-1",
      "task-1",
      "turn-1",
      "fired",
      null,
      "2026-09-20T11:00:00.000Z",
      "2026-09-20T11:00:01.000Z",
    );
}

function schemaNames(type: "table" | "index") {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
      .all(type) as Array<{ name: string }>
  )
    .map((row) => row.name)
    .filter((name) => !name.startsWith("sqlite_"));
}

beforeEach(() => {
  database = new Database(":memory:");
});

afterEach(() => {
  database.close();
});

describe("wake-up table migration", () => {
  test("renames legacy tables, the occurrence column and indexes, keeping rows", () => {
    database.exec(LEGACY_SCHEMA);
    seedLegacyRows();

    const store = new WakeUpStore(database);

    expect(schemaNames("table")).toEqual(["wake_up_occurrences", "wake_ups"]);
    expect(schemaNames("index")).toEqual([
      "idx_wake_up_occurrence_key",
      "idx_wake_up_occurrences_recent",
      "idx_wake_ups_due",
      "idx_wake_ups_task",
    ]);
    expect(store.list().map((wakeUp) => wakeUp.id)).toEqual(["wake-1"]);
    expect(
      store.listOccurrences({ wakeUpId: "wake-1" }).map((row) => row.idempotencyKey),
    ).toEqual(["wake-1:fired:2026-09-20T11:00:00.000Z"]);
  });

  test("keeps the idempotency guarantee for occurrences recorded before the rename", () => {
    database.exec(LEGACY_SCHEMA);
    seedLegacyRows();
    const store = new WakeUpStore(database);

    const recorded = store.recordOccurrence({
      id: "occ-2",
      wakeUpId: "wake-1",
      idempotencyKey: "wake-1:fired:2026-09-20T11:00:00.000Z",
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: null,
      outcome: "fired",
      reason: null,
      scheduledFor: "2026-09-20T11:00:00.000Z",
      recordedAt: "2026-09-20T11:05:00.000Z",
    });

    expect(recorded).toBe(false);
  });

  test("prefers legacy data over an empty table created by a newer build", () => {
    database.exec(LEGACY_SCHEMA);
    seedLegacyRows();
    database.exec("CREATE TABLE wake_ups (id TEXT PRIMARY KEY)");

    const store = new WakeUpStore(database);

    expect(store.list().map((wakeUp) => wakeUp.id)).toEqual(["wake-1"]);
    expect(schemaNames("table")).not.toContain("task_heartbeats");
  });

  test("is a no-op on a fresh database and when run twice", () => {
    new WakeUpStore(database);
    const store = new WakeUpStore(database);
    expect(schemaNames("table")).toEqual(["wake_up_occurrences", "wake_ups"]);
    expect(store.list()).toEqual([]);
  });
});

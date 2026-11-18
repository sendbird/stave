import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createPendingRun, createPendingRunStep } from "../../src/lib/runs/run-domain";
const directory = mkdtempSync(path.join(os.tmpdir(), "tars-notify-"));
const now = "2026-11-18T00:00:00.000Z";
const store = new SqliteStore({ dbPath: path.join(directory, "state.sqlite"), runMaintenance: false });
try {
  const row = store.tars.create({ requestId: "work", title: "Fix", instruction: "Fix search", acceptanceCriteria: ["Works"], repositoryPath: "/tmp/project", workspaceId: "source", providerId: "codex" }, now);
  store.tars.patch(row.id, row.revision, { taskId: "root", executionWorkspaceId: "execution", state: "running" }, now);
  const run = createPendingRun({ id: "delegation", kind: "delegated-task", origin: { kind: "task", id: "root" }, ownership: { repositoryPath: "/tmp/project", workspaceId: "child-ws", taskId: "child" }, policy: { maxAttempts: 1, timeoutMs: 1000, maxTurns: 1, maxOutputBytes: 1024, maxEvents: 100 }, provenance: { createdBy: "test", schemaVersion: 1, sourceVersion: "1" }, now });
  const step = createPendingRunStep({ id: "step", runId: run.id, kind: "delegated-task-turn", dependencyIds: [], inputHash: "a".repeat(64), now });
  store.claimRunStep({ run, step, executionId: "e", idempotencyKey: "claim", now });
  const notification = { id: "child-completion", kind: "task.turn_completed" as const, title: "Done", body: "Done", taskId: "child", workspaceId: "child-ws", createdAt: now, repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null, turnId: null, providerId: null, action: null, payload: {} };
  const quiet = store.createNotification({ notification }).notification!;
  assert.equal(quiet.payload.tarsManaged, true);
  assert.ok(quiet.readAt);
  assert.equal(store.createNotification({ notification }).inserted, false);
  const direct = store.createNotification({ notification: { ...notification, id: "approval", kind: "task.approval_requested" } }).notification!;
  assert.equal(direct.payload.tarsManaged, undefined);
  assert.equal(direct.readAt, null);
  store.close();
  const reopened = new SqliteStore({ dbPath: path.join(directory, "state.sqlite"), runMaintenance: false });
  assert.equal(reopened.listNotifications().find(row => row.id === quiet.id)?.payload.tarsManaged, true);
  reopened.close();
  console.log("Tars descendant notification ownership, direct approval, dedupe and reopen passed");
} finally { try { store.close(); } catch {} rmSync(directory, { recursive: true, force: true }); }

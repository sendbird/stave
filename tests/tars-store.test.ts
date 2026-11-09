import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsActInputSchema, TarsActionRecordSchema, TarsDecisionActionSchema } from "../src/lib/tars/conversation";
import {
  CreateTarsResponsibilityInputSchema,
  TarsResponsibilityPatchSchema,
  UpdateTarsIdentityInputSchema,
  type CreateTarsResponsibilityInput,
} from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
const LATER = "2026-11-05T00:01:00.000Z";
const input: CreateTarsResponsibilityInput = {
  requestId: "request-a",
  title: "Verify the search fix",
  instruction: "Own the search fix through verified local integration.",
  acceptanceCriteria: ["The failing search case passes after integration."],
  workspaceId: "workspace-a",
  repositoryPath: "/tmp/tars-project-a",
  providerId: "codex",
};

const databases: Database[] = [];
const directories: string[] = [];

function open(filename = ":memory:") {
  const database = new Database(filename);
  databases.push(database);
  return { database, store: new TarsStore(database) };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    try { database.close(); } catch { /* A restart test already closed this connection. */ }
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Tars durable responsibilities", () => {
  test("retains personal identity and execution ownership after a file-backed SQLite restart", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-tars-"));
    directories.push(directory);
    const filename = path.join(directory, "store.sqlite");
    const first = open(filename);
    first.store.updateIdentity({ name: "My Tars", instructions: "Repair local work; ask before publishing." }, NOW);
    const created = first.store.create(input, NOW);
    const running = first.store.patch(created.id, created.revision, {
      state: "running", taskId: "tars-task-a", executionWorkspaceId: "worktree-a", agentRunId: "run-a",
    }, LATER);
    first.database.close();

    const restarted = open(filename).store;
    expect(restarted.snapshot()).toEqual({
      followUps: [],
      identity: { id: "personal", name: "My Tars", instructions: "Repair local work; ask before publishing.", updatedAt: NOW },
      responsibilities: [running], pendingDecisions: [], runtime: "desktop",
    });
    expect(restarted.create(input, LATER)).toEqual(running);
    expect(restarted.snapshot().responsibilities).toHaveLength(1);
  });

  test("repeated admission is idempotent after normalization and refuses a changed mandate", () => {
    const { store } = open();
    const created = store.create(input, NOW);
    expect(store.create({ ...input, title: ` ${input.title} `, model: null, priority: 50, maxTurns: 30 }, LATER)).toEqual(created);
    expect(() => store.create({ ...input, repositoryPath: "/tmp/other-repository" }, LATER)).toThrow("different responsibility");
    expect(() => store.create({ ...input, instruction: "Publish the search fix." }, LATER)).toThrow("different responsibility");
    expect(store.snapshot().responsibilities).toHaveLength(1);
    expect(store.get(created.id)).toEqual(created);
  });

  test("accepted execution settings are immutable and part of request idempotency", () => {
    const { store } = open();
    const runtimeHints = { codexAccountProfileId: "123e4567-e89b-42d3-a456-426614174000", codexReasoningEffort: "high" as const };
    const created = store.create({ ...input, model: "gpt-6.1-sol", runtimeHints }, NOW);
    runtimeHints.codexAccountProfileId = "system-default";
    expect(store.get(created.id)?.runtimeHints?.codexAccountProfileId).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(() => store.create({ ...input, model: "gpt-6.1-sol", runtimeHints }, LATER)).toThrow("different responsibility");
    expect(store.create({ ...input, model: "gpt-6.1-sol", runtimeHints: created.runtimeHints }, LATER)).toEqual(created);
  });

  test("stale observations from another SQLite connection cannot undo a newer pause", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-tars-cas-"));
    directories.push(directory);
    const filename = path.join(directory, "store.sqlite");
    const first = open(filename).store;
    const second = open(filename).store;
    const created = first.create(input, NOW);
    const observed = second.get(created.id)!;
    const paused = first.patch(created.id, created.revision, { state: "paused", detail: "Paused by the user." }, LATER);
    expect(() => second.patch(observed.id, observed.revision, { state: "completed" }, LATER)).toThrow("changed");
    expect(second.get(created.id)).toEqual(paused);
    expect(paused.revision).toBe(created.revision + 1);
    expect(() => first.patch("missing", 1, { state: "running" }, LATER)).toThrow("not found");
  });

  test("queue order honors explicit priority before oldest-first order", () => {
    const { store } = open();
    const first = store.create(input, NOW);
    const urgent = store.create({ ...input, requestId: "urgent", priority: 100 }, LATER);
    const later = store.create({ ...input, requestId: "later" }, LATER);
    expect(store.snapshot().responsibilities.map((row) => row.id)).toEqual([urgent.id, first.id, later.id]);
    expect(() => store.patch(later.id, later.revision, { priority: 101 }, LATER)).toThrow();
    expect(store.get(later.id)?.priority).toBe(50);
  });

  test("strict schemas deny authority-bearing fields and malformed limits before persistence", () => {
    const { store } = open();
    for (const extra of [{ authorizedEffects: ["publish"] }, { taskId: "another-task" }, { state: "completed" }]) {
      expect(CreateTarsResponsibilityInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    for (const invalid of [{ providerId: "cursor" }, { acceptanceCriteria: [] }, { priority: -1 }, { maxTurns: 0 }, { maxTurns: 101 }]) {
      expect(() => store.create({ ...input, ...invalid } as never, NOW)).toThrow();
    }
    const act = { requestId: "click-a", responsibilityId: "a", expectedRevision: 1, operation: "resume", source: "click" };
    expect(TarsActInputSchema.safeParse(act).success).toBe(true);
    for (const invalid of [{ expectedRevision: 0 }, { operation: "publish" }, { source: "model" }, { priority: 90 }, { requestId: "bad id" }])
      expect(TarsActInputSchema.safeParse({ ...act, ...invalid }).success).toBe(false);
    const control = { kind: "control", responsibilityId: "a", expectedRevision: 1, operation: "takeover" };
    expect(TarsDecisionActionSchema.safeParse(control).success).toBe(true);
    expect(TarsDecisionActionSchema.safeParse({ ...control, operation: "publish" }).success).toBe(false);
    expect(TarsDecisionActionSchema.safeParse({ ...control, state: "running" }).success).toBe(false);
    const record = { requestId: "click-a", source: "click", requestHash: "d".repeat(64), action: control, status: "rejected",
      error: "Diagnostic", reason: "stale", revision: 2, createdAt: NOW, updatedAt: NOW };
    expect(TarsActionRecordSchema.safeParse(record).success).toBe(true);
    for (const invalid of [{ reason: "bogus" }, { reason: null }, { status: "applied", error: null }, { reason: "Refresh and try again" }])
      expect(TarsActionRecordSchema.safeParse({ ...record, ...invalid }).success).toBe(false);
    expect(UpdateTarsIdentityInputSchema.safeParse({ name: " ", instructions: "" }).success).toBe(false);
    expect(UpdateTarsIdentityInputSchema.safeParse({ name: "Tars", instructions: "", token: "forbidden" }).success).toBe(false);
    expect(TarsResponsibilityPatchSchema.safeParse({ workspaceId: "different-workspace" }).success).toBe(false);
    expect(TarsResponsibilityPatchSchema.safeParse({ repositoryPath: "/tmp/different" }).success).toBe(false);
    expect(store.snapshot().responsibilities).toEqual([]);
  });

  test("an unreadable saved responsibility fails visibly rather than disappearing from the portfolio", () => {
    const { database, store } = open();
    const created = store.create(input, NOW);
    database.prepare("UPDATE tars_responsibilities SET body_json = ? WHERE id = ?").run('{"id":"corrupt"}', created.id);
    expect(() => store.snapshot()).toThrow();
    expect(() => store.get(created.id)).toThrow();
  });
});

test("activity records only meaningful responsibility state/detail changes, in insertion order for equal timestamps", () => {
  const { store } = open();
  const first = store.create(input, NOW); store.create(input, NOW);
  expect(store.listActivity()).toHaveLength(1);
  const priority = store.patch(first.id, first.revision, { priority: 90 }, NOW);
  expect(store.listActivity()).toHaveLength(1);
  const running = store.patch(first.id, priority.revision, { state: "running", detail: "Checking the result" }, NOW);
  const unchanged = store.patch(first.id, running.revision, { state: "running", detail: "Checking the result" }, NOW);
  const blocked = store.patch(first.id, unchanged.revision, { detail: "Waiting for a decision" }, NOW);
  expect(store.listActivity().map((event) => event.revision)).toEqual([first.revision, running.revision, blocked.revision]);
  expect(store.listActivity(2).map((event) => event.detail)).toEqual(["Checking the result", "Waiting for a decision"]);
  for (const limit of [0, 1001, 1.5]) expect(() => store.listActivity(limit)).toThrow("limit");
});

test("journal insertion failure rolls back both responsibility creation and state changes", () => {
  const { database, store } = open();
  database.exec(`CREATE TRIGGER reject_journal BEFORE INSERT ON tars_activity
    BEGIN SELECT RAISE(ABORT, 'Journal unavailable'); END;`);
  expect(() => store.create(input, NOW)).toThrow("Journal unavailable");
  expect(store.snapshot().responsibilities).toEqual([]);
  database.exec("DROP TRIGGER reject_journal");
  const row = store.create(input, NOW);
  database.exec(`CREATE TRIGGER reject_journal BEFORE INSERT ON tars_activity
    BEGIN SELECT RAISE(ABORT, 'Journal unavailable'); END;`);
  expect(() => store.patch(row.id, row.revision, { state: "completed" }, LATER)).toThrow("Journal unavailable");
  expect(store.get(row.id)).toEqual(row); expect(store.listActivity()).toHaveLength(1);
});

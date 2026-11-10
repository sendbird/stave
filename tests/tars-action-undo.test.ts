import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { reprioritizeTars } from "../electron/host-service/tars-queue";
import { undoTarsAction } from "../electron/host-service/tars-action-undo";
import { canUndoTarsAction, TarsUndoActionInputSchema } from "../src/lib/tars/action-undo";
import { TarsActionRecordSchema, TarsUndoActionResultSchema, type TarsActionRecord } from "../src/lib/tars/conversation";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

const NOW = "2026-11-10T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const db = new Database(":memory:"); databases.push(db);
  const conversations = new TarsConversationStore(db), responsibilities = new TarsStore(db);
  let registry = [{ repositoryPath: "/tmp/repository", workspaces: [{ id: "source" }] }] as PersistenceRepositoryRegistryEntry[];
  let effects = 0;
  const runtime = createTarsRuntime({ store: responsibilities, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => { effects++; return "execution"; }, prepareTask: async () => {}, findRun: async () => null,
    startRun: async () => { effects++; return "run"; }, observe: async () => ({ state: "running", detail: null }),
    controlRun: async () => { effects++; } });
  runtime.stop();
  const ports = { conversations, responsibilities, now: () => NOW, readRegistry: () => registry,
    requestTick: () => runtime.requestTick(), serialize: runtime.serializeUndo };
  let sequence = 0;
  const create = (priority = 50) => responsibilities.create({ requestId: `work-${sequence++}`, title: "Work", instruction: "Verify.",
    acceptanceCriteria: ["Verified"], repositoryPath: "/tmp/repository", workspaceId: "source", providerId: "codex", priority },
    new Date(Date.parse(NOW) + sequence * 1000).toISOString());
  const move = async (id: string) => (await reprioritizeTars({ requestId: `move-${sequence++}`, responsibilityId: id,
    expectedRevision: responsibilities.get(id)!.revision, move: { direction: "later" }, source: "drag" }, ports)).record;
  const undo = (record: TarsActionRecord) => undoTarsAction({ requestId: record.requestId, expectedRevision: record.revision }, ports);
  return { db, conversations, responsibilities, runtime, ports, create, move, undo, effects: () => effects,
    removeScope: () => { registry = []; } };
}

describe("reversible action records", () => {
  test("restores every priority in a renumber, retains the original record and replays once after reopening stores", async () => {
    const f = fixture();
    const before = [f.create(), f.create(), f.create()];
    const moved = await f.move(before[0]!.id);
    expect(moved.undo?.kind).toBe("queue");
    if (moved.undo?.kind !== "queue") throw new Error("Missing snapshot");
    expect(moved.undo.priorities).toHaveLength(2);
    const result = await f.undo(moved);
    expect(result.refusal).toBeNull();
    expect(result.record).toMatchObject({ action: moved.action, status: "applied", undo: { undoneAt: NOW } });
    for (const row of before) expect(f.responsibilities.get(row.id)?.priority).toBe(row.priority);
    const saved = f.responsibilities.snapshot();
    const replay = await undoTarsAction({ requestId: moved.requestId, expectedRevision: moved.revision }, {
      ...f.ports, conversations: new TarsConversationStore(f.db), responsibilities: new TarsStore(f.db) });
    expect(replay).toEqual(result);
    expect(f.responsibilities.snapshot()).toEqual(saved);
    expect(f.conversations.listActions()).toHaveLength(1);
    expect(TarsUndoActionResultSchema.parse(result)).toEqual(result);
    expect(f.effects()).toBe(0);
  });

  test.each(["neighbor edit", "new work", "started", "record revision", "scope"])("refuses %s without overwriting any current work", async (change) => {
    const f = fixture(), a = f.create(80), b = f.create(60), c = f.create(40);
    const record = await f.move(a.id);
    if (change === "neighbor edit") f.responsibilities.patch(c.id, c.revision, { priority: 30 }, NOW);
    if (change === "new work") f.create();
    if (change === "started") {
      const row = f.responsibilities.get(b.id)!;
      f.responsibilities.patch(row.id, row.revision, { state: "preparing", taskId: "task" }, NOW);
    }
    if (change === "scope") f.removeScope();
    const saved = f.responsibilities.snapshot();
    const result = await f.undo(change === "record revision" ? { ...record, revision: record.revision + 1 } : record);
    expect(result.refusal).toBe(change === "scope" ? "outOfScope" : "stale");
    expect(f.responsibilities.snapshot()).toEqual(saved);
    expect(f.conversations.getAction(record.requestId)).toEqual(record);
  });

  test.each(["pause", "takeover"] as const)("restores unstarted %s with prior detail; concurrent retries apply once", async (operation) => {
    const f = fixture();
    let row = f.create();
    row = f.responsibilities.patch(row.id, row.revision, { detail: "Earlier detail", detailCode: "runPaused", detailParams: { reason: "user" } }, NOW);
    const record = (await actTars({ requestId: "control", responsibilityId: row.id, expectedRevision: row.revision, operation, source: "click" },
      { ...f.ports, runtime: f.runtime })).record;
    expect(record.undo).toMatchObject({ kind: "unstarted", detail: "Earlier detail", detailCode: "runPaused" });
    const [first, second] = await Promise.all([f.undo(record), f.undo(record)]);
    expect(first.refusal).toBeNull(); expect(second).toEqual(first);
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "queued", detail: row.detail, detailCode: row.detailCode,
      detailParams: row.detailParams, revision: row.revision + 2 });
    expect(f.effects()).toBe(0);
    // Restoring also releases the runtime hold, so normal scheduling can subsequently run the queued work.
    f.runtime.start(); await f.runtime.drain(); f.runtime.stop();
    expect(f.effects()).toBeGreaterThan(0);
  });

  test("a control admitted before Undo wins; Undo never overwrites its newer state", async () => {
    const f = fixture(), row = f.create();
    const paused = (await actTars({ requestId: "pause", responsibilityId: row.id, expectedRevision: row.revision, operation: "pause", source: "click" },
      { ...f.ports, runtime: f.runtime })).record;
    const taking = actTars({ requestId: "takeover", responsibilityId: row.id, expectedRevision: row.revision + 1, operation: "takeover", source: "click" }, { ...f.ports, runtime: f.runtime });
    const undo = f.undo(paused);
    await taking;
    expect((await undo).refusal).toBe("stale");
    expect(f.responsibilities.get(row.id)?.state).toBe("takenOver");
    expect(f.effects()).toBe(0);
  });

  test("record storage failure rolls back all restored priorities and is retryable", async () => {
    const f = fixture(), a = f.create(), b = f.create();
    const record = await f.move(a.id), saved = f.responsibilities.snapshot();
    f.db.exec(`CREATE TRIGGER refuse_undo BEFORE UPDATE ON tars_action_records
      WHEN json_extract(NEW.body_json, '$.undo.undoneAt') IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'disk write failed'); END;`);
    await expect(f.undo(record)).rejects.toThrow("disk write failed");
    expect(f.responsibilities.snapshot()).toEqual(saved);
    expect(f.conversations.getAction(record.requestId)).toEqual(record);
    f.db.exec("DROP TRIGGER refuse_undo");
    expect((await f.undo(record)).refusal).toBeNull();
    expect(f.responsibilities.get(b.id)?.priority).toBe(b.priority);
  });

  test("active run controls, historical records, pending/refused records and unknown ids have no Undo", async () => {
    const f = fixture(); let row = f.create();
    row = f.responsibilities.patch(row.id, row.revision, { state: "running", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run" }, NOW);
    const record = (await actTars({ requestId: "active", responsibilityId: row.id, expectedRevision: row.revision, operation: "pause", source: "click" },
      { ...f.ports, runtime: f.runtime })).record;
    expect(record.undo).toBeUndefined(); expect(canUndoTarsAction(record)).toBe(false);
    expect((await f.undo(record)).refusal).toBe("unsupported");
    expect((await undoTarsAction({ requestId: "missing", expectedRevision: 1 }, f.ports)).refusal).toBe("unsupported");
    expect(TarsUndoActionInputSchema.safeParse({ requestId: "active", expectedRevision: 1, priority: 50 }).success).toBe(false);
    const queued = f.create(), moved = await f.move(queued.id);
    const { undo: _snapshot, ...old } = moved;
    expect(canUndoTarsAction(old)).toBe(false);
    expect(TarsActionRecordSchema.safeParse({ ...moved, action: { ...record.action, operation: "startNow" } }).success).toBe(false);
    expect(TarsActionRecordSchema.safeParse({ ...moved, status: "pending" }).success).toBe(false);
  });
});

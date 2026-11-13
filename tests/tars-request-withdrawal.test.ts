import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { undoTarsAction } from "../electron/host-service/tars-action-undo";
import { TarsUndoActionInputSchema } from "../src/lib/tars/action-undo";
import { actTars } from "../electron/host-service/tars-control";
import { TarsRunRefusedError } from "../electron/host-service/tars-ownership";

const NOW = "2026-11-12T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); });
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "tars-withdraw-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  let latest: string | null = null, unreadable = false, busy = true, starts = 0, scopeMissing = false;
  const scopeChecks: string[] = [];
  let beforeStart: (() => Promise<void>) | undefined;
  let beforeReconcile: (() => Promise<void>) | undefined;
  let afterStart: (() => void) | undefined;
  function open() {
    const db = new Database(path.join(dir, "state.sqlite"));
    const store = new TarsStore(db), messages = new TarsConversationStore(db);
    const ports: TarsRuntimePorts = {
      store, messages, now: () => NOW,
      validateScope: async row => { scopeChecks.push(row.workspaceId); if (scopeMissing) throw new Error("Scope is gone"); }, prepareTask: async () => {}, prepareWorkspace: async () => "execution",
      findRun: async () => latest, startRun: async () => { throw new Error("Unexpected initial start"); },
      observe: async () => ({ state: "running", detail: null }), controlRun: async () => { throw new Error("Never cancel a run"); },
      respondTask: async () => "queued", deliverMessage: async () => "busy", hasUserTurn: () => false,
      reconcileContinuation: async () => { await beforeReconcile?.(); if (unreadable) throw new Error("Unreadable execution"); return latest; },
      continueWork: async (_row, _scope, assertAdmitted) => {
        await beforeStart?.();
        assertAdmitted?.();
        if (latest) return latest;
        if (busy) return "busy";
        latest = `new-run-${++starts}`;
        afterStart?.();
        return latest;
      },
    };
    const runtime = createTarsRuntime(ports);
    const close = () => { runtime.stop(); if (!db.closed) db.close(); };
    cleanup.push(close);
    return { db, store, messages, runtime, close };
  }
  let current = open();
  const created = current.store.create({ requestId: "original", title: "Original work", instruction: "Preserve original scope",
    // An implementation goal is reached by its verified result, so this work is completed rather than awaiting confirmation.
    acceptanceCriteria: ["Original result"], completionGoal: "implementation", workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  current.store.patch(created.id, created.revision, { state: "completed", agentRunId: "old-run", executionWorkspaceId: "execution", taskId: "task" }, NOW);
  const row = () => current.store.get(created.id)!;
  const tick = async () => { current.runtime.requestTick(); await current.runtime.drain(); };
  const queue = async (requestId: string) => {
    const result = await actTars({ requestId, responsibilityId: created.id, expectedRevision: row().revision,
      operation: "message", input: { text: `Follow-up ${requestId}` }, source: "click" },
      { conversations: current.messages, runtime: current.runtime, now: () => NOW });
    await current.runtime.drain(); return result.record;
  };
  const withdraw = (requestId: string, revision = current.messages.getAction(requestId)!.revision) =>
    undoTarsAction({ requestId, expectedRevision: revision }, { conversations: current.messages, responsibilities: current.store,
      readRegistry: () => [], serialize: current.runtime.serializeUndo, withdrawDelivery: current.runtime.withdrawDelivery });
  return { get current() { return current; }, row, queue, tick, withdraw, scopeChecks, starts: () => starts,
    free: () => { busy = false; }, unreadable: (value = true) => { unreadable = value; }, scopeMissing: () => { scopeMissing = true; },
    beforeStart: (fn: () => Promise<void>) => { beforeStart = fn; }, afterStart: (fn: () => void) => { afterStart = fn; },
    beforeReconcile: (fn: () => Promise<void>) => { beforeReconcile = fn; },
    restart: () => { current.close(); current = open(); } };
}

test("withdraws exactly one request durably, keeps completed work and text, and preserves the order of other requests", async () => {
  const f = fixture(), original = f.row();
  const first = await f.queue("first"), second = await f.queue("second"), third = await f.queue("third");
  expect((await f.withdraw(second.requestId)).refusal).toBeNull();
  expect((await f.withdraw(second.requestId, second.revision)).refusal).toBeNull();
  expect(f.row()).toMatchObject({ state: original.state, agentRunId: original.agentRunId, instruction: original.instruction, acceptanceCriteria: original.acceptanceCriteria, taskId: original.taskId, executionWorkspaceId: original.executionWorkspaceId });
  expect(f.current.messages.getAction(second.requestId)).toMatchObject({ action: second.action, delivery: { status: "withdrawn" } });
  expect(f.current.messages.listDeliveryHeads().map(record => record.requestId)).toEqual([first.requestId]);
  f.restart(); f.free(); await f.tick();
  expect(f.starts()).toBe(1);
  expect(f.current.messages.getAction(second.requestId)?.delivery?.status).toBe("withdrawn");
  expect(f.current.messages.listDeliveryHeads().map(record => record.requestId)).toEqual([third.requestId]);
});

test("withdrawal after a busy continuation and restart clears only its reservation and never starts it", async () => {
  const f = fixture(); const record = await f.queue("busy"); await f.tick();
  expect(f.row().continuation?.requestId).toBe(record.requestId);
  const original = f.row();
  f.restart(); expect((await f.withdraw(record.requestId)).refusal).toBeNull();
  expect(f.row()).toMatchObject({ state: "completed", agentRunId: "old-run", instruction: original.instruction, acceptanceCriteria: original.acceptanceCriteria, executionPending: false });
  f.restart(); f.free(); await f.tick(); await f.tick(); expect(f.starts()).toBe(0);
});

test("rejects stale and cross-responsibility identities without altering any pending request", async () => {
  const f = fixture(); const record = await f.queue("pending");
  expect((await f.withdraw(record.requestId, record.revision + 1)).refusal).toBe("stale");
  expect(TarsUndoActionInputSchema.safeParse({ requestId: record.requestId, expectedRevision: record.revision, responsibilityId: "other-work" }).success).toBe(false);
  expect((await undoTarsAction({ requestId: "other-work", expectedRevision: record.revision }, { conversations: f.current.messages,
    responsibilities: f.current.store, readRegistry: () => [], serialize: f.current.runtime.serializeUndo,
    withdrawDelivery: f.current.runtime.withdrawDelivery })).refusal).toBe("unsupported");
  expect(f.current.messages.getAction(record.requestId)).toEqual(record);
});

test.each([null, "paused", "takenOver", "cancelled"] as const)("uncertain acknowledgement reconciles the exact run and never cancels or resumes held work (%s)", async (held) => {
  const f = fixture(); const record = await f.queue("uncertain"); f.free();
  f.afterStart(() => { throw new Error("Lost start acknowledgement"); }); await f.tick();
  expect(f.row().executionPending).toBe(true);
  if (held) f.current.store.patch(f.row().id, f.row().revision, { state: held }, NOW);
  f.restart(); const result = await f.withdraw(record.requestId);
  expect(result.refusal).toBe("started");
  expect(f.row()).toMatchObject({ agentRunId: "new-run-1", state: held ?? "running", executionPending: false });
  expect(result.record.delivery).toMatchObject({ status: "delivered", agentRunId: "new-run-1" });
  expect(f.starts()).toBe(1);
});

test("unreadable reconciliation refuses withdrawal and preserves the pending reservation across restart", async () => {
  const f = fixture(); const record = await f.queue("unreadable"); f.free();
  f.afterStart(() => { throw new Error("Lost acknowledgement"); }); await f.tick(); f.unreadable(); f.restart();
  const original = f.row(), saved = f.current.messages.getAction(record.requestId);
  expect((await f.withdraw(record.requestId)).refusal).toBe("pending");
  expect(f.row()).toEqual(original);
  expect(f.current.messages.getAction(record.requestId)).toMatchObject({ action: saved!.action, delivery: { status: "queued", withdrawRequestedAt: NOW } });
  f.restart(); await f.tick(); expect(f.starts()).toBe(1);
  expect(f.current.messages.getAction(record.requestId)?.delivery?.status).toBe("queued");
  f.unreadable(false); await f.tick(); expect(f.starts()).toBe(1);
  expect(f.current.messages.getAction(record.requestId)?.delivery?.status).toBe("delivered");
});

test("withdrawal during host preflight prevents start at the final admission guard", async () => {
  const f = fixture(); const record = await f.queue("race"); f.free();
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.beforeStart(async () => { entered(); await gate; });
  const ticking = f.tick(); await ready;
  const withdrawing = f.withdraw(record.requestId); release();
  await ticking; expect((await withdrawing).refusal).toBeNull();
  f.restart(); await f.tick(); expect(f.starts()).toBe(0);
});

test("withdrawal during uncertain-start reconciliation settles as withdrawn rather than a failed request", async () => {
  const f = fixture(); const record = await f.queue("reconcile-race");
  f.current.store.patch(f.row().id, f.row().revision, { executionPending: true }, NOW);
  f.restart();
  f.beforeStart(async () => { throw new TarsRunRefusedError("Start refused"); });
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.beforeReconcile(async () => { entered(); await gate; });
  const ticking = f.tick(); await ready;
  const withdrawing = f.withdraw(record.requestId); release();
  await ticking; expect((await withdrawing).refusal).toBeNull();
  expect(f.current.messages.getAction(record.requestId)?.delivery?.status).toBe("withdrawn");
  f.restart(); f.free(); await f.tick(); expect(f.starts()).toBe(0);
});


test("an unreadable not-yet-started scope stays held across restart until read-only reconciliation permits withdrawal", async () => {
  const f = fixture(); const record = await f.queue("no-start"); await f.tick(); f.unreadable();
  expect((await f.withdraw(record.requestId)).refusal).toBe("pending");
  f.free(); f.restart(); await f.tick(); await f.tick();
  expect(f.starts()).toBe(0);
  expect(f.current.messages.getAction(record.requestId)?.delivery).toMatchObject({ status: "queued", withdrawRequestedAt: NOW });
  f.unreadable(false); await f.tick(); f.restart(); await f.tick();
  expect(f.starts()).toBe(0);
  expect(f.current.messages.getAction(record.requestId)).toMatchObject({ delivery: { status: "withdrawn" }, undo: { kind: "delivery", undoneAt: NOW } });
});

test("withdrawal uses the actual execution scope and refuses an unavailable scope before changing a request", async () => {
  const f = fixture(); const record = await f.queue("scope");
  const before = f.current.messages.getAction(record.requestId); f.scopeMissing();
  expect((await f.withdraw(record.requestId)).refusal).toBe("outOfScope");
  expect(f.current.messages.getAction(record.requestId)).toEqual(before);
  expect(f.scopeChecks.every(id => id === "execution")).toBe(true);
});

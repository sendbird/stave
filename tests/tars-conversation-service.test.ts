import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import type { TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { SETTINGS, testContext, REGISTRY } from "./tars-test-context";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import type { TarsMessageInput } from "../src/lib/tars/conversation";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

const NOW = "2026-11-05T00:00:00.000Z";
const action = { kind: "delegate" as const, workspaceId: "source", title: "Fix search", instruction: "Fix search", acceptanceCriteria: ["Search works"], priority: 50 };
const decision = { reply: "I propose a search fix.", actions: [action] };
const input = (requestId: string, overrides: Partial<TarsMessageInput> = {}): TarsMessageInput => ({
  requestId, text: "Fix search and verify it.", ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture(options: { configured?: boolean; filename?: string; answer?: (request: SecondaryProviderExecutionRequest) => Promise<string> } = {}) {
  const database = new Database(options.filename ?? ":memory:");
  cleanup.push(() => { if (!database.closed) database.close(); });
  const conversations = new TarsConversationStore(database);
  if (options.configured !== false && !conversations.getSettings()) conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const cancelled: string[] = [];
  let registry: PersistenceRepositoryRegistryEntry[] = REGISTRY;
  let ticks = 0;
  let applying = 0;
  const errors: unknown[] = [];
  const runControls: string[] = [];
  // The host runtime both message decisions and clicks reach; only the run port is simulated.
  const runtime = createTarsRuntime({ store: responsibilities, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { runControls.push(operation); } });
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      const text = await (options.answer?.(request) ?? Promise.resolve(JSON.stringify(decision)));
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
        status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2,
        outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async ({ executionId }) => {
      // Cancellation has to be persisted before this external port runs.
      expect(conversations.list(100).some((message) => message.state === "reasoning")).toBe(false);
      cancelled.push(executionId); return { ok: true };
    }, now: () => NOW,
  });
  const ports = { conversations, responsibilities, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities, registry),
    applyDecision: async (input: { messageId: string; expectedRevision: number }) => {
      applying++;
      return applyTarsDecision(input, { conversations, responsibilities,
        readRegistry: () => registry,
        requestTick: () => ticks++, control: runtime.act, now: () => NOW });
    }, onError: (error: unknown) => errors.push(error),
  };
  const service = createTarsConversationService(ports);
  return { database, conversations, responsibilities, ledger, requests, cancelled, ports, service, errors, runtime, runControls,
    unregister: () => { registry = []; }, ticks: () => ticks, applying: () => applying };
}

function savedProposal(f: ReturnType<typeof fixture>, requestId: string) {
  const queued = f.conversations.create(input(requestId), NOW);
  const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
  return f.conversations.answer(claimed.id, claimed.revision, decision, NOW);
}

test("resident service serializes queued messages, persists before provider dispatch and applies exactly once", async () => {
  const entered = deferred<void>(); const release = deferred<string>();
  let concurrent = 0; let maxConcurrent = 0;
  const f = fixture({ answer: async () => {
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); entered.resolve();
    const text = await release.promise; concurrent--; return text;
  } });
  f.service.start();
  const first = f.service.sendMessage(input("first"));
  const duplicate = f.service.sendMessage(input("first"));
  const second = f.service.sendMessage(input("second"));
  expect(duplicate.id).toBe(first.id);
  await entered.promise;
  expect(f.conversations.get(first.id)?.state).toBe("reasoning");
  expect(f.conversations.get(second.id)?.state).toBe("queued");
  expect(f.requests[0]?.input.toolsDisabled).toBe(true);
  release.resolve(JSON.stringify(decision)); await f.service.whenIdle();
  expect(maxConcurrent).toBe(1);
  expect(f.requests).toHaveLength(2);
  expect(f.requests.map((r) => r.runId)).toEqual([`tars-message:${first.id}`, `tars-message:${second.id}`]);
  expect(f.responsibilities.snapshot().responsibilities).toHaveLength(2);
  expect(f.service.sendMessage(input("first")).state).toBe("answered");
  await f.service.whenIdle();
  expect(f.requests).toHaveLength(2); expect(f.applying()).toBe(2); expect(f.ticks()).toBe(2);
  expect(f.errors).toEqual([]);
  await f.service.stop();
});

test("restart fails interrupted reasoning once but drives old queued work outside the recent history window", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-service-")); cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "messages.sqlite");
  const before = fixture({ filename });
  const interrupted = before.conversations.create(input("interrupted"), NOW);
  before.conversations.claim(interrupted.id, interrupted.revision, NOW);
  const oldest = before.conversations.create(input("oldest"), NOW);
  for (let i = 0; i < 120; i++) {
    const row = before.conversations.create(input(`history-${i}`), NOW);
    before.conversations.fail(row.id, row.revision, "Older failed request", NOW);
  }
  before.database.close();
  const f = fixture({ filename }); f.service.start(); await f.service.whenIdle();
  expect(f.requests.map((request) => request.runId)).toEqual([`tars-message:${oldest.id}`]);
  expect(f.conversations.get(interrupted.id)?.state).toBe("failed");
  const revision = f.conversations.get(interrupted.id)?.revision;
  f.service.start(); expect(f.conversations.get(interrupted.id)?.revision).toBe(revision);
  expect(f.conversations.get(oldest.id)?.state).toBe("answered");
  expect(f.service.getConversation({ limit: 5 }).messages).toHaveLength(5);
  expect(f.errors).toEqual([]); await f.service.stop();
});

test.each([false, true])("restart applies a saved proposal outside recent history without a model call (pending receipt: %s)", async (existingReceipt) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-proposal-")); cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "messages.sqlite");
  const before = fixture({ filename });
  const message = savedProposal(before, "proposal");
  if (existingReceipt) before.conversations.recordReceipt(message.id, message.revision, 0, action, NOW);
  for (let i = 0; i < 120; i++) {
    const row = before.conversations.create(input(`history-${i}`), NOW);
    before.conversations.cancel(row.id, row.revision, NOW);
  }
  before.database.close();
  const f = fixture({ filename }); f.service.start(); await f.service.whenIdle();
  expect(f.requests).toEqual([]);
  expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  expect(f.conversations.listReceipts(message.id)[0]?.status).toBe("applied");
  await f.service.stop();
  const again = fixture({ filename }); again.service.start(); await again.service.whenIdle();
  expect(again.applying()).toBe(0); expect(again.requests).toEqual([]);
  expect(again.responsibilities.snapshot().responsibilities).toHaveLength(1);
  await again.service.stop();
});

test("cancel persists before abort and a late model result cannot overwrite it or create work", async () => {
  const entered = deferred<void>(); const release = deferred<string>();
  const f = fixture({ answer: async () => { entered.resolve(); return release.promise; } });
  f.service.start(); const message = f.service.sendMessage(input("cancel")); await entered.promise;
  const current = f.conversations.get(message.id)!;
  await expect(f.service.cancelMessage({ messageId: current.id, expectedRevision: current.revision - 1 })).rejects.toThrow("changed");
  await f.service.cancelMessage({ messageId: current.id, expectedRevision: current.revision });
  expect(f.cancelled).toHaveLength(1);
  release.resolve(JSON.stringify(decision)); await f.service.whenIdle();
  expect(f.conversations.get(message.id)).toMatchObject({ state: "cancelled", decision: null });
  expect(f.applying()).toBe(0); expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  await f.service.stop();
});

test("shutdown stops scheduling and aborts only its active execution; unsent queued work remains durable", async () => {
  const entered = deferred<void>(); const release = deferred<string>();
  const f = fixture({ answer: async () => { entered.resolve(); return release.promise; } });
  f.service.start(); const first = f.service.sendMessage(input("active"));
  const queued = f.service.sendMessage(input("queued")); await entered.promise;
  await f.service.stop(); expect(f.cancelled).toHaveLength(1);
  expect(f.conversations.get(first.id)?.state).toBe("cancelled");
  release.resolve(JSON.stringify(decision)); await f.service.whenIdle();
  expect(f.requests).toHaveLength(1); expect(f.conversations.get(queued.id)?.state).toBe("queued");
  expect(() => f.service.sendMessage(input("after-stop"))).toThrow("unavailable");
  expect(f.errors).toEqual([]);
});

test("discussion never calls action admission and idle/read/start alone never bills a model", async () => {
  const f = fixture({ answer: async () => JSON.stringify({ reply: "Let's discuss.", actions: [] }) });
  f.service.start(); f.service.getConversation(); await f.service.whenIdle();
  expect(f.requests).toEqual([]);
  f.service.sendMessage(input("discussion", { text: "How are you?" })); await f.service.whenIdle();
  expect(f.applying()).toBe(0); expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  expect(f.service.getConversation().messages[0]?.state).toBe("answered");
  await f.service.stop();
});

test("target registration is rechecked at admission after asynchronous reasoning context", async () => {
  const f = fixture();
  const service = createTarsConversationService({ ...f.ports, context: async () => {
    const context = await f.ports.context(); f.unregister(); return context;
  } });
  service.start(); const message = service.sendMessage(input("revoked")); await service.whenIdle();
  expect(f.requests).toHaveLength(1);
  expect(f.conversations.get(message.id)?.state).toBe("answered");
  expect(f.conversations.listReceipts(message.id)[0]?.status).toBe("rejected");
  expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  await service.stop();
});

test("a permanent saved-proposal scope failure settles visibly instead of endlessly retrying", async () => {
  const f = fixture(); const message = savedProposal(f, "revoked-proposal"); f.unregister();
  f.service.start(); await f.service.whenIdle();
  expect(f.conversations.listReceipts(message.id)[0]).toMatchObject({ status: "rejected", responsibilityId: null });
  expect(f.conversations.listPendingActions()).toEqual([]); expect(f.requests).toEqual([]);
  expect(f.responsibilities.snapshot().responsibilities).toEqual([]); expect(f.errors).toEqual([]);
  f.service.getConversation(); await f.service.whenIdle(); expect(f.applying()).toBe(1);
  await f.service.stop();
});

test("admission caps new outstanding messages while preserving retries and excludes settled history", async () => {
  const f = fixture(); f.service.start();
  const first = f.service.sendMessage(input("cap-0"));
  for (let i = 1; i < 32; i++) f.service.sendMessage(input(`cap-${i}`));
  expect(() => f.service.sendMessage(input("cap-32"))).toThrow("Too many outstanding");
  expect(f.service.sendMessage(input("cap-0")).id).toBe(first.id);
  expect(() => f.service.sendMessage(input("cap-0", { text: "Different request" }))).toThrow("different message");
  await f.service.cancelMessage({ messageId: first.id, expectedRevision: first.revision });
  f.service.sendMessage(input("cap-replacement"));
  await f.service.whenIdle();
  expect(f.requests).toHaveLength(32);
  expect(f.conversations.listQueued()).toEqual([]); await f.service.stop();
});

test("saved local effects survive a lost host acknowledgement and are never replayed", async () => {
  const f = fixture(); const message = savedProposal(f, "lost-ack");
  const service = createTarsConversationService({ ...f.ports, applyDecision: async (input) => {
    await f.ports.applyDecision(input); throw new Error("Lost acknowledgement");
  } });
  service.start(); await service.whenIdle();
  expect(f.conversations.listReceipts(message.id)[0]?.status).toBe("applied");
  expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  expect(f.applying()).toBe(1); expect(f.requests).toEqual([]); await service.stop();
});

test("incomplete host admission rejects remaining actions atomically and leaves committed actions alone", async () => {
  const f = fixture();
  const queued = f.conversations.create(input("partial"), NOW);
  const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
  const message = f.conversations.answer(claimed.id, claimed.revision, { ...decision,
    actions: [action, { ...action, title: "Second unit" }] }, NOW);
  const intent = f.conversations.recordReceipt(message.id, message.revision, 0, action, NOW);
  f.conversations.applyReceipt(message.id, 0, intent.revision, () => ({ responsibilityId: "committed" }), NOW);
  const service = createTarsConversationService({ ...f.ports, applyDecision: async () => [] });
  service.start(); await service.whenIdle();
  expect(f.conversations.listReceipts(message.id).map((receipt) => receipt.status)).toEqual(["applied", "rejected"]);
  expect(f.conversations.listPendingActions()).toEqual([]);
  expect(f.requests).toEqual([]); expect(f.errors).toEqual([]); await service.stop();
});

test("saved proposals count toward admission capacity and retries remain available", async () => {
  const f = fixture(); const first = savedProposal(f, "proposal-0");
  for (let i = 1; i < 32; i++) savedProposal(f, `proposal-${i}`);
  f.service.start();
  expect(() => f.service.sendMessage(input("overflow"))).toThrow("Too many outstanding");
  expect(f.service.sendMessage(input("proposal-0")).id).toBe(first.id);
  await f.service.whenIdle();
  expect(f.responsibilities.snapshot().responsibilities).toHaveLength(32);
  expect(f.requests).toEqual([]); expect(f.errors).toEqual([]); await f.service.stop();
});

test("global conversation works with zero registered repositories and no workspace or mode", async () => {
  const f = fixture({ answer: async () => JSON.stringify({ reply: "Hello. What would you like to discuss?", actions: [] }) });
  f.unregister(); f.service.start();
  const message = f.service.sendMessage({ requestId: "global", text: "안녕, 생각을 정리해 보자." });
  await f.service.whenIdle();
  expect(f.conversations.get(message.id)?.state).toBe("answered");
  expect(f.requests[0]?.input.cwd).toBe("/tmp/profile/representative");
  expect(f.requests[0]?.input.toolsDisabled).toBe(true);
  expect(f.applying()).toBe(0);
  expect(f.service.getConversation()).toMatchObject({ settings: SETTINGS, receipts: [], activity: [] });
  expect(f.errors).toEqual([]); await f.service.stop();
});

test("unconfigured send requires settings once and queued records preserve their selected account and model after settings change", async () => {
  const entered = deferred<void>(); const release = deferred<string>();
  const f = fixture({ configured: false, answer: async () => { entered.resolve(); return release.promise; } });
  f.service.start(); expect(f.service.getConversation().settings).toBeNull();
  expect(() => f.service.sendMessage(input("first"))).toThrow("Configure the representative model, account and turn limit");
  expect(f.conversations.list()).toEqual([]);
  const firstSettings = { providerId: "codex" as const, model: "selected-first", maxTurns: 9,
    runtimeHints: { codexAccountProfileId: "123e4567-e89b-42d3-a456-426614174000", codexReasoningEffort: "high" as const } };
  f.service.configureConversation(firstSettings);
  const first = f.service.sendMessage(input("first"));
  const queued = f.service.sendMessage(input("queued-before-settings-change"));
  await entered.promise;
  const nextSettings = { providerId: "claude-code" as const, model: "selected-next", maxTurns: 3,
    runtimeHints: { claudeAccountProfileId: "system-default", claudeEffort: "low" as const } };
  f.service.configureConversation(nextSettings);
  const next = f.service.sendMessage(input("next"));
  expect(f.service.sendMessage(input("first")).id).toBe(first.id);
  release.resolve(JSON.stringify(decision)); await f.service.whenIdle();
  for (const id of [first.id, queued.id]) expect(f.conversations.get(id)).toMatchObject(firstSettings);
  expect(f.conversations.get(next.id)).toMatchObject(nextSettings);
  expect(f.requests.map((request) => request.input.model)).toEqual(["selected-first", "selected-first", "selected-next"]);
  expect(f.requests.map((request) => request.input.runtimeHints)).toEqual([firstSettings.runtimeHints, firstSettings.runtimeHints, nextSettings.runtimeHints]);
  for (const row of f.responsibilities.snapshot().responsibilities) {
    const original = f.conversations.list().find((message) => row.requestId === `tars-message:${message.id}:0`)!;
    // The conversation model reasons; without an execution pin the work routes automatically.
    expect(row).toMatchObject({ providerId: original.providerId, model: null, runtimeHints: original.runtimeHints, maxTurns: original.maxTurns });
  }
  expect(f.errors).toEqual([]); await f.service.stop();
});

test("settings, history and progress activity survive a restart and reads never re-journal or bill", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-global-")); cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "messages.sqlite");
  const first = fixture({ filename }); first.service.start();
  const settings = { ...SETTINGS, maxTurns: 7, runtimeHints: { codexReasoningEffort: "high" as const } };
  first.service.configureConversation(settings);
  const message = first.service.sendMessage({ requestId: "persisted-global", text: "Fix search in the Source workspace." });
  await first.service.whenIdle();
  const row = first.responsibilities.snapshot().responsibilities[0]!;
  const running = first.responsibilities.patch(row.id, row.revision, { state: "running", detail: "Executing the admitted goal" }, NOW);
  first.responsibilities.patch(running.id, running.revision, { state: "running", detail: running.detail }, NOW);
  const before = first.service.getConversation(); expect(before.activity).toHaveLength(2);
  expect(before.messages[0]?.id).toBe(message.id);
  await first.service.stop(); first.database.close();
  const restarted = fixture({ filename }); restarted.service.start(); await restarted.service.whenIdle();
  expect(restarted.service.getConversation()).toEqual(before);
  expect(restarted.service.getConversation({ activityLimit: 1 }).activity).toEqual(before.activity.slice(-1));
  expect(restarted.requests).toEqual([]); expect(restarted.applying()).toBe(0);
  expect(restarted.service.getConversation()).toEqual(before);
  await restarted.service.stop();
});

async function eventually(check: () => boolean) {
  for (let attempt = 0; attempt < 200 && !check(); attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(check()).toBe(true);
}
const busy = () => Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });

test("a host lock failure keeps a saved proposal pending and retries it instead of rejecting it", async () => {
  const f = fixture(); const message = savedProposal(f, "busy-host");
  let failures = 1;
  const conversations = Object.create(f.conversations) as TarsDecisionPorts["conversations"];
  conversations.applyReceipt = (...args) => {
    if (failures-- > 0) throw busy();
    return f.conversations.applyReceipt(...args);
  };
  const service = createTarsConversationService({ ...f.ports, retryDelaysMs: [0], applyDecision: async (input) => {
    try {
      return await applyTarsDecision(input, { conversations, responsibilities: f.responsibilities,
        readRegistry: () => REGISTRY, requestTick() {}, now: () => NOW });
    } catch (error) {
      // The host-service boundary carries only the message.
      throw new Error(`[host-service] tars.apply-decision failed: ${(error as Error).message}`);
    }
  } });
  service.start(); await service.whenIdle();
  expect(f.conversations.listReceipts(message.id).map((receipt) => receipt.status)).toEqual(["pending"]);
  await eventually(() => f.conversations.listReceipts(message.id)[0]?.status === "applied");
  await service.whenIdle();
  expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  expect(f.errors).toHaveLength(1); expect(f.requests).toEqual([]);
  await service.stop();
});

test("a claim lock failure keeps the message queued and the service reschedules it a bounded number of times", async () => {
  const f = fixture();
  const claim = f.conversations.claim.bind(f.conversations);
  let failures = 1;
  f.conversations.claim = (...args) => { if (failures-- > 0) throw busy(); return claim(...args); };
  const service = createTarsConversationService({ ...f.ports, retryDelaysMs: [0] });
  service.start(); const message = service.sendMessage(input("busy-claim")); await service.whenIdle();
  expect(f.conversations.get(message.id)?.state).toBe("queued");
  await eventually(() => f.conversations.get(message.id)?.state === "answered");
  expect(f.requests).toHaveLength(1); expect(f.errors).toHaveLength(1);

  // Retries stop once the delays are spent; the work stays saved for the next send or restart.
  failures = 3;
  const stuck = service.sendMessage(input("still-busy")); await service.whenIdle();
  await new Promise((resolve) => setTimeout(resolve, 20)); await service.whenIdle();
  expect(f.conversations.get(stuck.id)?.state).toBe("queued");
  expect(f.errors).toHaveLength(3);
  await service.stop();
});

test("a message-originated control is admitted through the same host path as a click", async () => {
  let reply = "";
  const f = fixture({ answer: async () => reply });
  f.conversations.configure({ ...SETTINGS, autonomy: "careful" });
  const created = f.responsibilities.create({ requestId: "owned", title: "Fix search", instruction: "Fix search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  const row = f.responsibilities.patch(created.id, created.revision, { state: "running", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run" }, NOW);
  f.service.start();
  reply = JSON.stringify({ reply: "I will stop it.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "takeover" }] });
  const spoken = f.service.sendMessage(input("take-it", { text: "내가 할게" }));
  await f.service.whenIdle(); await f.runtime.drain();
  // The planner was told the control vocabulary; the saved proposal was admitted by the runtime, not applied directly.
  expect(f.requests[0]?.input.prompt).toContain("kind:'control'");
  expect(f.conversations.listReceipts(spoken.id)).toMatchObject([{ status: "applied", responsibilityId: row.id }]);
  expect(f.responsibilities.get(row.id)).toMatchObject({ state: "takenOver", revision: row.revision + 1 });
  // Words cannot resume work the user took over; the same rule refuses it as for a click.
  reply = JSON.stringify({ reply: "Resuming.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision + 1, operation: "resume" }] });
  const resume = f.service.sendMessage(input("resume-it", { text: "계속해" }));
  await f.service.whenIdle();
  const click = await actTars({ requestId: "click-resume", responsibilityId: row.id, expectedRevision: row.revision + 1, operation: "resume", source: "click" },
    { conversations: f.conversations, runtime: f.runtime, now: () => NOW });
  expect(f.conversations.listReceipts(resume.id)[0]).toMatchObject({ status: "rejected", error: click.record.error });
  expect(click.record.status).toBe("rejected");
  expect(f.runControls).toEqual(["takeover"]);
  // The timeline carries the click as a record, separate from user messages.
  const conversation = f.service.getConversation();
  expect(conversation.records.map((record) => record.requestId)).toEqual([`auto:${spoken.id}:0`, "click-resume"]);
  expect(conversation.messages.map((message) => message.text)).toEqual(["내가 할게", "계속해"]);
  expect(f.errors).toEqual([]);
  await f.service.stop(); f.runtime.stop();
});

test("a control whose host delivery times out stays pending and settles with its run effect, never split", async () => {
  const gate = deferred<void>(); const entered = deferred<void>();
  let reply = "";
  const f = fixture({ answer: async () => reply });
  const runControls: string[] = [];
  // The host is still controlling the run when main's delivery fails.
  const host = createTarsRuntime({ store: f.responsibilities, now: () => NOW, validateScope: async () => {}, prepareWorkspace: async () => "execution",
    prepareTask: async () => {}, findRun: async () => null, startRun: async () => "run", observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { entered.resolve(); await gate.promise; runControls.push(operation); } });
  const hostApply = (input: { messageId: string; expectedRevision: number }) => applyTarsDecision(input, { conversations: f.conversations,
    responsibilities: f.responsibilities, readRegistry: () => REGISTRY, requestTick: () => {}, control: host.act, now: () => NOW });
  let deliveries = 0; let inFlight: Promise<unknown> | null = null;
  const service = createTarsConversationService({ ...f.ports, retryDelaysMs: [1, 1, 1], applyDecision: async (input) => {
    deliveries++;
    if (deliveries === 1) { inFlight = hostApply(input); await entered.promise; throw new Error("Host request timed out."); }
    return hostApply(input);
  } });
  const created = f.responsibilities.create({ requestId: "owned", title: "Fix search", instruction: "Fix search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  const row = f.responsibilities.patch(created.id, created.revision, { state: "running", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run" }, NOW);
  reply = JSON.stringify({ reply: "Pausing it.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "pause" }] });
  service.start();
  const message = service.sendMessage(input("pause-it", { text: "멈춰" }));
  await entered.promise; await service.whenIdle();
  // Main did not settle an outcome it cannot know.
  expect(f.conversations.listReceipts(message.id)[0]?.status).toBe("pending");
  gate.resolve(); await inFlight; await host.drain();
  expect(f.conversations.listReceipts(message.id)[0]).toMatchObject({ status: "applied", responsibilityId: row.id });
  expect(f.responsibilities.get(row.id)?.state).toBe("paused");
  await new Promise((resolve) => setTimeout(resolve, 20)); await service.whenIdle();
  expect(runControls).toEqual(["pause"]);
  expect(f.responsibilities.get(row.id)?.revision).toBe(row.revision + 1);
  await service.stop(); host.stop();
});

test("Tars controls and decisions share one unbounded host request policy", async () => {
  const { resolveHostServiceRequestTimeoutMs } = await import("../electron/main/host-service-request-timeouts");
  for (const method of ["tars.invoke", "tars.act", "tars.apply-decision"] as const)
    expect(resolveHostServiceRequestTimeoutMs({ method })).toBeNull();
});

test("an unresolved control delivery keeps retrying past the backoff steps, then the queue resumes in order", async () => {
  let reply = "";
  const f = fixture({ answer: async () => reply });
  const host = createTarsRuntime({ store: f.responsibilities, now: () => NOW, validateScope: async () => {}, prepareWorkspace: async () => "execution",
    prepareTask: async () => {}, findRun: async () => null, startRun: async () => "run", observe: async () => ({ state: "running", detail: null }),
    controlRun: async () => {} });
  let hostDown = 6; let deliveries = 0;
  const service = createTarsConversationService({ ...f.ports, retryDelaysMs: [1, 1, 1], applyDecision: async (input) => {
    deliveries++;
    if (hostDown-- > 0) throw new Error("Host is restarting.");
    return applyTarsDecision(input, { conversations: f.conversations, responsibilities: f.responsibilities, readRegistry: () => REGISTRY,
      requestTick: () => {}, control: host.act, now: () => NOW });
  } });
  const created = f.responsibilities.create({ requestId: "owned", title: "Fix search", instruction: "Fix search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  const row = f.responsibilities.patch(created.id, created.revision, { state: "running", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run" }, NOW);
  reply = JSON.stringify({ reply: "Pausing it.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "pause" }] });
  service.start();
  const control = service.sendMessage(input("pause-it", { text: "멈춰" }));
  for (let waited = 0; waited < 200 && f.conversations.get(control.id)?.state !== "answered"; waited++) await new Promise((resolve) => setTimeout(resolve, 2));
  // A later ordinary message waits behind the unresolved control, then runs without another send.
  reply = JSON.stringify({ reply: "Here is the status.", actions: [] });
  const later = service.sendMessage(input("status", { text: "How is it going?" }));
  for (let waited = 0; waited < 200 && f.conversations.get(later.id)?.state !== "answered"; waited++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(deliveries).toBeGreaterThan(4);
  expect(f.conversations.listReceipts(control.id)[0]).toMatchObject({ status: "applied" });
  expect(f.responsibilities.get(row.id)?.state).toBe("paused");
  expect(f.conversations.get(later.id)?.state).toBe("answered");
  await service.stop(); host.stop();
});

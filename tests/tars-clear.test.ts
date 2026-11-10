import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { buildTarsPlannerPrompt, parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { REGISTRY, SETTINGS, testContext } from "./tars-test-context";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import { TarsActionReceiptSchema, type TarsDecision } from "../src/lib/tars/conversation";
import {
  TarsClearInputSchema, TarsClearRecordSchema, TarsViewSettingsSchema, tarsClearProposalRequestId,
} from "../src/lib/tars/clearing";
import type { CreateTarsResponsibilityInput, TarsResponsibilityPatch } from "../src/lib/tars/types";

const T0 = Date.parse("2026-11-05T00:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const DAY = 86_400;
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function database(filename = ":memory:") {
  const db = new Database(filename);
  cleanup.push(() => { if (!db.closed) db.close(); });
  return db;
}
function persisted() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-clear-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "store.sqlite");
}
const unit = (id: string): CreateTarsResponsibilityInput => ({ requestId: `request-${id}`, title: `Work ${id}`, instruction: "Do the work.",
  acceptanceCriteria: ["It works."], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" });
/** A responsibility moved to `state` (and anything else in `patch`) at `when`. */
function row(store: TarsStore, id: string, patch: TarsResponsibilityPatch, when: string) {
  const created = store.create(unit(id), when);
  return store.patch(created.id, created.revision, patch, when);
}
const publication = (state: "committing" | "failed" | "opened") => ({ state, failedStep: state === "failed" ? "push" as const : null, commit: null,
  branch: "tars/work", base: "main", commitMessage: "fix: work", title: "fix: work", url: state === "opened" ? "https://example.com/pr/1" : null,
  number: state === "opened" ? 1 : null, error: state === "failed" ? "Push failed." : null, reason: state === "failed" ? "publishFailed" as const : null, updatedAt: at(0) });

describe("tray clears", () => {
  test("hide only ended work, never running, waiting or blocked work, nor work whose draft PR is unfinished or awaits confirmation", () => {
    const db = database();
    const conversations = new TarsConversationStore(db);
    conversations.configure(SETTINGS);
    const store = new TarsStore(db, { now: () => at(60) });
    const running = row(store, "running", { state: "running" }, at(1));
    const waiting = row(store, "waiting", { state: "waiting" }, at(1));
    const blocked = row(store, "blocked", { state: "blocked" }, at(1));
    const done = row(store, "done", { state: "completed" }, at(1));
    const cancelled = row(store, "cancelled", { state: "cancelled" }, at(1));
    const publishing = row(store, "publishing", { state: "completed", publication: publication("committing") }, at(1));
    const retry = row(store, "retry", { state: "completed", publication: publication("failed") }, at(1));
    const opened = row(store, "opened", { state: "completed", publication: publication("opened") }, at(1));
    const proposed = row(store, "proposed", { state: "completed" }, at(1));
    // Tars proposed a draft PR for this one; its card still waits for the user.
    const message = conversations.create({ requestId: "publish-words", text: "Open a PR for it." }, at(2));
    const claimed = conversations.claim(message.id, message.revision, at(2));
    const answered = conversations.answer(message.id, claimed.revision, { reply: "Confirm on the card.", actions: [{ kind: "publish", responsibilityId: proposed.id, expectedRevision: proposed.revision }] }, at(3));
    const receipt = conversations.recordReceipt(answered.id, answered.revision, 0, answered.decision!.actions[0]!, at(3));
    conversations.settleReceipt(answered.id, 0, receipt.revision, { status: "proposed" }, at(3));

    const record = store.view.clear({ requestId: "clear-1", scopes: ["outputs", "done"], source: "click" }, { responsibilities: store.snapshot().responsibilities, now: at(10) });
    const ended = [done.id, cancelled.id, opened.id].sort();
    expect(record.scopes).toEqual(["done", "outputs"]);
    expect([...record.done!].sort()).toEqual(ended);
    expect([...record.outputs!].sort()).toEqual(ended);
    expect(record.hiddenMessages).toBeUndefined();
    const cleared = store.snapshot().cleared!;
    expect([...cleared.done].sort()).toEqual(ended);
    for (const kept of [running, waiting, blocked, publishing, retry, proposed]) {
      expect(cleared.done).not.toContain(kept.id);
      expect(cleared.outputs).not.toContain(kept.id);
    }
    // The work itself is untouched: same revisions, nothing deleted.
    expect(store.snapshot().responsibilities).toHaveLength(9);
    expect(store.get(done.id)?.revision).toBe(done.revision);
  });

  test("survive a restart, are idempotent by request id and are restored by undo", () => {
    const filename = persisted();
    const first = new TarsStore(database(filename), { now: () => at(60) });
    const done = row(first, "done", { state: "completed" }, at(1));
    const input = { requestId: "clear-done", scopes: ["done" as const], source: "click" as const };
    const record = first.view.clear(input, { responsibilities: first.snapshot().responsibilities, now: at(10) });
    expect(first.view.clear(input, { responsibilities: first.snapshot().responsibilities, now: at(20) })).toEqual(record);
    expect(() => first.view.clear({ ...input, scopes: ["outputs"] }, { responsibilities: [], now: at(20) })).toThrow("different clear");

    const restarted = new TarsStore(database(filename), { now: () => at(60) });
    expect(restarted.snapshot().cleared).toEqual({ done: [done.id], outputs: [] });
    const undone = restarted.view.undo("clear-done", at(30));
    expect(undone.status).toBe("undone");
    expect(restarted.snapshot().cleared).toEqual({ done: [], outputs: [] });
    // A repeated undo, and a replay of the original clear, change nothing.
    expect(restarted.view.undo("clear-done", at(40))).toEqual(undone);
    expect(restarted.view.clear(input, { responsibilities: restarted.snapshot().responsibilities, now: at(50) })).toEqual(undone);
    expect(restarted.snapshot().cleared).toEqual({ done: [], outputs: [] });
    expect(() => restarted.view.undo("missing", at(50))).toThrow("not found");
  });

  test("an undo restores only what its own clear hid", () => {
    const store = new TarsStore(database(), { now: () => at(60) });
    const a = row(store, "a", { state: "completed" }, at(1));
    store.view.clear({ requestId: "first", scopes: ["done"], source: "click" }, { responsibilities: store.snapshot().responsibilities, now: at(2) });
    const b = row(store, "b", { state: "cancelled" }, at(3));
    const second = store.view.clear({ requestId: "second", scopes: ["done"], source: "click" }, { responsibilities: store.snapshot().responsibilities, now: at(4) });
    expect(second.done).toEqual([b.id]);
    store.view.undo("first", at(5));
    expect(store.snapshot().cleared?.done).toEqual([b.id]);
    expect(store.snapshot().cleared?.done).not.toContain(a.id);
  });
});

describe("retention", () => {
  test("hides ended work once it is older than the chosen days, judged on every read, and Never shows it again", () => {
    let now = at(6 * DAY);
    const store = new TarsStore(database(), { now: () => now });
    const done = row(store, "done", { state: "completed" }, at(0));
    const running = row(store, "running", { state: "running" }, at(0));
    const retry = row(store, "retry", { state: "completed", publication: publication("failed") }, at(0));
    expect(store.view.getSettings()).toEqual({ retentionDays: 7 });
    expect(store.snapshot().cleared).toEqual({ done: [], outputs: [] });
    now = at(7 * DAY);
    expect(store.snapshot().cleared).toEqual({ done: [done.id], outputs: [done.id] });
    // Running work and work whose draft PR waits for a retry never age out.
    now = at(90 * DAY);
    expect(store.snapshot().cleared?.done).not.toContain(running.id);
    expect(store.snapshot().cleared?.done).not.toContain(retry.id);
    store.view.configure({ retentionDays: 0 });
    expect(store.snapshot().cleared).toEqual({ done: [], outputs: [] });
    store.view.configure({ retentionDays: 30 });
    expect(store.snapshot().cleared?.done).toEqual([done.id]);
  });

  test("view settings accept only the offered periods", () => {
    for (const retentionDays of [0, 1, 3, 7, 14, 30]) expect(TarsViewSettingsSchema.parse({ retentionDays })).toEqual({ retentionDays });
    for (const retentionDays of [2, -1, 1.5, 365]) expect(TarsViewSettingsSchema.safeParse({ retentionDays }).success).toBe(false);
    expect(TarsViewSettingsSchema.safeParse({ retentionDays: 7, extra: true }).success).toBe(false);
  });
});

describe("clear contracts", () => {
  test("inputs name each scope once, strictly, and records say exactly what their scopes hid", () => {
    expect(TarsClearInputSchema.safeParse({ requestId: "a", scopes: ["done", "done"], source: "click" }).success).toBe(false);
    expect(TarsClearInputSchema.safeParse({ requestId: "a", scopes: [], source: "click" }).success).toBe(false);
    expect(TarsClearInputSchema.safeParse({ requestId: "a", scopes: ["messages"], source: "click" }).success).toBe(false);
    expect(TarsClearInputSchema.safeParse({ requestId: "a", scopes: ["done"], source: "words" }).success).toBe(false);
    expect(TarsClearInputSchema.safeParse({ requestId: "a", scopes: ["done"], source: "click", ids: ["x"] }).success).toBe(false);
    const base = { requestId: "a", source: "click", proposal: null, status: "applied", revision: 1, createdAt: at(0), updatedAt: at(0) };
    expect(TarsClearRecordSchema.safeParse({ ...base, scopes: ["conversation"], hiddenMessages: 3 }).success).toBe(true);
    expect(TarsClearRecordSchema.safeParse({ ...base, scopes: ["conversation"] }).success).toBe(false);
    expect(TarsClearRecordSchema.safeParse({ ...base, scopes: ["done"], done: [], outputs: [] }).success).toBe(false);
  });

  test("only a clear receipt may apply without naming a responsibility", () => {
    const base = { messageId: "m", actionIndex: 0, requestHash: "a".repeat(64), status: "applied", responsibilityId: null, error: null, reason: null,
      revision: 2, createdAt: at(0), updatedAt: at(0) };
    expect(TarsActionReceiptSchema.safeParse({ ...base, action: { kind: "clear", scopes: ["conversation"] } }).success).toBe(true);
    expect(TarsActionReceiptSchema.safeParse({ ...base, action: { kind: "clear", scopes: ["conversation"] }, responsibilityId: "r" }).success).toBe(false);
    expect(TarsActionReceiptSchema.safeParse({ ...base, action: { kind: "show", responsibilityId: "r", view: "report" } }).success).toBe(false);
  });

  test("the planner is told about clear and its output may propose one, strictly", () => {
    const store = new TarsStore(database());
    const message = { requestId: "m", text: "Clear the chat", ...SETTINGS, id: "m", state: "reasoning" as const, revision: 2, reply: null, error: null,
      decision: null, createdAt: at(0), updatedAt: at(0) };
    expect(buildTarsPlannerPrompt(message, testContext(store), [])).toContain("{kind:'clear',scopes:['conversation'|'done'|'outputs']}");
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Confirm on the card.", actions: [{ kind: "clear", scopes: ["conversation", "done"] }] })).actions)
      .toEqual([{ kind: "clear", scopes: ["conversation", "done"] }]);
    expect(() => parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [{ kind: "clear", scopes: ["done"], responsibilityId: "r" }] }))).toThrow();
    expect(() => parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [{ kind: "clear", scopes: ["done"] }, { kind: "clear", scopes: ["outputs"] }] }))).toThrow();
  });
});

/** The main-process service over one database with a moving clock, so a clear has a time before and after it. */
function service(options: { filename?: string; start?: number; answer?: (request: SecondaryProviderExecutionRequest) => string } = {}) {
  let clock = options.start ?? 100;
  const now = () => at(clock++);
  const db = database(options.filename);
  const conversations = new TarsConversationStore(db);
  if (!conversations.getSettings()) conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(db, { now });
  const ledger = new RunLedgerStore(db);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const runtime = createTarsRuntime({ store: responsibilities, now, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (entry) => `run-${entry.id}`, observe: async () => ({ state: "running", detail: null }), controlRun: async () => {} });
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      const text = options.answer?.(request) ?? JSON.stringify({ reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, status: "completed", text, truncated: false,
        eventCount: 1, collectedEventCount: 1, outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now,
  });
  const svc = createTarsConversationService({ conversations, responsibilities, coordinator, now,
    context: async () => testContext(responsibilities, REGISTRY),
    applyDecision: (input) => applyTarsDecision(input, { conversations, responsibilities, readRegistry: () => REGISTRY, requestTick: () => {}, control: runtime.act, now }),
  });
  return { conversations, responsibilities, requests, service: svc, now };
}

describe("conversation clears", () => {
  test("hide earlier conversation from the view and from Tars's history, keep waiting decisions, and restore on undo", async () => {
    const f = service();
    f.service.start();
    const running = row(f.responsibilities, "running", { state: "running" }, f.now());
    f.service.sendMessage({ requestId: "older", text: "An older remark about the weather." });
    await f.service.whenIdle();
    // A question Tars asked about running work, still unanswered.
    const ask = f.conversations.create({ requestId: "ask", text: "Ask me about the running work." }, f.now());
    const claimed = f.conversations.claim(ask.id, ask.revision, f.now());
    const decision: TarsDecision = { reply: "One question.", actions: [{ kind: "ask", question: "Should I pause it?", options: [
      { label: "Pause", rationale: "Hold it.", effect: { kind: "control", responsibilityId: running.id, expectedRevision: running.revision, operation: "pause" } },
      { label: "Keep going", rationale: "It is fine.", effect: { kind: "reply" } }] }] };
    f.conversations.answer(ask.id, claimed.revision, decision, f.now());
    f.service.wake(); await f.service.whenIdle();
    expect(f.service.getConversation().messages.map((message) => message.requestId)).toEqual(["older", "ask"]);

    const record = f.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "click" });
    // The waiting question is not counted: it stays in view.
    expect(record.hiddenMessages).toBe(1);
    const view = f.service.getConversation();
    expect(view.messages.map((message) => message.requestId)).toEqual(["ask"]);
    expect(view.view).toEqual({ retentionDays: 7, clearedAt: record.createdAt, clearRequestId: "clear-chat" });
    expect(view.clears?.map((entry) => entry.requestId)).toEqual(["clear-chat"]);

    // Tars's next reasoning starts its history after the clear: the older words are not in its prompt.
    f.service.sendMessage({ requestId: "after", text: "What is next?" });
    await f.service.whenIdle();
    const prompt = f.requests.at(-1)!.input.prompt;
    expect(prompt).toContain("What is next?");
    expect(prompt).not.toContain("An older remark about the weather.");
    // Saying something new moved on from the question, so it no longer holds its place.
    expect(f.service.getConversation().messages.map((message) => message.requestId)).toEqual(["after"]);
    // Nothing was deleted.
    expect(f.conversations.list(100).map((message) => message.requestId)).toEqual(["older", "ask", "after"]);

    f.service.undoClear({ requestId: "clear-chat" });
    const restored = f.service.getConversation();
    expect(restored.messages.map((message) => message.requestId)).toEqual(["older", "ask", "after"]);
    expect(restored.view?.clearedAt).toBeNull();
    expect(restored.clears?.map((entry) => entry.status)).toEqual(["undone"]);
    await f.service.stop();
  });

  test("keep a queued message in view after the clear and survive a restart", async () => {
    const filename = persisted();
    const first = service({ filename });
    first.service.start();
    first.service.sendMessage({ requestId: "said", text: "Said before." });
    await first.service.whenIdle();
    const queued = first.conversations.create({ requestId: "queued", text: "Still waiting." }, first.now());
    const record = first.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "key" });
    expect(record.hiddenMessages).toBe(1);
    expect(first.service.getConversation().messages.map((message) => message.id)).toEqual([queued.id]);
    await first.service.stop();
    // The app comes back later than it closed.
    const restarted = service({ filename, start: 1_000 });
    restarted.service.start();
    await restarted.service.whenIdle();
    const view = restarted.service.getConversation();
    expect(view.view?.clearRequestId).toBe("clear-chat");
    // Answered after the clear, so its reply stays in view.
    expect(view.messages.map((message) => [message.requestId, message.state])).toEqual([["queued", "answered"]]);
    // Tars's history matches the view: the late-answered exchange is in it, the cleared one is not.
    restarted.service.sendMessage({ requestId: "next", text: "And now?" });
    await restarted.service.whenIdle();
    const prompt = restarted.requests.at(-1)!.input.prompt;
    expect(prompt).toContain("Still waiting.");
    expect(prompt).not.toContain("Said before.");
    await restarted.service.stop();
  });
});

describe("clear proposals", () => {
  test("wait for the user's confirmation, settle with the clear, and refuse a confirmation that names other scopes", async () => {
    const f = service({ answer: () => JSON.stringify({ reply: "Confirm on the card.", actions: [{ kind: "clear", scopes: ["done", "conversation"] }] }) });
    f.service.start();
    const done = row(f.responsibilities, "done", { state: "completed" }, f.now());
    const message = f.service.sendMessage({ requestId: "words", text: "Clear the chat and finished work." });
    await f.service.whenIdle();
    const receipt = f.conversations.getReceipt(message.id, 0)!;
    expect(receipt.status).toBe("proposed");
    expect(f.responsibilities.snapshot().cleared?.done).toEqual([]);
    const requestId = tarsClearProposalRequestId(message.id, 0);
    expect(() => f.service.clear({ requestId, scopes: ["done"], source: "click" })).toThrow("other scopes");
    // The refused confirmation changed nothing.
    expect(f.responsibilities.snapshot().cleared?.done).toEqual([]);
    expect(f.responsibilities.view.getClear(requestId)).toBeNull();
    const record = f.service.clear({ requestId, scopes: ["conversation", "done"], source: "key" });
    expect(record.proposal).toEqual({ messageId: message.id, actionIndex: 0 });
    expect(record.done).toEqual([done.id]);
    expect(f.conversations.getReceipt(message.id, 0)).toMatchObject({ status: "applied", responsibilityId: null });
    // A retry from another surface joins the first record.
    expect(f.service.clear({ requestId, scopes: ["done", "conversation"], source: "click" })).toEqual(record);
    await f.service.stop();
  });

  test("an automatic follow-up cannot propose a clear", () => {
    const store = new TarsStore(database());
    const origin = { kind: "followUp" as const, eventKey: "e", responsibilityId: "r", reason: "blocked" as const, observedRevision: 1, summary: "" };
    expect(tarsFollowUpRefusal({ kind: "clear", scopes: ["conversation"] }, origin, store)).toContain("cannot propose clearing");
  });
});

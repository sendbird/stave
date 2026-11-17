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
import { actTars } from "../electron/host-service/tars-control";
import { REGISTRY, SETTINGS, testContext } from "./tars-test-context";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import { TarsActionReceiptSchema, type TarsActionReceipt, type TarsConversation, type TarsDecision, type TarsMessageView } from "../src/lib/tars/conversation";
import { filterTarsConversationView, projectTarsClearProposals, tarsClearKeeps, tarsLaneUndoClear } from "../src/lib/tars/clear-view";
import {
  TarsClearInputSchema, TarsClearRecordSchema, TarsViewSettingsSchema, normalizeTarsClearScopes, tarsClearProposalRequestId,
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
  acceptanceCriteria: ["It works."], completionGoal: "implementation", workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" });
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
    const ready = row(store, "ready", { state: "resultReady" }, at(1));
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
    for (const kept of [running, waiting, blocked, ready, publishing, retry, proposed]) {
      expect(cleared.done).not.toContain(kept.id);
      expect(cleared.outputs).not.toContain(kept.id);
    }
    // The work itself is untouched: same revisions, nothing deleted.
    expect(store.snapshot().responsibilities).toHaveLength(10);
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
    expect(buildTarsPlannerPrompt(message, testContext(store), [])).toContain("{kind:'clear',scopes:['conversation'|'done'|'outputs'|'work']}");
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Confirm on the card.", actions: [{ kind: "clear", scopes: ["conversation", "done"] }] })).actions)
      .toEqual([{ kind: "clear", scopes: ["conversation", "done"] }]);
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [{ kind: "clear", scopes: ["done"], responsibilityId: "r" }] })))
      .toMatchObject({ actions: [], dropped: [{ index: 0, kind: "clear", reason: "invalid" }] });
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [{ kind: "clear", scopes: ["done"] }, { kind: "clear", scopes: ["outputs"] }] })))
      .toMatchObject({ actions: [{ kind: "clear", scopes: ["done"] }], dropped: [{ index: 1, kind: "clear", reason: "overLimit" }] });
  });
});

describe("Work reset", () => {
  /** Tars's own unfinished work in every state a reset stops, the user's work it keeps, ended work, and a question waiting on the running work. */
  async function seeded(f: ReturnType<typeof service>) {
    const live = (id: string, patch: TarsResponsibilityPatch) => row(f.responsibilities, id, patch, f.now());
    const running = live("running", { state: "running", taskId: "tars-running", executionWorkspaceId: "execution", agentRunId: "run-running" });
    const waiting = live("waiting", { state: "waiting" });
    const blocked = live("blocked", { state: "blocked" });
    const queued = live("queued", { state: "queued" });
    const takenOver = live("taken", { state: "takenOver", taskId: "tars-taken", executionWorkspaceId: "execution", agentRunId: "run-taken" });
    const paused = live("paused", { state: "paused" });
    const ended = live("ended", { state: "completed" });
    const ask = f.conversations.create({ requestId: "ask", text: "Ask about the running work." }, f.now());
    const claimed = f.conversations.claim(ask.id, ask.revision, f.now());
    f.conversations.answer(ask.id, claimed.revision, { reply: "One question.", actions: [{ kind: "ask", question: "Should I stop it?", options: [
      { label: "Stop", rationale: "Not needed.", effect: { kind: "control", responsibilityId: running.id, expectedRevision: running.revision, operation: "cancel" } },
      { label: "Keep going", rationale: "Fine.", effect: { kind: "reply" } }] }] }, f.now());
    f.service.wake(); await f.service.whenIdle();
    return { running, waiting, blocked, queued, takenOver, paused, ended, ask };
  }

  test("cancels Tars's unfinished work through the normal cancel, keeps taken-over and paused work, closes its questions, and stays reset after a restart", async () => {
    const filename = persisted();
    const f = service({ filename });
    f.service.start();
    const rows = await seeded(f);
    expect(f.responsibilities.snapshot().pendingDecisions).toContainEqual(expect.objectContaining({ kind: "ask", messageId: rows.ask.id }));

    const record = await f.service.clear({ requestId: "reset", scopes: ["conversation", "work"], source: "click" });
    // The reset brings Done and Outputs with it, and says what it stopped and what it kept.
    expect(record.scopes).toEqual(["conversation", "done", "outputs", "work"]);
    expect(new Set(record.work?.cancelled)).toEqual(new Set([rows.running.id, rows.waiting.id, rows.blocked.id, rows.queued.id]));
    expect(record.work?.kept).toEqual(expect.arrayContaining([{ responsibilityId: rows.takenOver.id, reason: "takenOver" }, { responsibilityId: rows.paused.id, reason: "paused" }]));
    // The running work's run was stopped through the runtime's cancel, not merely hidden.
    expect(f.controls).toContainEqual([rows.running.id, "cancel"]);
    expect(f.controls.some(([id]) => id === rows.takenOver.id)).toBe(false);
    const state = (id: string) => f.responsibilities.get(id)?.state;
    for (const id of record.work!.cancelled) expect(state(id)).toBe("cancelled");
    // The user's own work is untouched: same state, same revision.
    expect(f.responsibilities.get(rows.takenOver.id)).toMatchObject({ state: "takenOver", revision: rows.takenOver.revision });
    expect(f.responsibilities.get(rows.paused.id)).toMatchObject({ state: "paused", revision: rows.paused.revision });
    // Every ended card leaves the Work panel; the kept work stays in it.
    const cleared = f.responsibilities.snapshot().cleared!;
    expect(new Set(cleared.done)).toEqual(new Set([...record.work!.cancelled, rows.ended.id]));
    // The question about the stopped work is closed, not left waiting or re-asked.
    expect(f.responsibilities.snapshot().pendingDecisions?.some((decision) => decision.messageId === rows.ask.id)).toBe(false);
    expect(f.conversations.getAnswer(`ask:${rows.ask.id}:0`)?.effect.kind).toBe("dismiss");
    // A retry of the same reset returns the saved record and sends no control again.
    const sent = f.controls.length;
    expect(await f.service.clear({ requestId: "reset", scopes: ["conversation", "work"], source: "click" })).toEqual(record);
    expect(f.controls.length).toBe(sent);
    await f.service.whenIdle();
    await f.service.stop();

    const restarted = service({ filename, start: 1_000 });
    restarted.service.start();
    await restarted.service.whenIdle();
    const after = restarted.responsibilities.snapshot();
    expect(new Set(after.cleared!.done)).toEqual(new Set(cleared.done));
    for (const id of record.work!.cancelled) expect(restarted.responsibilities.get(id)?.state).toBe("cancelled");
    // No automatic re-ask comes back for the closed question, and nothing restarts the cancelled runs.
    expect(restarted.conversations.list(100).some((message) => message.origin?.kind === "reask")).toBe(false);
    expect(restarted.controls).toEqual([]);
    // Restore brings the cards back; cancelled work stays cancelled.
    restarted.service.undoClear({ requestId: "reset" });
    expect(restarted.responsibilities.snapshot().cleared?.done).toEqual([]);
    expect(restarted.responsibilities.get(rows.running.id)?.state).toBe("cancelled");
    await restarted.service.stop();
  });

  test("a cancel the host refuses keeps that work and says so, instead of hiding it", async () => {
    const f = service({ controlRun: async (_id, operation) => { if (operation === "cancel") throw new Error("The run did not stop."); } });
    f.service.start();
    const running = row(f.responsibilities, "running", { state: "running", taskId: "tars-running", executionWorkspaceId: "execution", agentRunId: "run-running" }, f.now());
    const record = await f.service.clear({ requestId: "reset", scopes: ["work"], source: "click" });
    expect(record.work).toEqual({ cancelled: [], kept: [{ responsibilityId: running.id, reason: "refused" }] });
    expect(f.responsibilities.get(running.id)?.state).toBe("running");
    expect(f.responsibilities.snapshot().cleared?.done).toEqual([]);
    await f.service.stop();
  });

  test("a Work reset Tars proposes waits for the card and confirms with the Done and Outputs it brings", async () => {
    const f = service({ answer: () => JSON.stringify({ reply: "Confirm on the card.", actions: [{ kind: "clear", scopes: ["work"] }] }) });
    f.service.start();
    const running = row(f.responsibilities, "running", { state: "running" }, f.now());
    const message = f.service.sendMessage({ requestId: "words", text: "In Progress 비워줘" });
    await f.service.whenIdle();
    expect(f.conversations.getReceipt(message.id, 0)?.status).toBe("proposed");
    // Nothing stops before the confirmation.
    expect(f.responsibilities.get(running.id)?.state).toBe("running");
    const record = await f.service.clear({ requestId: tarsClearProposalRequestId(message.id, 0), scopes: ["work"], source: "click" });
    expect(record.work?.cancelled).toEqual([running.id]);
    expect(f.conversations.getReceipt(message.id, 0)?.status).toBe("applied");
    await f.service.stop();
  });

  test("a proposal with nothing left to clear still closes through the host", async () => {
    const f = service({ answer: () => JSON.stringify({ reply: "Confirm on the card.", actions: [{ kind: "clear", scopes: ["outputs"] }] }) });
    f.service.start();
    const message = f.service.sendMessage({ requestId: "words", text: "Clear outputs." });
    await f.service.whenIdle();
    const record = await f.service.clear({ requestId: tarsClearProposalRequestId(message.id, 0), scopes: ["outputs"], source: "click" });
    expect(record.outputs).toEqual([]);
    const view = f.service.getConversation();
    expect(projectTarsClearProposals(view.receipts, view.clears ?? []).map((proposal) => proposal.state)).toEqual(["settled"]);
    await f.service.stop();
  });

  test("Work reset dismisses a reply-only question instead of leaving a confirmation waiting", async () => {
    const f = service({ answer: () => JSON.stringify({ reply: "Reset it?", actions: [{ kind: "ask", question: "Reset Work?", options: [
      { label: "Yes", rationale: "Reset it.", effect: { kind: "reply" } }, { label: "No", rationale: "Keep it.", effect: { kind: "reply" } }] }] }) });
    f.service.start();
    const message = f.service.sendMessage({ requestId: "reply-question", text: "Reset Work." });
    await f.service.whenIdle();
    await f.service.clear({ requestId: "reset", scopes: ["conversation", "work"], source: "click" });
    expect(f.conversations.getAnswer(`ask:${message.id}:0`)?.effect.kind).toBe("dismiss");
    expect(f.service.getConversation().messages).toEqual([]);
    await f.service.stop();
  });

  test("a mismatched or missing clear proposal is refused before cancelling any work", async () => {
    const f = service({ answer: () => JSON.stringify({ reply: "Confirm.", actions: [{ kind: "clear", scopes: ["outputs"] }] }) });
    f.service.start();
    const live = row(f.responsibilities, "running", { state: "running", taskId: "tars-running", executionWorkspaceId: "execution", agentRunId: "run-running" }, f.now());
    const message = f.service.sendMessage({ requestId: "proposal", text: "Clear outputs." });
    await f.service.whenIdle();
    for (const messageId of [message.id, "missing"]) {
      await expect(f.service.clear({ requestId: tarsClearProposalRequestId(messageId, 0), scopes: ["work"], source: "click" })).rejects.toThrow();
      expect(f.responsibilities.get(live.id)?.state).toBe("running");
      expect(f.controls).toEqual([]);
    }
    await f.service.stop();
  });

  test("declining a clear persists across restart and cannot later cancel Work", async () => {
    const filename = persisted();
    const f = service({ filename, answer: () => JSON.stringify({ reply: "Confirm.", actions: [{ kind: "clear", scopes: ["work"] }] }) });
    f.service.start();
    const message = f.service.sendMessage({ requestId: "proposal", text: "Reset Work." });
    await f.service.whenIdle();
    const decisionId = `confirm:${message.id}:0`;
    expect(f.service.dismissDecision({ decisionId, source: "click" }).refusal).toBeNull();
    expect(f.service.dismissDecision({ decisionId, source: "click" }).refusal).toBeNull();
    await expect(f.service.clear({ requestId: tarsClearProposalRequestId(message.id, 0), scopes: ["work"], source: "click" })).rejects.toThrow("dismissed");
    await f.service.stop();
    const restarted = service({ filename, start: 1000 });
    restarted.service.start(); await restarted.service.whenIdle();
    const view = restarted.service.getConversation();
    expect(projectTarsClearProposals(view.receipts, view.clears ?? [], view.answers).map((proposal) => proposal.state)).toEqual(["declined"]);
    const cleared = await restarted.service.clear({ requestId: "chat", scopes: ["conversation"], source: "click" });
    expect(cleared.hiddenMessages).toBe(1);
    expect(restarted.service.getConversation().messages).toEqual([]);
    await restarted.service.stop();
  });

  test("records hold exactly what a Work reset did", () => {
    const base = { requestId: "a", source: "click", proposal: null, status: "applied", revision: 1, createdAt: at(0), updatedAt: at(0), done: [], outputs: [] };
    expect(TarsClearRecordSchema.safeParse({ ...base, scopes: ["done", "outputs", "work"], work: { cancelled: ["r"], kept: [{ responsibilityId: "u", reason: "takenOver" }] } }).success).toBe(true);
    expect(TarsClearRecordSchema.safeParse({ ...base, scopes: ["done", "outputs", "work"] }).success).toBe(false);
    expect(TarsClearRecordSchema.safeParse({ ...base, scopes: ["done", "outputs"], work: { cancelled: [], kept: [] } }).success).toBe(false);
    expect(normalizeTarsClearScopes(["work"])).toEqual(["done", "outputs", "work"]);
  });
});

/** The main-process service over one database with a moving clock, so a clear has a time before and after it. */
function service(options: { filename?: string; start?: number; answer?: (request: SecondaryProviderExecutionRequest) => string;
  /** Runs before the runtime records a run control: a throw stands for a control whose outcome is not known. */
  controlRun?: (responsibilityId: string, operation: string) => Promise<void> } = {}) {
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
    startRun: async (entry) => `run-${entry.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (entry, operation) => { if (options.controlRun) await options.controlRun(entry.id, operation); controls.push([entry.id, operation]); } });
  const controls: Array<[string, string]> = [];
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
    act: (input) => actTars(input, { conversations, runtime, now }),
  });
  return { conversations, responsibilities, requests, controls, service: svc, now };
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

    const record = await f.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "click" });
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
    // An unrelated message does not retire the waiting question or hide it behind the clear.
    expect(f.service.getConversation().messages.map((message) => message.requestId)).toEqual(["ask", "after"]);
    expect(f.responsibilities.snapshot().pendingDecisions).toContainEqual(expect.objectContaining({ kind: "ask", messageId: ask.id }));
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
    const record = await first.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "key" });
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
    await expect(f.service.clear({ requestId, scopes: ["done"], source: "click" })).rejects.toThrow("other scopes");
    // The refused confirmation changed nothing.
    expect(f.responsibilities.snapshot().cleared?.done).toEqual([]);
    expect(f.responsibilities.view.getClear(requestId)).toBeNull();
    const record = await f.service.clear({ requestId, scopes: ["conversation", "done"], source: "key" });
    expect(record.proposal).toEqual({ messageId: message.id, actionIndex: 0 });
    expect(record.done).toEqual([done.id]);
    expect(f.conversations.getReceipt(message.id, 0)).toMatchObject({ status: "applied", responsibilityId: null });
    // A retry from another surface joins the first record.
    expect(await f.service.clear({ requestId, scopes: ["done", "conversation"], source: "click" })).toEqual(record);
    await f.service.stop();
  });

  test("an automatic follow-up cannot propose a clear", () => {
    const store = new TarsStore(database());
    const origin = { kind: "followUp" as const, eventKey: "e", responsibilityId: "r", reason: "blocked" as const, observedRevision: 1, summary: "" };
    expect(tarsFollowUpRefusal({ kind: "clear", scopes: ["conversation"] }, origin, store)).toContain("cannot propose clearing");
  });
});

describe("review fixes", () => {
  const clearReceipt = (messageId: string, status: "proposed" | "applied"): TarsActionReceipt => ({ messageId, actionIndex: 0, requestHash: "a".repeat(64),
    action: { kind: "clear", scopes: ["done", "outputs"] }, status, responsibilityId: null, error: null, reason: null, revision: status === "proposed" ? 1 : 2,
    createdAt: at(0), updatedAt: at(0) });
  const view = (message: string, overrides: Partial<TarsMessageView> = {}): TarsMessageView => ({ requestId: message, text: "Words.", providerId: "codex", model: "m",
    maxTurns: 30, id: message, state: "answered", revision: 3, reply: "Reply.", error: null, decision: { reply: "Reply.", actions: [] }, createdAt: at(1), updatedAt: at(1),
    ...overrides }) as TarsMessageView;
  const conversation = (messages: TarsMessageView[], receipts: TarsActionReceipt[] = []): TarsConversation => ({
    settings: null, messages, receipts, activity: [], records: [], answers: [], events: [], publications: [], clears: [] });

  test("a clear proposal still waiting for its confirmation keeps its message and receipt through a conversation clear", () => {
    const keeps = tarsClearKeeps({ decisions: [], receipts: [clearReceipt("proposed", "proposed"), clearReceipt("confirmed", "applied")] });
    expect([...keeps.messageIds]).toEqual(["proposed"]);
    const filtered = filterTarsConversationView(conversation([view("proposed"), view("confirmed")], [clearReceipt("proposed", "proposed"), clearReceipt("confirmed", "applied")]),
      { clearedAt: at(10), inProgress: [], keeps });
    expect(filtered.messages.map((message) => message.id)).toEqual(["proposed"]);
    expect(projectTarsClearProposals(filtered.receipts, []).map((proposal) => [proposal.requestId, proposal.state])).toEqual([["clear:proposed:0", "waiting"]]);
  });

  test("the confirm card of a Done/Outputs clear Tars proposed survives clearing only the conversation, and still confirms", async () => {
    const f = service({ answer: () => JSON.stringify({ reply: "Confirm on the card.", actions: [{ kind: "clear", scopes: ["done", "outputs"] }] }) });
    f.service.start();
    const done = row(f.responsibilities, "done", { state: "completed" }, f.now());
    const message = f.service.sendMessage({ requestId: "words", text: "Clear finished work." });
    await f.service.whenIdle();
    expect(f.conversations.getReceipt(message.id, 0)?.status).toBe("proposed");
    const chat = await f.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "click" });
    // The proposal's message stays, so it is not counted as hidden.
    expect(chat.hiddenMessages).toBe(0);
    const cleared = f.service.getConversation();
    expect(cleared.messages.map((entry) => entry.id)).toEqual([message.id]);
    const requestId = tarsClearProposalRequestId(message.id, 0);
    expect(projectTarsClearProposals(cleared.receipts, cleared.clears ?? []).map((proposal) => [proposal.requestId, proposal.state])).toEqual([[requestId, "waiting"]]);
    const confirmed = await f.service.clear({ requestId, scopes: ["done", "outputs"], source: "click" });
    expect(confirmed.done).toEqual([done.id]);
    expect(f.service.getConversation().view?.clearRequestId).toBe("clear-chat");
    await f.service.stop();
  });

  test("a conversation clear keeps the earlier Done clear's Undo, and that Undo leaves the conversation cleared", async () => {
    const f = service();
    f.service.start();
    f.service.sendMessage({ requestId: "older", text: "Earlier words." });
    await f.service.whenIdle();
    const done = row(f.responsibilities, "done", { state: "completed" }, f.now());
    expect((await f.service.clear({ requestId: "clear-done", scopes: ["done"], source: "click" })).done).toEqual([done.id]);
    await f.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "click" });
    const cleared = f.service.getConversation();
    // The conversation's record lines start at the conversation clear...
    expect(cleared.clears?.map((record) => record.requestId)).toEqual(["clear-chat"]);
    // ...but the Done lane still offers the Undo of the work it hides.
    expect(tarsLaneUndoClear(cleared, "done")?.requestId).toBe("clear-done");
    expect(tarsLaneUndoClear(cleared, "outputs")).toBeNull();

    f.service.undoClear({ requestId: "clear-done" });
    expect(f.responsibilities.snapshot().cleared?.done).toEqual([]);
    const restored = f.service.getConversation();
    expect(restored.view?.clearRequestId).toBe("clear-chat");
    expect(restored.messages).toEqual([]);
    expect(tarsLaneUndoClear(restored, "done")).toBeNull();
    await f.service.stop();
  });

  test("a message being answered at clear time keeps its reply even when it lands in the clear's millisecond; one answered before stays hidden", () => {
    const clearedAt = at(10);
    const keeps = tarsClearKeeps({ decisions: [], receipts: [] });
    const filtered = filterTarsConversationView(conversation([view("before", { updatedAt: at(9) }), view("same", { updatedAt: clearedAt })]),
      { clearedAt, inProgress: ["same"], keeps });
    expect(filtered.messages.map((message) => message.id)).toEqual(["same"]);
  });

  test("a same-millisecond reply stays in view and reaches Tars's history; a reply before the clear does not", async () => {
    const f = service();
    f.service.start();
    f.service.sendMessage({ requestId: "before", text: "Answered before the clear." });
    await f.service.whenIdle();
    const working = f.conversations.create({ requestId: "working", text: "Still being answered." }, f.now());
    const claimed = f.conversations.claim(working.id, working.revision, f.now())!;
    const record = await f.service.clear({ requestId: "clear-chat", scopes: ["conversation"], source: "click" });
    expect(record.hiddenMessages).toBe(1);
    // The reply lands in the clear's own millisecond.
    const answered = f.conversations.answer(working.id, claimed.revision, { reply: "Same-millisecond reply.", actions: [] }, record.createdAt);
    expect(answered.updatedAt).toBe(record.createdAt);
    expect(f.service.getConversation().messages.map((message) => [message.requestId, message.state])).toEqual([["working", "answered"]]);
    f.service.sendMessage({ requestId: "next", text: "And now?" });
    await f.service.whenIdle();
    const prompt = f.requests.at(-1)!.input.prompt;
    expect(prompt).toContain("Same-millisecond reply.");
    expect(prompt).not.toContain("Answered before the clear.");
    await f.service.stop();
  });

  test("a conversation clear saved before in-progress messages were recorded reads as keeping none", () => {
    const db = database();
    const store = new TarsStore(db, { now: () => at(60) });
    const legacy = { requestId: "legacy", source: "click", scopes: ["conversation"], proposal: null, status: "applied", hiddenMessages: 2, revision: 1,
      createdAt: at(1), updatedAt: at(1) };
    db.prepare(`INSERT INTO tars_clears (request_id, request_hash, revision, status, conversation, created_at, body_json)
      VALUES ('legacy', 'h', 1, 'applied', 1, ?, ?)`).run(at(1), JSON.stringify(legacy));
    expect(store.view.getClear("legacy")?.inProgress).toEqual([]);
    expect(store.view.activeConversationClear()?.inProgress).toEqual([]);
    expect(TarsClearRecordSchema.safeParse({ ...legacy, scopes: ["done"], hiddenMessages: undefined, done: [], inProgress: [] }).success).toBe(false);
  });
});

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import { collectTarsAttention } from "@/lib/tars/attention";
import { buildTarsTray } from "@/lib/tars/tray-model";
import { tarsConfirmationRequestId, type TarsDecision, type TarsDecisionAction, type TarsMessage } from "../src/lib/tars/conversation";
import { projectTarsDecisions, selectAnswerableTarsDecisions, tarsAskDecisionId, tarsUnverifiedDecisionId } from "../src/lib/tars/decisions";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";
import { SETTINGS, testContext, REGISTRY } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
beforeEach(async () => { await applyAppLocale("en"); });

const reply = (label: string) => ({ label, rationale: `Because ${label.toLowerCase()}.`, effect: { kind: "reply" as const } });

/** The real stores, host admission and conversation service on one database; only the model's replies and the run port are simulated. */
function fixture(replies: TarsDecision[] = []) {
  const database = new Database(":memory:");
  cleanup.push(() => { if (!database.closed) database.close(); });
  const conversations = new TarsConversationStore(database);
  conversations.configure({ ...SETTINGS, autonomy: "careful" });
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  const queue = [...replies];
  const runControls: string[] = [];
  const runtime = createTarsRuntime({ store: responsibilities, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { runControls.push(operation); } });
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      const text = JSON.stringify(queue.shift() ?? { reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
        status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2, outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  const admission = { conversations, responsibilities, readRegistry: () => REGISTRY, requestTick: () => runtime.requestTick(), control: runtime.act, now: () => NOW };
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities, REGISTRY),
    applyDecision: (input) => applyTarsDecision(input, admission),
    act: (input) => actTars(input, { conversations, runtime, now: () => NOW }),
    retryDelaysMs: [60_000],
  });
  service.start();
  let made = 0;
  const responsibility = (state: TarsState, patch: Partial<TarsResponsibility> = {}) => {
    const row = responsibilities.create({ requestId: `responsibility-${made++}`, title: "Release check", instruction: "Verify the release.",
      acceptanceCriteria: ["Checks pass"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
    return responsibilities.patch(row.id, row.revision, { state, taskId: `tars-${row.id}`, executionWorkspaceId: "execution", agentRunId: `run-${row.id}`, ...patch }, NOW);
  };
  const send = async (text: string) => {
    const message = service.sendMessage({ requestId: `message-${made++}`, text });
    await service.whenIdle(); await runtime.drain();
    return message;
  };
  /** Tars's own automatic follow-up about a responsibility, answered with these actions and admitted by the host. */
  const followUp = async (row: TarsResponsibility, actions: TarsDecisionAction[]): Promise<TarsMessage> => {
    const created = conversations.create({ requestId: `followup:${made}`, text: "Stave observed a change." }, NOW, 32,
      { kind: "followUp", eventKey: `blocked:${row.id}:${made++}`, responsibilityId: row.id, reason: "blocked", observedRevision: row.revision, summary: "Blocked." });
    const claimed = conversations.claim(created.id, created.revision, NOW);
    const answered = conversations.answer(claimed.id, claimed.revision, { reply: "That proposal no longer fits.", actions }, NOW);
    await applyTarsDecision({ messageId: answered.id, expectedRevision: answered.revision }, admission);
    return answered;
  };
  const decisions = () => projectTarsDecisions({ messages: conversations.list(100), receipts: conversations.list(100).flatMap((message) => conversations.listReceipts(message.id)),
    records: conversations.listActions(100), answers: conversations.listAnswers(100), activity: responsibilities.listActivity(100),
    responsibilities: responsibilities.snapshot().responsibilities });
  const fleetRows = () => buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [], prWorkspaces: [], tarsAttention: collectTarsAttention(responsibilities.snapshot()) })
    .items.filter((item) => item.kind === "tars-decision");
  return { conversations, responsibilities, runtime, service, queue, runControls, responsibility, send, followUp, decisions, fleetRows };
}

const resume = (row: TarsResponsibility): TarsDecisionAction => ({ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" });

describe("dismissing a waiting card", () => {
  test("a proposal is dismissed once, for good: it leaves Fleet and the tray with the snapshot and can no longer be confirmed", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Confirm to resume.", actions: [resume(row)] });
    const message = await f.send("Resume the release check");
    const decisionId = tarsConfirmationRequestId(message.id, 0);
    expect(f.fleetRows()).toHaveLength(1);
    const first = f.service.dismissDecision({ decisionId, source: "click" });
    expect(first).toMatchObject({ refusal: null, answer: { decisionId, source: "click", effect: { kind: "dismiss" }, status: "applied", label: null, actRequestId: null } });
    // Idempotent: the same dismissal again returns the saved one, by key or click.
    expect(f.service.dismissDecision({ decisionId, source: "key" })).toEqual(first);
    // The card, the snapshot, Fleet and the tray agree: nothing waits.
    expect(f.decisions()).toEqual([expect.objectContaining({ id: decisionId, state: "dismissed", closure: first.answer, answer: null })]);
    const snapshot = f.responsibilities.snapshot();
    expect(snapshot.pendingDecisions).toEqual([]);
    expect(f.fleetRows()).toEqual([]);
    expect(buildTarsTray({ responsibilities: snapshot.responsibilities, attentionItems: [], runs: {}, pendingDecisions: snapshot.pendingDecisions }).counts.needsYou).toBe(0);
    // Nothing applied, and nothing can apply it any more: not an answer, not a confirmation from Fleet.
    expect(await f.service.answerDecision({ decisionId, optionIndex: 0, source: "click" })).toEqual({ answer: null, refusal: "notWaiting" });
    expect((await actTars({ requestId: decisionId, responsibilityId: row.id, expectedRevision: row.revision, operation: "resume", source: "fleet" },
      { conversations: f.conversations, runtime: f.runtime, now: () => NOW })).record).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.get(row.id)?.state).toBe("paused");
  });

  test("a question is dismissed without an answer; an answered decision is refused and an unknown one is not waiting", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Choose.", actions: [{ kind: "ask", question: "Continue?", options: [
      { label: "Resume", rationale: "Ready.", effect: resume(row) }, reply("Wait")] }] });
    const message = await f.send("What now?");
    const decisionId = tarsAskDecisionId(message.id, 0);
    expect(f.service.dismissDecision({ decisionId, source: "key" }).answer).toMatchObject({ source: "key", effect: { kind: "dismiss" } });
    expect(selectAnswerableTarsDecisions(f.decisions())).toEqual([]);
    // Nothing was sent back to Tars as an answer.
    expect(f.conversations.list(100).filter((entry) => entry.origin?.kind === "answer")).toEqual([]);
    // Another decision, already answered.
    f.queue.push({ reply: "Choose again.", actions: [{ kind: "ask", question: "Continue now?", options: [reply("Yes"), reply("No")] }] });
    const second = await f.send("Ask me again");
    const answeredId = tarsAskDecisionId(second.id, 0);
    await f.service.answerDecision({ decisionId: answeredId, optionIndex: 0, source: "click" });
    expect(f.service.dismissDecision({ decisionId: answeredId, source: "click" })).toMatchObject({ refusal: "alreadyAnswered" });
    expect(f.service.dismissDecision({ decisionId: "ask:unknown:0", source: "click" })).toEqual({ answer: null, refusal: "notWaiting" });
  });

  test("dismissing Stave's unverified-completion choice leaves the work blocked and in the tray with its own controls", () => {
    const f = fixture();
    const row = f.responsibility("blocked", { detail: "Reported without a verified check.", detailCode: "unverifiedCompletion" });
    const decisionId = tarsUnverifiedDecisionId(row.id, row.revision);
    expect(f.responsibilities.snapshot().pendingDecisions).toHaveLength(1);
    expect(f.service.dismissDecision({ decisionId, source: "click" }).refusal).toBeNull();
    const snapshot = f.responsibilities.snapshot();
    expect(snapshot.pendingDecisions).toEqual([]);
    expect(f.decisions()).toEqual([expect.objectContaining({ id: decisionId, state: "dismissed" })]);
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "blocked", detailCode: "unverifiedCompletion", revision: row.revision });
    // The blocked work is still Tars's attention: one blocked row instead of the decision row.
    expect(collectTarsAttention(snapshot).map((signal) => signal.kind)).toEqual(["tars-blocked"]);
    const tray = buildTarsTray({ responsibilities: snapshot.responsibilities, attentionItems: [], runs: {}, pendingDecisions: snapshot.pendingDecisions });
    const card = Object.values(tray.lanes).flat().find((entry) => entry.row.id === row.id)!;
    expect(card.controls.length).toBeGreaterThan(0);
  });
});

describe("waiting cards expire when the conversation moves on", () => {
  test("a control proposal and a question retire once the user sends a newer message, in the card and the snapshot alike", async () => {
    const f = fixture();
    const paused = f.responsibility("paused");
    const other = f.responsibility("paused");
    f.queue.push({ reply: "Confirm, or choose.", actions: [resume(paused), { kind: "ask", question: "And the other one?", options: [
      { label: "Resume it", rationale: "Ready.", effect: resume(other) }, reply("Leave it")] }] });
    const message = await f.send("What needs me?");
    expect(f.responsibilities.snapshot().pendingDecisions.map((decision) => decision.kind ?? "confirm").sort()).toEqual(["ask", "confirm"]);
    await f.send("Unrelated: what is on the release branch?");
    expect(f.decisions().filter((view) => view.messageId === message.id)).toEqual([
      expect.objectContaining({ kind: "confirm", state: "retired", why: "movedOn" }),
      expect.objectContaining({ kind: "ask", state: "retired", why: "movedOn" }),
    ]);
    expect(f.responsibilities.snapshot().pendingDecisions).toEqual([]);
    expect(f.fleetRows()).toEqual([]);
  });

  test("Tars's own follow-up about other work does not retire a waiting proposal", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const elsewhere = f.responsibility("blocked");
    f.queue.push({ reply: "Confirm to resume.", actions: [resume(row)] });
    const message = await f.send("Resume it");
    await f.followUp(elsewhere, []);
    expect(f.decisions().find((view) => view.messageId === message.id)).toMatchObject({ state: "waiting", checked: true });
    expect(f.responsibilities.snapshot().pendingDecisions).toHaveLength(1);
  });
});

describe("Tars withdrawing its own decision", () => {
  test("a follow-up withdraws an earlier proposal: the card closes as withdrawn, nothing applies and the snapshot follows", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Confirm to resume.", actions: [resume(row)] });
    const message = await f.send("Resume it");
    const decisionId = tarsConfirmationRequestId(message.id, 0);
    const withdrawal = await f.followUp(row, [{ kind: "withdraw", decisionId }]);
    expect(f.conversations.listReceipts(withdrawal.id)).toEqual([expect.objectContaining({ status: "applied", responsibilityId: null, action: { kind: "withdraw", decisionId } })]);
    expect(f.decisions().find((view) => view.id === decisionId)).toMatchObject({ state: "withdrawn",
      closure: { source: "tars", effect: { kind: "withdraw", messageId: withdrawal.id, actionIndex: 0 } } });
    expect(f.responsibilities.snapshot().pendingDecisions).toEqual([]);
    expect(f.runControls).toEqual([]);
    // The user can no longer dismiss or answer it either.
    expect(f.service.dismissDecision({ decisionId, source: "click" }).refusal).toBe("notWaiting");
  });

  test("a withdrawal is refused, with its reason, for what no longer waits or is not Tars's own", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Confirm to resume.", actions: [resume(row)] });
    const message = await f.send("Resume it");
    const decisionId = tarsConfirmationRequestId(message.id, 0);
    // The user moved on: the proposal no longer waits, so there is nothing to withdraw.
    await f.send("Something else");
    const late = await f.followUp(row, [{ kind: "withdraw", decisionId }, { kind: "withdraw", decisionId: "ask:missing:0" }]);
    expect(f.conversations.listReceipts(late.id).map((receipt) => [receipt.status, receipt.reason])).toEqual([["rejected", "stale"], ["rejected", "notOwned"]]);
    // Stave's own unverified-completion choice is not a decision id a withdrawal may name.
    const unverified = f.responsibility("blocked", { detailCode: "unverifiedCompletion", detail: "Unverified." });
    const parsed = (await import("../electron/main/tars-planner")).parseTarsDecisionOutput(JSON.stringify({ reply: "x",
      actions: [{ kind: "withdraw", decisionId: tarsUnverifiedDecisionId(unverified.id, unverified.revision) }] }));
    expect(parsed).toMatchObject({ actions: [], dropped: [{ kind: "withdraw", reason: "invalid" }] });
  });
});

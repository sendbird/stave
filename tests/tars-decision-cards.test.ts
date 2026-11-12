import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { handleTarsDecisionKey } from "../src/components/tars/TarsDecisionCard";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import { collectTarsAttention } from "@/lib/tars/attention";
import { buildTarsTray } from "@/lib/tars/tray-model";
import {
  TarsAskActionSchema, TarsDecisionSchema, tarsConfirmationRequestId, type TarsDecision, type TarsDecisionAction,
} from "../src/lib/tars/conversation";
import {
  bindTarsShortAnswer, projectTarsDecisions, selectAnswerableTarsDecisions, tarsAskDecisionId, tarsDecisionKeyChoice, tarsUnverifiedDecisionId, type TarsDecisionView,
} from "../src/lib/tars/decisions";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import { SETTINGS, testContext, REGISTRY } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
beforeEach(async () => { await applyAppLocale("en"); });

const reply = (label: string) => ({ label, rationale: `Because ${label.toLowerCase()}.`, effect: { kind: "reply" as const } });
const ask = (options: Array<ReturnType<typeof reply> | { label: string; rationale: string; effect: { kind: "control"; responsibilityId: string; expectedRevision: number; operation: "resume" | "cancel" | "pause" } }>, recommended?: number) =>
  ({ kind: "ask" as const, question: "How should the release check continue?", options, ...(recommended === undefined ? {} : { recommended }) });

/**
 * The real stores, host runtime, admission and conversation service on one
 * database; only the model's replies and the run port are simulated.
 */
function fixture(replies: TarsDecision[] = []) {
  const database = new Database(":memory:");
  cleanup.push(() => { if (!database.closed) database.close(); });
  const conversations = new TarsConversationStore(database);
  conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const runControls: string[] = [];
  const queue = [...replies];
  const flags = { failRun: false, failAct: false };
  const errors: unknown[] = [];
  const runtime = createTarsRuntime({ store: responsibilities, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { if (flags.failRun) throw new Error("The run could not be reached."); runControls.push(operation); } });
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      const text = JSON.stringify(queue.shift() ?? { reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
        status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2,
        outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  const acts: string[] = [];
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities, REGISTRY),
    applyDecision: (input) => applyTarsDecision(input, { conversations, responsibilities, readRegistry: () => REGISTRY,
      requestTick: () => runtime.requestTick(), control: runtime.act, now: () => NOW }),
    act: (input) => {
      acts.push(`${input.requestId}:${input.source}`);
      if (flags.failAct) return Promise.reject(new Error("The host did not answer."));
      return actTars(input, { conversations, runtime, now: () => NOW });
    },
    retryDelaysMs: [60_000], onError: (error) => errors.push(error),
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
  const decisions = () => projectTarsDecisions({ messages: conversations.list(100), receipts: conversations.list(100).flatMap((message) => conversations.listReceipts(message.id)),
    records: conversations.listActions(100), answers: conversations.listAnswers(100), activity: responsibilities.listActivity(100),
    responsibilities: responsibilities.snapshot().responsibilities });
  return { database, conversations, responsibilities, runtime, service, requests, runControls, acts, responsibility, send, decisions, queue, flags, errors };
}

describe("the ask action's schema", () => {
  const control = { kind: "control" as const, responsibilityId: "goal", expectedRevision: 2, operation: "pause" as const };
  test("2–4 options, each with a label, a one-line rationale and an allowed effect, and an optional recommended option", () => {
    expect(TarsAskActionSchema.safeParse(ask([reply("Wait"), { label: "Pause", rationale: "It holds.", effect: control }], 1)).success).toBe(true);
    expect(TarsAskActionSchema.safeParse(ask([reply("Only one")])).success).toBe(false);
    expect(TarsAskActionSchema.safeParse(ask([reply("A"), reply("B"), reply("C"), reply("D"), reply("E")])).success).toBe(false);
    // The recommended option must exist; labels and controls are distinct.
    expect(TarsAskActionSchema.safeParse(ask([reply("A"), reply("B")], 2)).success).toBe(false);
    expect(TarsAskActionSchema.safeParse(ask([reply("Same"), reply("same")])).success).toBe(false);
    expect(TarsAskActionSchema.safeParse(ask([{ label: "A", rationale: "x", effect: control }, { label: "B", rationale: "y", effect: control }])).success).toBe(false);
    // No other effects, no extra fields, no empty rationale.
    expect(TarsAskActionSchema.safeParse(ask([reply("A"), { label: "B", rationale: "x", effect: { kind: "delegate" } as never }])).success).toBe(false);
    expect(TarsAskActionSchema.safeParse(ask([reply("A"), { label: "B", rationale: "x", effect: { ...control, repositoryPath: "/tmp" } as never }])).success).toBe(false);
    expect(TarsAskActionSchema.safeParse(ask([reply("A"), { label: "B", rationale: "", effect: { kind: "reply" } }])).success).toBe(false);
    expect(TarsAskActionSchema.safeParse({ ...ask([reply("A"), reply("B")]), workspaceId: "source" }).success).toBe(false);
    expect(TarsAskActionSchema.safeParse({ ...ask([reply("A"), reply("B")]), question: "x".repeat(501) }).success).toBe(false);
  });
  test("a reply asks at most one question, and the planner keeps none of an invalid ask but keeps its reply", () => {
    const one = ask([reply("A"), reply("B")]);
    expect(TarsDecisionSchema.safeParse({ reply: "?", actions: [one] }).success).toBe(true);
    expect(TarsDecisionSchema.safeParse({ reply: "?", actions: [one, one] }).success).toBe(false);
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Choose.", actions: [one] })).actions).toEqual([one]);
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Choose.", actions: [ask([reply("A")])] })))
      .toMatchObject({ reply: "Choose.", actions: [], dropped: [{ index: 0, kind: "ask", reason: "invalid" }] });
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Choose.", actions: [one, one] }))).toMatchObject({ actions: [one], dropped: [{ index: 1, reason: "overLimit" }] });
  });
});

describe("answering a decision", () => {
  test("an ask grants nothing; a control option is admitted like a click, once, and a different option is refused", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Choose.", actions: [ask([{ label: "Resume now", rationale: "Staging is done.", effect: { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" } }, reply("Wait")], 1)] });
    const message = await f.send("What now?");
    const [receipt] = f.conversations.listReceipts(message.id);
    expect(receipt!.status).toBe("proposed");
    // Nothing moved: the question alone applied nothing.
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "paused", revision: row.revision });
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.snapshot().pendingDecisions).toEqual([expect.objectContaining({ kind: "ask", responsibilityId: row.id,
      messageId: message.id, actionIndex: 0, operation: null, expectedRevision: row.revision, question: "How should the release check continue?", optionCount: 2 })]);
    const decisionId = tarsAskDecisionId(message.id, 0);
    const first = await f.service.answerDecision({ decisionId, optionIndex: 0, source: "key" });
    expect(first).toMatchObject({ refusal: null, answer: { status: "applied", source: "key", label: "Resume now", actRequestId: `answer:${decisionId}` } });
    await f.runtime.drain();
    expect(f.runControls).toEqual(["resume"]);
    expect(f.conversations.getAction(`answer:${decisionId}`)).toMatchObject({ status: "applied", source: "key" });
    // The same answer again applies once.
    expect((await f.service.answerDecision({ decisionId, optionIndex: 0, source: "click" })).answer).toEqual(first.answer);
    expect(f.runControls).toEqual(["resume"]);
    // A different option for an answered decision is refused with a stable reason and changes nothing.
    expect(await f.service.answerDecision({ decisionId, optionIndex: 1, source: "click" })).toMatchObject({ refusal: "alreadyAnswered", answer: { optionIndex: 0 } });
    expect(f.conversations.list(100)).toHaveLength(1);
    expect(f.responsibilities.snapshot().pendingDecisions).toEqual([]);
  });

  test("a reply option goes back to Tars as the user's answer, not as a typed message", async () => {
    const f = fixture([{ reply: "Choose.", actions: [ask([reply("Keep it running"), reply("Explain first")])] }]);
    const message = await f.send("What now?");
    const decisionId = tarsAskDecisionId(message.id, 0);
    const result = await f.service.answerDecision({ decisionId, optionIndex: 1, source: "click" });
    await f.service.whenIdle();
    const answer = f.conversations.list(100).find((entry) => entry.origin?.kind === "answer")!;
    expect(result.answer).toMatchObject({ status: "applied", messageId: answer.id, effect: { kind: "reply" } });
    expect(answer).toMatchObject({ text: "Explain first", state: "answered", origin: { kind: "answer", decisionId, optionIndex: 1, source: "click", question: "How should the release check continue?" } });
    expect(f.requests.at(-1)!.input.prompt).toContain("\"chosenOption\":\"Explain first\"");
    // A typed message may not claim the answer's identity.
    expect(() => f.service.sendMessage({ requestId: `answer:${decisionId}`, text: "Explain first" })).toThrow(/reserved/);
  });

  test("a proposed control's card confirms on the same path as Fleet and the tray", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Confirm to resume.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" }] });
    const message = await f.send("다시 해줘");
    const decisionId = tarsConfirmationRequestId(message.id, 0);
    expect((await f.service.answerDecision({ decisionId, optionIndex: 0, source: "words" })).answer).toMatchObject({ status: "applied", actRequestId: decisionId });
    await f.runtime.drain();
    expect(f.conversations.getReceipt(message.id, 0)!.status).toBe("applied");
    expect(f.acts).toEqual([`${decisionId}:words`]);
    // A retry from Fleet joins the same record instead of resuming twice.
    await actTars({ requestId: decisionId, responsibilityId: row.id, expectedRevision: row.revision, operation: "resume", source: "fleet" },
      { conversations: f.conversations, runtime: f.runtime, now: () => NOW });
    expect(f.runControls).toEqual(["resume"]);
  });
});

describe("binding and invalidation", () => {
  test("a target moving past its revision invalidates the card and Tars asks again exactly once, with the reason and no authority", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Choose.", actions: [ask([{ label: "Resume now", rationale: "Ready.", effect: { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" } }, reply("Wait")])] });
    const message = await f.send("What now?");
    // The automatic follow-up may only ask; a control it proposes is refused by the host.
    f.queue.push({ reply: "You took it over.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision + 1, operation: "handBack" }] });
    await actTars({ requestId: "tray-takeover", responsibilityId: row.id, expectedRevision: row.revision, operation: "takeover", source: "click" },
      { conversations: f.conversations, runtime: f.runtime, now: () => NOW });
    f.service.wake(); await f.service.whenIdle();
    const reasks = () => f.conversations.list(100).filter((entry) => entry.origin?.kind === "reask");
    expect(reasks()).toHaveLength(1);
    expect(reasks()[0]).toMatchObject({ requestId: `reask:${tarsAskDecisionId(message.id, 0)}`, state: "answered",
      origin: { kind: "reask", decisionId: tarsAskDecisionId(message.id, 0), reason: "targetMoved" } });
    expect(f.requests.at(-1)!.input.prompt).toContain("\"automaticFollowUp\":{\"reason\":\"targetMoved\"");
    expect(f.conversations.listReceipts(reasks()[0]!.id)).toEqual([expect.objectContaining({ status: "rejected", error: expect.stringContaining("can only ask"),
      // The refusal carries a code, so the conversation shows a translated reason instead of the English diagnostic.
      reason: "notByFollowUp" })]);
    expect(f.responsibilities.get(row.id)!.state).toBe("takenOver");
    const view = f.decisions().find((entry) => entry.id === tarsAskDecisionId(message.id, 0))!;
    expect(view).toMatchObject({ state: "invalid", why: "targetMoved", reasked: true });
    // Invalid cards are not answerable, and waking again never asks a second time.
    expect(await f.service.answerDecision({ decisionId: view.id, optionIndex: 0, source: "click" })).toEqual({ answer: null, refusal: "notWaiting" });
    f.service.wake(); await f.service.whenIdle();
    expect(reasks()).toHaveLength(1);
    expect(f.requests).toHaveLength(2);
  });

  test("answering one of a reply's alternatives retires the rest without asking again", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Resume, otherwise cancel.", actions: (["resume", "cancel"] as const).map((operation): TarsDecisionAction =>
      ({ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation })) });
    const message = await f.send("Continue it or stop it");
    await f.service.answerDecision({ decisionId: tarsConfirmationRequestId(message.id, 0), optionIndex: 0, source: "click" });
    await f.runtime.drain();
    f.service.wake(); await f.service.whenIdle();
    expect(f.decisions().map((view) => [view.id, view.state, view.why])).toEqual([
      [tarsConfirmationRequestId(message.id, 0), "answered", null], [tarsConfirmationRequestId(message.id, 1), "retired", "settled"]]);
    expect(f.conversations.list(100).filter((entry) => entry.origin?.kind === "reask")).toEqual([]);
  });

  test("an unverified completion waits as Stave's decision; verification work never reaches the host", async () => {
    const f = fixture();
    const row = f.responsibility("blocked", { detail: "Reported without a verified check.", detailCode: "unverifiedCompletion" });
    // The unverified completion is one inbox event: Tars follows it up once, beside Stave's own decision.
    await f.service.whenIdle();
    expect(f.conversations.list(100).map((entry) => entry.origin?.kind)).toEqual(["followUp"]);
    const decisionId = tarsUnverifiedDecisionId(row.id, row.revision);
    expect(f.responsibilities.snapshot().pendingDecisions).toEqual([{ kind: "unverifiedCompletion", responsibilityId: row.id, messageId: null,
      actionIndex: null, operation: null, expectedRevision: row.revision, proposedAt: NOW, optionCount: 3 }]);
    expect(f.decisions()).toEqual([expect.objectContaining({ id: decisionId, kind: "unverifiedCompletion", state: "waiting", recommended: null,
      options: [expect.objectContaining({ kind: "control", control: expect.objectContaining({ operation: "acceptCompletion" }) }),
        expect.objectContaining({ kind: "control", control: expect.objectContaining({ operation: "cancel" }) }), { kind: "verify", responsibilityId: row.id }] })]);
    expect(await f.service.answerDecision({ decisionId, optionIndex: 2, source: "click" })).toEqual({ answer: null, refusal: "invalidOption" });
    await f.service.answerDecision({ decisionId, optionIndex: 0, source: "click" });
    await f.runtime.drain();
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "completed", detailCode: "acceptedWithoutVerification" });
    expect(f.responsibilities.snapshot().pendingDecisions).toEqual([]);
    // Stave's own question is not asked again by Tars, and the settled work starts no second follow-up.
    f.service.wake(); await f.service.whenIdle();
    expect(f.requests).toHaveLength(1);
    expect(f.conversations.list(100).map((entry) => entry.origin?.kind)).toEqual(["followUp"]);
  });
});

describe("short answers in words", () => {
  const view = (patch: Partial<TarsDecisionView>): TarsDecisionView => ({ id: "ask:m:0", kind: "ask", messageId: "m", actionIndex: 0, question: "Q",
    targets: [], options: [{ kind: "reply", label: "A", rationale: "a" }, { kind: "reply", label: "B", rationale: "b" }], recommended: 1,
    state: "waiting", why: null, checked: true, answer: null, failure: null, latest: true, record: null, since: NOW, reask: false, reasked: false, ...patch });
  test("bind only while exactly one decision waits: a number picks that option, an affirmative its recommended option", () => {
    const one = [view({})];
    expect(bindTarsShortAnswer("2", one)).toMatchObject({ optionIndex: 1 });
    expect(bindTarsShortAnswer(" 1. ", one)).toMatchObject({ optionIndex: 0 });
    for (const word of ["응", "네", "그래", "yes", "OK", "ok!"]) expect(bindTarsShortAnswer(word, one)).toMatchObject({ optionIndex: 1 });
    // A number past the options, or longer words, go to Tars as a message.
    expect(bindTarsShortAnswer("3", one)).toBeNull();
    expect(bindTarsShortAnswer("yes, but wait", one)).toBeNull();
    expect(bindTarsShortAnswer("12", one)).toBeNull();
    // No recommended option: an affirmative is not bound; a number still is.
    expect(bindTarsShortAnswer("응", [view({ recommended: null })])).toBeNull();
    expect(bindTarsShortAnswer("1", [view({ recommended: null })])).toMatchObject({ optionIndex: 0 });
    // Several waiting, or none: never bound.
    expect(bindTarsShortAnswer("1", [view({}), view({ id: "ask:n:0" })])).toBeNull();
    expect(bindTarsShortAnswer("yes", [])).toBeNull();
  });
  test("only answerable decisions count: invalid, answered or unchecked ones never bind", () => {
    const views = [view({}), view({ id: "x", state: "invalid" }), view({ id: "y", state: "answered" }), view({ id: "z", checked: false })];
    expect(selectAnswerableTarsDecisions(views).map((entry) => entry.id)).toEqual(["ask:m:0"]);
    expect(bindTarsShortAnswer("yes", selectAnswerableTarsDecisions(views))).toMatchObject({ decision: { id: "ask:m:0" }, optionIndex: 1 });
  });
});

describe("Fleet and tray parity for every decision kind", () => {
  test("an ask and an unverified completion are Fleet decision rows with Open in Tars, counted once each in the tray", async () => {
    const f = fixture();
    const paused = f.responsibility("paused");
    const unverified = f.responsibility("blocked", { detail: "Reported without a verified check.", detailCode: "unverifiedCompletion" });
    const proposal = f.responsibility("paused");
    f.queue.push({ reply: "Choose.", actions: [
      { kind: "control", responsibilityId: proposal.id, expectedRevision: proposal.revision, operation: "resume" },
      ask([{ label: "Resume", rationale: "Ready.", effect: { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "resume" } }, reply("Wait")]),
    ] });
    await f.send("What needs me?");
    const snapshot = f.responsibilities.snapshot();
    expect(snapshot.pendingDecisions.map((decision) => decision.kind ?? "confirm").sort()).toEqual(["ask", "confirm", "unverifiedCompletion"]);
    const signals = collectTarsAttention(snapshot);
    // Stave's decision speaks for the blocked work: no second, blocked row.
    expect(signals.map((signal) => signal.kind)).toEqual(["tars-decision", "tars-decision", "tars-decision"]);
    const projection = buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [], prWorkspaces: [], tarsAttention: signals });
    const rows = projection.items.filter((item) => item.kind === "tars-decision");
    expect(rows).toHaveLength(3);
    // Only the single-action proposal carries what Confirm applies; the others open Tars.
    expect(rows.filter((item) => item.tarsDecision).map((item) => item.tarsResponsibilityId)).toEqual([proposal.id]);
    expect(rows.find((item) => item.tarsResponsibilityId === paused.id)!.detail).toBe("Tars asks: How should the release check continue?");
    expect(rows.find((item) => item.tarsResponsibilityId === unverified.id)!.detail).toContain("Stave could not verify");
    const tray = buildTarsTray({ responsibilities: snapshot.responsibilities, attentionItems: projection.items, runs: {}, pendingDecisions: snapshot.pendingDecisions });
    expect(tray.counts.needsYou).toBe(3);
    // A question about no work stays in the conversation only.
    const g = fixture([{ reply: "Choose.", actions: [ask([reply("A"), reply("B")])] }]);
    await g.send("Help me decide");
    expect(g.responsibilities.snapshot().pendingDecisions).toEqual([]);
    expect(selectAnswerableTarsDecisions(g.decisions())).toHaveLength(1);
  });
});

describe("review follow-ups", () => {
  const control = (row: TarsResponsibility, operation: "resume" | "cancel" | "pause"): TarsDecisionAction =>
    ({ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation });

  test("a short answer never binds to a decision of an older message once the user said something after it", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.queue.push({ reply: "Confirm to cancel.", actions: [control(row, "cancel")] });
    await f.send("Cancel it");
    // Bound while it is the newest message: an explicit number names the cancel.
    expect(bindTarsShortAnswer("1", selectAnswerableTarsDecisions(f.decisions()))).toMatchObject({ optionIndex: 0 });
    await f.send("Actually, what is it doing now?");
    const answerable = selectAnswerableTarsDecisions(f.decisions());
    // The user moved on: the proposal no longer waits, and words go to Tars as a message.
    expect(f.decisions().find((view) => view.kind === "confirm")).toMatchObject({ state: "retired", why: "movedOn" });
    expect(answerable).toEqual([]);
    for (const word of ["1", "응", "yes"]) expect(bindTarsShortAnswer(word, answerable)).toBeNull();
  });

  test("irreversible effects are never a default: no recommended option, no Enter, no affirmative", async () => {
    const parsed = parseTarsDecisionOutput(JSON.stringify({ reply: "Choose.", actions: [ask([
      { label: "Cancel it", rationale: "Not needed.", effect: { kind: "control", responsibilityId: "goal", expectedRevision: 2, operation: "cancel" } }, reply("Keep it")], 0)] }));
    // The question is kept; only the recommendation of the cancel is dropped.
    expect(parsed.actions[0]).toMatchObject({ kind: "ask", options: [{ label: "Cancel it" }, { label: "Keep it" }] });
    expect(parsed.actions[0]).not.toHaveProperty("recommended");
    const f = fixture();
    const paused = f.responsibility("paused");
    const blocked = f.responsibility("blocked", { detail: "Unverified.", detailCode: "unverifiedCompletion" });
    f.queue.push({ reply: "Confirm.", actions: [control(paused, "cancel"), { kind: "control", responsibilityId: blocked.id, expectedRevision: blocked.revision, operation: "resume" }] });
    await f.send("Cancel the paused one");
    const views = f.decisions();
    const cancel = views.find((view) => view.kind === "confirm" && view.options[0]?.kind === "control" && view.options[0].control.operation === "cancel")!;
    expect(cancel.recommended).toBeNull();
    expect(tarsDecisionKeyChoice("Enter", cancel, null)).toBeNull();
    expect(tarsDecisionKeyChoice("1", cancel, null)).toBe(0);
    let chosen: number | null = null;
    handleTarsDecisionKey({ key: "Enter", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: null, preventDefault() {} }, cancel, (index) => { chosen = index; });
    expect(chosen).toBeNull();
    // Even a saved recommendation of an irreversible option never binds to "yes"; a number naming it still does.
    const raw = { ...cancel, recommended: 0, latest: true };
    expect(bindTarsShortAnswer("yes", [raw])).toBeNull();
    expect(bindTarsShortAnswer("1", [raw])).toMatchObject({ optionIndex: 0 });
  });

  test("answering one responsibility's proposal retires only that responsibility's alternatives, and a stale Fleet row cannot confirm a retired one", async () => {
    const f = fixture();
    const first = f.responsibility("paused");
    const second = f.responsibility("paused");
    f.queue.push({ reply: "Resume both, or cancel the first.", actions: [control(first, "resume"), control(first, "cancel"), control(second, "resume")] });
    const message = await f.send("Continue them");
    await f.service.answerDecision({ decisionId: tarsConfirmationRequestId(message.id, 0), optionIndex: 0, source: "click" });
    await f.runtime.drain();
    expect(f.decisions().map((view) => [view.actionIndex, view.state, view.why])).toEqual([[0, "answered", null], [1, "retired", "settled"], [2, "waiting", null]]);
    expect(f.responsibilities.snapshot().pendingDecisions.map((decision) => decision.responsibilityId)).toEqual([second.id]);
    const stale = await actTars({ requestId: tarsConfirmationRequestId(message.id, 1), responsibilityId: first.id, expectedRevision: first.revision,
      operation: "cancel", source: "fleet" }, { conversations: f.conversations, runtime: f.runtime, now: () => NOW });
    expect(stale.record).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.responsibilities.get(first.id)!.state).not.toBe("cancelled");
  });

  test("one message is asked again at most once, however many of its decisions became invalid", async () => {
    const f = fixture();
    const first = f.responsibility("paused");
    const second = f.responsibility("paused");
    f.queue.push({ reply: "Choose.", actions: [control(second, "resume"),
      ask([{ label: "Resume", rationale: "Ready.", effect: { kind: "control", responsibilityId: first.id, expectedRevision: first.revision, operation: "resume" } }, reply("Wait")])] });
    await f.send("What now?");
    for (const row of [first, second]) await actTars({ requestId: `tray-${row.id}`, responsibilityId: row.id, expectedRevision: row.revision, operation: "takeover", source: "click" },
      { conversations: f.conversations, runtime: f.runtime, now: () => NOW });
    f.service.wake(); await f.service.whenIdle();
    f.service.wake(); await f.service.whenIdle();
    expect(f.conversations.list(100).filter((entry) => entry.origin?.kind === "reask")).toHaveLength(1);
  });

  test("an answer refused for a reason that leaves the decision open stays answerable and records the attempt", async () => {
    const f = fixture();
    const row = f.responsibility("blocked", { detail: "Unverified.", detailCode: "unverifiedCompletion" });
    const decisionId = tarsUnverifiedDecisionId(row.id, row.revision);
    f.flags.failRun = true;
    const refused = await f.service.answerDecision({ decisionId, optionIndex: 1, source: "click" });
    expect(refused.answer).toMatchObject({ status: "rejected", reason: "unknown" });
    const view = f.decisions().find((entry) => entry.id === decisionId)!;
    expect(view).toMatchObject({ state: "waiting", answer: null, failure: { optionIndex: 1, status: "rejected" } });
    expect(f.responsibilities.snapshot().pendingDecisions).toHaveLength(1);
    // Another option is a new attempt under its own request id.
    f.flags.failRun = false;
    const accepted = await f.service.answerDecision({ decisionId, optionIndex: 0, source: "key" });
    await f.runtime.drain();
    expect(accepted.answer).toMatchObject({ status: "applied", attempt: 2, actRequestId: `answer:${decisionId}:2` });
    expect(f.responsibilities.get(row.id)!.state).toBe("completed");
    // A refusal because the work changed is final.
    const g = fixture();
    const moved = g.responsibility("blocked", { detail: "Unverified.", detailCode: "unverifiedCompletion" });
    const movedId = tarsUnverifiedDecisionId(moved.id, moved.revision);
    g.responsibilities.patch(moved.id, moved.revision, { priority: 60 }, NOW);
    expect((await g.service.answerDecision({ decisionId: movedId, optionIndex: 0, source: "click" })).refusal).toBe("notWaiting");
  });

  test("an answer whose host delivery keeps failing never holds up the user's queued messages", async () => {
    const f = fixture();
    const row = f.responsibility("blocked", { detail: "Unverified.", detailCode: "unverifiedCompletion" });
    f.flags.failAct = true;
    await expect(f.service.answerDecision({ decisionId: tarsUnverifiedDecisionId(row.id, row.revision), optionIndex: 0, source: "click" })).rejects.toThrow();
    expect(f.conversations.listPendingAnswers()).toHaveLength(1);
    await f.send("Meanwhile, summarize my work");
    expect(f.conversations.list(100).at(-1)).toMatchObject({ text: "Meanwhile, summarize my work", state: "answered" });
    expect(f.errors.some((error) => error instanceof Error && error.message.includes("did not answer"))).toBe(true);
  });
});

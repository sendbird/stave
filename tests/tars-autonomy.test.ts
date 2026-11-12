import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { buildTarsPlannerPrompt, tarsPlannerGuard } from "../electron/main/tars-planner";
import { applyTarsDecision, confirmTarsProposal } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import {
  TARS_CONFIRMED_OPERATIONS, TARS_IRREVERSIBLE_OPERATIONS, TarsActionReceiptSchema, TarsConversationSettingsSchema, tarsConfirmationRequestId,
  type TarsConversationSettings, type TarsDecision, type TarsDecisionAction, type TarsMessageOrigin,
} from "../src/lib/tars/conversation";
import {
  TARS_ACTION_KEYS, TARS_ALWAYS_CONFIRMED, TARS_AUTONOMY_LEVELS, TARS_DEFAULT_AUTONOMY, matchTarsNeverRules, tarsActionDisposition, tarsActionMode,
  tarsAutonomySummary, tarsEffectiveAutonomy, type TarsActionKey, type TarsAutonomyLevel,
} from "../src/lib/tars/autonomy";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { TarsControlOperationSchema, type TarsControlOperation, type TarsResponsibility, type TarsState } from "../src/lib/tars/types";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { SETTINGS, testContext } from "./tars-test-context";
import { tarsPlannerClock } from "../src/lib/tars/schedules";

const NOW = "2026-11-05T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

const REGISTRY = [{ repositoryPath: "/tmp/billing", repositoryName: "billing", workspaces: [{ id: "source", name: "Source", updatedAt: NOW }],
  workspaceBranchById: { source: "production" } }] as unknown as PersistenceRepositoryRegistryEntry[];
const delegate = (title = "Repair search"): TarsDecisionAction => ({ kind: "delegate", workspaceId: "source", title,
  instruction: "Repair search and verify it.", acceptanceCriteria: ["Search finds the item."], priority: 50 });

/**
 * The real stores, host runtime, host admission and conversation service on
 * one in-memory database. Only the model's replies and the run port (what a
 * control does to the execution run) are simulated.
 */
function fixture(settings: Partial<TarsConversationSettings> = {}, replies: TarsDecision[] = []) {
  const database = new Database(":memory:");
  cleanup.push(() => { if (!database.closed) database.close(); });
  const conversations = new TarsConversationStore(database);
  conversations.configure({ ...SETTINGS, ...settings });
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  const runControls: string[] = [];
  const prompts: string[] = [];
  const queue = [...replies];
  const runtime = createTarsRuntime({ store: responsibilities, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { runControls.push(operation); } });
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      prompts.push(request.input.prompt);
      const text = JSON.stringify(queue.shift() ?? { reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
        status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2,
        outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  let ticks = 0;
  const ports = { conversations, responsibilities, readRegistry: () => REGISTRY, requestTick: () => { ticks++; runtime.requestTick(); }, control: runtime.act, now: () => NOW };
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities, REGISTRY),
    applyDecision: (input) => applyTarsDecision(input, ports),
    act: (input) => actTars(input, { conversations, runtime, now: () => NOW }),
    confirmProposal: (input) => confirmTarsProposal(input, ports),
    retryDelaysMs: [60_000],
  });
  service.start();
  let made = 0;
  const responsibility = (state: TarsState, patch: Partial<TarsResponsibility> = {}) => {
    const row = responsibilities.create({ requestId: `responsibility-${made++}`, title: "Release check", instruction: "Verify the release.",
      acceptanceCriteria: ["Checks pass"], workspaceId: "source", repositoryPath: "/tmp/billing", providerId: "codex" }, NOW);
    return state === "queued" && !Object.keys(patch).length ? row
      : responsibilities.patch(row.id, row.revision, { state, taskId: `tars-${row.id}`, executionWorkspaceId: "execution", agentRunId: `run-${row.id}`, ...patch }, NOW);
  };
  /** A saved, answered message with this decision, admitted by the host; `origin` makes it one Tars started by itself. */
  const admit = async (actions: TarsDecisionAction[], origin?: TarsMessageOrigin, text = "Do what I asked.") => {
    const queued = conversations.create({ requestId: origin ? `followup:event-${made++}` : `message-${made++}`, text }, NOW, undefined, origin);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Here is what I propose.", actions }, NOW);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports);
    await runtime.drain();
    return { message, receipts };
  };
  const send = async (text: string) => {
    const message = service.sendMessage({ requestId: `message-${made++}`, text });
    await service.whenIdle(); await runtime.drain();
    return message;
  };
  const decisions = () => projectTarsDecisions({ messages: conversations.list(100), receipts: conversations.list(100).flatMap((message) => conversations.listReceipts(message.id)),
    records: conversations.listActions(100), answers: conversations.listAnswers(100), activity: responsibilities.listActivity(100),
    responsibilities: responsibilities.snapshot().responsibilities });
  return { database, conversations, responsibilities, runtime, service, ports, runControls, prompts, responsibility, admit, send, decisions, ticks: () => ticks };
}

/** What the host did with every action kind before autonomy levels existed, written out by hand. */
const BEFORE_LEVELS: Readonly<Partial<Record<TarsActionKey, "auto" | "confirm">>> = {
  show: "auto", delegate: "auto", reprioritize: "auto", startNow: "auto", pause: "auto", takeover: "auto", deny: "auto",
  resume: "confirm", extend: "confirm", retryStage: "confirm", handBack: "confirm", signOff: "confirm", answer: "confirm", message: "confirm",
  requestChanges: "confirm", clear: "confirm", cancel: "confirm", skipStage: "confirm", acceptCompletion: "confirm", approve: "confirm", publish: "confirm",
};

describe("the autonomy policy table", () => {
  test("covers every action the planner can propose", () => {
    expect([...TARS_ACTION_KEYS].sort()).toEqual([...TarsControlOperationSchema.options, "show", "delegate", "reprioritize", "publish", "clear", "workspaceEdit", "workspaceReplace"].sort());
  });

  test.each((Object.keys(BEFORE_LEVELS) as TarsActionKey[]).map((key) => [key] as const))("the default level treats %s exactly as before levels existed", (key) => {
    expect(TARS_DEFAULT_AUTONOMY).toBe("balanced");
    expect(tarsActionMode(key, "balanced")).toBe(BEFORE_LEVELS[key]);
    // An absent or unknown level is the default, never something looser.
    expect(tarsActionMode(key, undefined)).toBe(BEFORE_LEVELS[key]);
    expect(tarsActionMode(key, "unrestricted" as TarsAutonomyLevel)).toBe(BEFORE_LEVELS[key]);
  });

  test("the confirmed and irreversible control sets are the ones the default level reads", () => {
    for (const operation of TarsControlOperationSchema.options)
      expect(tarsActionMode(operation, "balanced") === "confirm").toBe(TARS_CONFIRMED_OPERATIONS.has(operation));
    expect([...TARS_ALWAYS_CONFIRMED].sort()).toEqual([...TARS_IRREVERSIBLE_OPERATIONS, "publish"].sort());
  });

  test("careful adds a confirmation to starting and reordering work, and to nothing that stops Tars", () => {
    const added = TARS_ACTION_KEYS.filter((key) => tarsActionMode(key, "careful") !== tarsActionMode(key, "balanced"));
    expect(added).toEqual(["workspaceReplace", "delegate", "reprioritize", "startNow"]);
    for (const key of added) expect(tarsActionMode(key, "careful")).toBe("confirm");
    for (const key of ["show", "pause", "takeover", "deny"] as const) expect(tarsActionMode(key, "careful")).toBe("auto");
  });

  test("hands-off applies only resume, more steps and a retry, and only for the user's own message", () => {
    const loosened = TARS_ACTION_KEYS.filter((key) => tarsActionMode(key, "handsOff") !== tarsActionMode(key, "balanced"));
    expect(loosened).toEqual(["resume", "extend", "retryStage"]);
    for (const key of TARS_ACTION_KEYS) expect(tarsActionMode(key, "handsOff", "automatic")).toBe(tarsActionMode(key, "balanced", "automatic"));
  });

  test.each(TARS_AUTONOMY_LEVELS.map((level) => [level] as const))("at %s every irreversible action and publishing still waits for the user", (level) => {
    for (const key of [...TARS_IRREVERSIBLE_OPERATIONS, "publish"] as TarsActionKey[]) {
      expect(tarsActionMode(key, level, "user")).toBe("confirm");
      expect(tarsActionMode(key, level, "automatic")).toBe("confirm");
    }
    // No level makes anything apply at once that the default confirms, except hands-off's three.
    const summary = tarsAutonomySummary(level);
    expect([...summary.auto, ...summary.confirm].sort()).toEqual([...TARS_ACTION_KEYS].sort());
  });

  test("the level one decision is admitted at is the more careful of the saved one and the message's copy", () => {
    expect(tarsEffectiveAutonomy("careful", "handsOff")).toBe("careful");
    expect(tarsEffectiveAutonomy("handsOff", "careful")).toBe("careful");
    expect(tarsEffectiveAutonomy("handsOff", "handsOff")).toBe("handsOff");
    expect(tarsEffectiveAutonomy(undefined, "handsOff")).toBe("balanced");
    expect(tarsEffectiveAutonomy("handsOff", undefined)).toBe("balanced");
  });
});

describe("autonomy settings contract", () => {
  test("existing settings without a level parse and mean the default; unknown levels and fields are refused", () => {
    expect(TarsConversationSettingsSchema.parse(SETTINGS)).toEqual(SETTINGS);
    expect(TarsConversationSettingsSchema.safeParse({ ...SETTINGS, autonomy: "handsOff", neverDo: ["never touch production"] }).success).toBe(true);
    expect(TarsConversationSettingsSchema.safeParse({ ...SETTINGS, autonomy: "unrestricted" }).success).toBe(false);
    expect(TarsConversationSettingsSchema.safeParse({ ...SETTINGS, autonomy: "handsOff", confirmIrreversible: false }).success).toBe(false);
    expect(TarsConversationSettingsSchema.safeParse({ ...SETTINGS, neverDo: ["same", "Same"] }).success).toBe(false);
    expect(TarsConversationSettingsSchema.safeParse({ ...SETTINGS, neverDo: Array.from({ length: 13 }, (_, index) => `rule ${index}`) }).success).toBe(false);
  });

  test("a profile saved before levels existed reads back unchanged, and the store refuses an unknown level", () => {
    const f = fixture();
    expect(f.conversations.getSettings()).toEqual(SETTINGS);
    expect(() => f.conversations.configure({ ...SETTINGS, autonomy: "unrestricted" })).toThrow();
    expect(() => f.service.configureConversation({ ...SETTINGS, autonomy: "handsOff", skipConfirmation: true })).toThrow();
    expect(f.conversations.getSettings()).toEqual(SETTINGS);
  });

  test("a receipt may wait as a proposal for any act except a view and the controls that only reduce what Tars does", () => {
    const receipt = (action: TarsDecisionAction) => TarsActionReceiptSchema.safeParse({ messageId: "m", actionIndex: 0, requestHash: "a".repeat(64), action,
      status: "proposed", responsibilityId: null, error: null, reason: null, revision: 1, createdAt: NOW, updatedAt: NOW }).success;
    const control = (operation: TarsControlOperation): TarsDecisionAction => ({ kind: "control", responsibilityId: "r", expectedRevision: 1, operation,
      ...(operation === "deny" ? { input: { requestRef: "ref" } } : {}) });
    expect(receipt(delegate())).toBe(true);
    expect(receipt(control("startNow"))).toBe(true);
    expect(receipt(control("pause"))).toBe(false);
    expect(receipt(control("takeover"))).toBe(false);
    expect(receipt(control("deny"))).toBe(false);
    expect(receipt({ kind: "show", responsibilityId: "r", view: "report" })).toBe(false);
  });
});

describe("host admission by autonomy level", () => {
  test("at the default level the host applies and holds what it did before levels existed", async () => {
    const f = fixture();
    const queued = f.responsibility("queued");
    const paused = f.responsibility("paused");
    const running = f.responsibility("running");
    const { receipts } = await f.admit([
      delegate(),
      { kind: "reprioritize", responsibilityId: queued.id, expectedRevision: queued.revision, priority: 80 },
      { kind: "control", responsibilityId: running.id, expectedRevision: running.revision, operation: "pause" },
      { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "resume" },
      { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "cancel" },
      { kind: "show", responsibilityId: running.id, view: "report" },
    ]);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied", "applied", "applied", "proposed", "proposed", "applied"]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(4);
    expect(f.responsibilities.get(queued.id)).toMatchObject({ priority: 80 });
    expect(f.responsibilities.get(running.id)).toMatchObject({ state: "paused" });
    expect(f.responsibilities.get(paused.id)).toMatchObject({ state: "paused" });
  });

  test("careful holds new work, a priority change and starting queued work as proposals; a view still opens", async () => {
    const f = fixture({ autonomy: "careful" });
    const queued = f.responsibility("queued");
    const running = f.responsibility("running");
    const { message, receipts } = await f.admit([
      delegate(),
      { kind: "reprioritize", responsibilityId: queued.id, expectedRevision: queued.revision, priority: 80 },
      { kind: "control", responsibilityId: queued.id, expectedRevision: queued.revision, operation: "startNow" },
      { kind: "show", responsibilityId: running.id, view: "changes" },
    ]);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["proposed", "proposed", "proposed", "applied"]);
    // Nothing that changes work happened: no new work, same priority, still queued, and the queue was not woken.
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(2);
    expect(f.responsibilities.get(queued.id)).toMatchObject({ priority: queued.priority, state: "queued", revision: queued.revision });
    expect(f.ticks()).toBe(0);
    // Each held action is a decision card waiting for the user.
    const waiting = f.decisions().filter((view) => view.state === "waiting");
    expect(waiting.map((view) => [view.id, view.kind, view.options[0]?.kind])).toEqual([
      [tarsConfirmationRequestId(message.id, 0), "confirm", "proposal"],
      [tarsConfirmationRequestId(message.id, 1), "confirm", "proposal"],
      [tarsConfirmationRequestId(message.id, 2), "confirm", "control"],
    ]);
    // The snapshot lists the held control like any other proposed control (the tray and Fleet read it).
    expect(f.responsibilities.snapshot().pendingDecisions).toMatchObject([{ responsibilityId: queued.id, operation: "startNow", actionIndex: 2 }]);
  });

  test.each(TARS_AUTONOMY_LEVELS.map((level) => [level] as const))("at %s pausing, taking over and denying a request apply at once", async (level) => {
    const f = fixture({ autonomy: level });
    const running = f.responsibility("running");
    expect((await f.admit([{ kind: "control", responsibilityId: running.id, expectedRevision: running.revision, operation: "pause" }])).receipts).toMatchObject([{ status: "applied" }]);
    expect(f.responsibilities.get(running.id)).toMatchObject({ state: "paused" });
    const other = f.responsibility("running");
    expect((await f.admit([{ kind: "control", responsibilityId: other.id, expectedRevision: other.revision, operation: "takeover" }])).receipts).toMatchObject([{ status: "applied" }]);
    expect(f.responsibilities.get(other.id)).toMatchObject({ state: "takenOver" });
    expect(tarsActionMode("deny", level)).toBe("auto");
  });

  test("confirming a held delegation starts exactly that saved work, once", async () => {
    const f = fixture({ autonomy: "careful" });
    const { message } = await f.admit([delegate("Repair search")]);
    const id = tarsConfirmationRequestId(message.id, 0);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(0);
    const answered = await f.service.answerDecision({ decisionId: id, optionIndex: 0, source: "click" });
    expect(answered).toMatchObject({ refusal: null, answer: { status: "applied", effect: { kind: "proposal" } } });
    const rows = f.responsibilities.snapshot().responsibilities;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Repair search", workspaceId: "source", repositoryPath: "/tmp/billing", requestId: `tars-message:${message.id}:0` });
    expect(f.conversations.getReceipt(message.id, 0)).toMatchObject({ status: "applied", responsibilityId: rows[0]!.id });
    expect(f.decisions().find((view) => view.id === id)).toMatchObject({ state: "answered" });
    // A repeated confirmation, by the card or straight at the host, starts nothing more.
    await f.service.answerDecision({ decisionId: id, optionIndex: 0, source: "click" });
    expect(await confirmTarsProposal({ messageId: message.id, actionIndex: 0 }, f.ports)).toMatchObject({ status: "applied" });
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  });

  test("confirming a held priority change applies the saved priority; a moved target refuses it", async () => {
    const f = fixture({ autonomy: "careful" });
    const queued = f.responsibility("queued");
    const other = f.responsibility("queued");
    const { message } = await f.admit([
      { kind: "reprioritize", responsibilityId: queued.id, expectedRevision: queued.revision, priority: 90 },
      { kind: "reprioritize", responsibilityId: other.id, expectedRevision: other.revision, priority: 10 },
    ]);
    expect(await confirmTarsProposal({ messageId: message.id, actionIndex: 0 }, f.ports)).toMatchObject({ status: "applied", responsibilityId: queued.id });
    expect(f.responsibilities.get(queued.id)).toMatchObject({ priority: 90 });
    // The other work moved on before its confirmation: the host's own check refuses it and nothing changes.
    f.responsibilities.patch(other.id, other.revision, { priority: 55 }, NOW);
    expect(await confirmTarsProposal({ messageId: message.id, actionIndex: 1 }, f.ports)).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.responsibilities.get(other.id)).toMatchObject({ priority: 55 });
  });

  test("confirming a held control takes the click path and applies it", async () => {
    const f = fixture({ autonomy: "careful" });
    const queued = f.responsibility("queued");
    const { message } = await f.admit([{ kind: "control", responsibilityId: queued.id, expectedRevision: queued.revision, operation: "startNow" }]);
    expect(f.responsibilities.get(queued.id)).toMatchObject({ state: "queued", revision: queued.revision });
    const answered = await f.service.answerDecision({ decisionId: tarsConfirmationRequestId(message.id, 0), optionIndex: 0, source: "click" });
    expect(answered).toMatchObject({ refusal: null, answer: { status: "applied" } });
    expect(f.conversations.getReceipt(message.id, 0)).toMatchObject({ status: "applied" });
    expect(f.responsibilities.get(queued.id)!.revision).toBeGreaterThan(queued.revision);
  });

  test("a confirmation cannot name anything but a held work proposal", async () => {
    const f = fixture({ autonomy: "careful" });
    const paused = f.responsibility("paused");
    const { message } = await f.admit([{ kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "cancel" }]);
    // A control proposal is confirmed only through the click path; this path refuses it and unknown or extra input.
    await expect(confirmTarsProposal({ messageId: message.id, actionIndex: 0 }, f.ports)).rejects.toThrow("held work proposal");
    await expect(confirmTarsProposal({ messageId: message.id, actionIndex: 5 }, f.ports)).rejects.toThrow();
    await expect(confirmTarsProposal({ messageId: message.id, actionIndex: 0, action: delegate() }, f.ports)).rejects.toThrow();
    expect(f.responsibilities.get(paused.id)).toMatchObject({ state: "paused" });
  });

  test("hands-off applies the user's resume, more steps and retry at once and leaves an applied record of each", async () => {
    const f = fixture({ autonomy: "handsOff" });
    // One message each: a run command is bound to the revision the user saw, and each applied control moves the queue.
    for (const [state, operation] of [["paused", "resume"], ["blocked", "retryStage"], ["waiting", "extend"]] as const) {
      const row = f.responsibility(state);
      const { message, receipts } = await f.admit([{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation }]);
      expect(receipts).toMatchObject([{ status: "applied", responsibilityId: row.id, action: { operation } }]);
      // The record the conversation shows: an applied receipt for the action.
      expect(f.conversations.listReceipts(message.id).map((receipt) => receipt.status)).toEqual(["applied"]);
    }
    expect(f.runControls).toEqual(["resume", "retryStage", "extend"]);
    // No card waits for any of them.
    expect(f.decisions().filter((view) => view.state === "waiting")).toHaveLength(0);
  });

  test("hands-off leaves every other confirmed control as a proposal", async () => {
    const f = fixture({ autonomy: "handsOff" });
    const others: TarsControlOperation[] = ["cancel", "skipStage", "signOff", "message", "requestChanges"];
    const rows = others.map(() => f.responsibility("blocked"));
    const taken = f.responsibility("takenOver");
    const unverified = f.responsibility("blocked", { detailCode: "unverifiedCompletion" });
    const { receipts } = await f.admit([
      ...others.map((operation, index): TarsDecisionAction => ({ kind: "control", responsibilityId: rows[index]!.id, expectedRevision: rows[index]!.revision, operation,
        ...(operation === "message" || operation === "requestChanges" ? { input: { text: "Use the existing index." } } : {}) })),
      { kind: "control", responsibilityId: taken.id, expectedRevision: taken.revision, operation: "handBack" },
      { kind: "control", responsibilityId: unverified.id, expectedRevision: unverified.revision, operation: "acceptCompletion" },
    ]);
    expect(receipts.map((receipt) => receipt.status)).toEqual(Array.from({ length: 7 }, () => "proposed"));
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.get(unverified.id)).toMatchObject({ state: "blocked" });
    expect(f.responsibilities.get(taken.id)).toMatchObject({ state: "takenOver" });
  });

  test.each(TARS_AUTONOMY_LEVELS.map((level) => [level] as const))("at %s cancel, skip, accept and approve are held, and publishing waits on its card", async (level) => {
    const f = fixture({ autonomy: level });
    const blocked = f.responsibility("blocked");
    const second = f.responsibility("blocked");
    const unverified = f.responsibility("blocked", { detailCode: "unverifiedCompletion" });
    const asking = f.responsibility("waiting", { pendingRequests: [{ kind: "approval", ref: "approval-ref", requestId: "request", messageId: "task-message",
      taskId: "task", workspaceId: "execution", toolName: "Bash", summary: "rm -rf build" }] });
    const done = f.responsibility("completed");
    const { receipts } = await f.admit([
      { kind: "control", responsibilityId: blocked.id, expectedRevision: blocked.revision, operation: "cancel" },
      { kind: "control", responsibilityId: second.id, expectedRevision: second.revision, operation: "skipStage" },
      { kind: "control", responsibilityId: unverified.id, expectedRevision: unverified.revision, operation: "acceptCompletion" },
      { kind: "control", responsibilityId: asking.id, expectedRevision: asking.revision, operation: "approve", input: { requestRef: "approval-ref" } },
      { kind: "publish", responsibilityId: done.id, expectedRevision: done.revision },
    ]);
    expect(receipts.slice(0, 4).map((receipt) => receipt.status)).toEqual(["proposed", "proposed", "proposed", "proposed"]);
    // Publishing is never applied by admission: it is held, or refused when the work could not publish.
    expect(receipts[4]!.status).not.toBe("applied");
    expect(f.runControls).toEqual([]);
    for (const row of [blocked, second, unverified, asking]) expect(f.responsibilities.get(row.id)).toMatchObject({ state: row.state, revision: row.revision });
  });

  test.each(TARS_AUTONOMY_LEVELS.map((level) => [level] as const))("at %s an automatic follow-up keeps today's restrictions", async (level) => {
    const f = fixture({ autonomy: level });
    const blocked = f.responsibility("blocked");
    const queued = f.responsibility("queued");
    const origin: TarsMessageOrigin = { kind: "followUp", eventKey: `blocked:${blocked.id}:1`, responsibilityId: blocked.id, reason: "blocked",
      observedRevision: blocked.revision, summary: "The run says it is blocked." };
    const { receipts } = await f.admit([
      { kind: "control", responsibilityId: blocked.id, expectedRevision: blocked.revision, operation: "resume" },
      { kind: "control", responsibilityId: blocked.id, expectedRevision: blocked.revision, operation: "retryStage" },
      delegate(),
      { kind: "reprioritize", responsibilityId: queued.id, expectedRevision: queued.revision, priority: 99 },
      { kind: "control", responsibilityId: queued.id, expectedRevision: queued.revision, operation: "startNow" },
      { kind: "control", responsibilityId: blocked.id, expectedRevision: blocked.revision, operation: "skipStage" },
    ], origin);
    // It may still only propose resume and a retry; hands-off never applies them for it.
    expect(receipts.map((receipt) => [receipt.status, receipt.reason])).toEqual([
      ["proposed", null], ["proposed", null], ["rejected", "notByFollowUp"], ["rejected", "notByFollowUp"], ["rejected", "notByFollowUp"], ["rejected", "notByFollowUp"],
    ]);
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(2);
    expect(f.responsibilities.get(queued.id)).toMatchObject({ priority: queued.priority, state: "queued" });
  });

  test("a message that claims a looser level than the saved settings is admitted at the saved one", async () => {
    const f = fixture({ autonomy: "handsOff" });
    const paused = f.responsibility("paused");
    // The message was saved while hands-off was on, so its own copy says hands-off.
    const queued = f.conversations.create({ requestId: "forged", text: "Continue it." }, NOW);
    expect(queued.autonomy).toBe("handsOff");
    // The user then chose careful. The copy the message carries no longer decides anything.
    f.conversations.configure({ ...SETTINGS, autonomy: "careful" });
    const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
    const message = f.conversations.answer(claimed.id, claimed.revision, { reply: "Continuing.", actions: [
      { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "resume" }, delegate()] }, NOW);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["proposed", "proposed"]);
    expect(f.runControls).toEqual([]);
    expect(f.responsibilities.get(paused.id)).toMatchObject({ state: "paused" });
    // The caller's input carries no level at all: anything beyond the message's identity is refused.
    await expect(applyTarsDecision({ messageId: message.id, expectedRevision: message.revision, autonomy: "handsOff" }, f.ports)).rejects.toThrow();
  });

  test("raising the level never reaches a message saved under a more careful one, and lowering it applies to the next decision", async () => {
    const f = fixture({ autonomy: "careful" });
    const paused = f.responsibility("paused");
    const queued = f.conversations.create({ requestId: "earlier", text: "Continue it." }, NOW);
    f.conversations.configure({ ...SETTINGS, autonomy: "handsOff" });
    const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
    const message = f.conversations.answer(claimed.id, claimed.revision, { reply: "Continuing.", actions: [
      { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "resume" }] }, NOW);
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).toMatchObject([{ status: "proposed" }]);
    // The next message, sent with hands-off saved, is admitted at it without a restart.
    const current = f.responsibilities.get(paused.id)!;
    const { receipts } = await f.admit([{ kind: "control", responsibilityId: current.id, expectedRevision: current.revision, operation: "resume" }]);
    expect(receipts).toMatchObject([{ status: "applied" }]);
    expect(f.runControls).toEqual(["resume"]);
  });
});

describe("the user's never-do rules", () => {
  test("a rule matches by the repository, a branch or the action it names, as whole words only", () => {
    const rules = ["Never touch the billing repository", "never touch production branches", "Never cancel work", "do not open a PR", "Keep the domain model"];
    expect(matchTarsNeverRules(rules, { key: "delegate", repository: "billing", branches: ["main"] }))
      .toEqual([{ rule: rules[0]!, why: "repository", value: "billing" }]);
    expect(matchTarsNeverRules(rules, { key: "resume", repository: "search", branches: [null, "production"] }))
      .toEqual([{ rule: rules[1]!, why: "branch", value: "production" }]);
    expect(matchTarsNeverRules(rules, { key: "cancel", repository: "search" })).toEqual([{ rule: rules[2]!, why: "action", value: "cancel" }]);
    expect(matchTarsNeverRules(rules, { key: "publish", repository: "search" })).toEqual([{ rule: rules[3]!, why: "action", value: "pr" }]);
    // `main` is not matched inside `domain`, and `pr` not inside `production`.
    expect(matchTarsNeverRules(rules, { key: "resume", repository: "search", branches: ["main"] })).toEqual([]);
    expect(matchTarsNeverRules(["main 브랜치는 건드리지 않기"], { key: "resume", repository: "search", branches: ["main"] })).toHaveLength(1);
    expect(matchTarsNeverRules([], { key: "delegate", repository: "billing" })).toEqual([]);
  });

  test("a rule only ever adds a confirmation and never delays a stop", () => {
    const matches = [{ rule: "never touch billing", why: "repository" as const, value: "billing" }];
    expect(tarsActionDisposition({ key: "delegate", level: "balanced", matches })).toBe("confirm");
    expect(tarsActionDisposition({ key: "resume", level: "handsOff", matches })).toBe("confirm");
    expect(tarsActionDisposition({ key: "delegate", level: "balanced", matches: [] })).toBe("auto");
    for (const key of ["pause", "takeover", "deny", "show"] as const) expect(tarsActionDisposition({ key, level: "balanced", matches })).toBe("auto");
    expect(tarsActionDisposition({ key: "cancel", level: "handsOff", matches: [] })).toBe("confirm");
  });

  test("the host holds a matching action even at the default level and saves the matched rule with the proposal", async () => {
    const f = fixture({ neverDo: ["Never touch production branches", "Never cancel work"] });
    const running = f.responsibility("running");
    const { message, receipts } = await f.admit([
      delegate(),
      { kind: "control", responsibilityId: running.id, expectedRevision: running.revision, operation: "cancel" },
      { kind: "control", responsibilityId: running.id, expectedRevision: running.revision, operation: "pause" },
    ]);
    // The delegation targets a workspace on the `production` branch: held, with the rule and the word that matched.
    expect(receipts[0]).toMatchObject({ status: "proposed", matchedRules: [{ rule: "Never touch production branches", why: "branch", value: "production" }] });
    expect(receipts[1]).toMatchObject({ status: "proposed", matchedRules: [{ rule: "Never cancel work", why: "action", value: "cancel" }] });
    // Pausing only reduces what Tars does: no rule delays it.
    expect(receipts[2]).toMatchObject({ status: "applied" });
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
    // The rule reaches the card through the decision the card renders.
    const cards = f.decisions().filter((view) => view.messageId === message.id);
    expect(cards.find((view) => view.actionIndex === 0)?.matchedRules).toEqual([{ rule: "Never touch production branches", why: "branch", value: "production" }]);
    expect(cards.find((view) => view.actionIndex === 1)?.matchedRules).toEqual([{ rule: "Never cancel work", why: "action", value: "cancel" }]);
    // A matched rule makes confirming an explicit choice: nothing is recommended, so Enter and "yes" never confirm it.
    expect(cards.map((view) => view.recommended)).toEqual([null, null]);
    // It asks first; it does not block: the user's confirmation still starts the work.
    expect(await confirmTarsProposal({ messageId: message.id, actionIndex: 0 }, f.ports)).toMatchObject({ status: "applied" });
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(2);
  });

  test("without rules and at the default level the planner prompt is exactly what it was", async () => {
    const f = fixture();
    const message = f.conversations.create({ requestId: "plain", text: "What is running?" }, NOW);
    // Both prompts describe the same instant; wall-clock drift is not a guard change.
    const context = { ...testContext(f.responsibilities, REGISTRY), clock: tarsPlannerClock(new Date(NOW), "UTC") };
    const plain = buildTarsPlannerPrompt(message, context, []);
    expect(buildTarsPlannerPrompt(message, { ...context, guard: tarsPlannerGuard(message, f.conversations.getSettings()) }, [])).toBe(plain);
    expect(plain).not.toContain("hardConstraints");
    expect(plain).not.toContain("The user set your autonomy level");
  });

  test("the level and the rules reach the planner as the host's own lists and as hard constraints", async () => {
    const f = fixture({ autonomy: "careful", neverDo: ["Never touch production branches"] }, [{ reply: "Noted.", actions: [] }]);
    await f.send("Fix the search page.");
    expect(f.prompts).toHaveLength(1);
    const prompt = f.prompts[0]!;
    expect(prompt).toContain("The user set your autonomy level to careful.");
    expect(prompt).toContain("hardConstraints lists rules the user wrote");
    const data = JSON.parse(prompt.split("\n\n").at(-1)!);
    expect(data.hardConstraints).toEqual(["Never touch production branches"]);
    expect(data.autonomy.level).toBe("careful");
    expect(data.autonomy.appliesAtOnce).toEqual(tarsAutonomySummary("careful").auto);
    expect(data.autonomy.waitsForConfirm).toEqual(tarsAutonomySummary("careful").confirm);
    expect(data.autonomy.waitsForConfirm).toEqual(expect.arrayContaining(["delegate", "startNow", "cancel", "publish"]));
  });

  test("a level saved after a message was sent already applies when that message is planned", async () => {
    const f = fixture({}, [{ reply: "Noted.", actions: [] }]);
    const message = f.conversations.create({ requestId: "before", text: "Fix the search page." }, NOW);
    f.conversations.configure({ ...SETTINGS, autonomy: "careful", neverDo: ["Never deploy on Fridays"] });
    expect(tarsPlannerGuard(message, f.conversations.getSettings())).toEqual({ level: "careful", neverDo: ["Never deploy on Fridays"] });
    f.service.wake(); await f.service.whenIdle();
    expect(JSON.parse(f.prompts[0]!.split("\n\n").at(-1)!)).toMatchObject({ autonomy: { level: "careful" }, hardConstraints: ["Never deploy on Fridays"] });
  });

  test("a follow-up is told the default lists whatever the level, so hands-off promises it nothing", async () => {
    const f = fixture({ autonomy: "handsOff" });
    const blocked = f.responsibility("blocked");
    const message = f.conversations.create({ requestId: `followup:blocked:${blocked.id}:1`, text: "Automatic follow-up." }, NOW, undefined,
      { kind: "followUp", eventKey: `blocked:${blocked.id}:1`, responsibilityId: blocked.id, reason: "blocked", observedRevision: blocked.revision, summary: "Blocked." });
    const prompt = buildTarsPlannerPrompt(message, { ...testContext(f.responsibilities, REGISTRY), guard: tarsPlannerGuard(message, f.conversations.getSettings()) }, []);
    const data = JSON.parse(prompt.split("\n\n").at(-1)!);
    expect(data.autonomy.waitsForConfirm).toEqual(expect.arrayContaining(["resume", "extend", "retryStage"]));
    expect(data.autonomy.appliesAtOnce).toEqual(tarsAutonomySummary("balanced").auto);
  });
});

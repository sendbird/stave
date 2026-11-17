import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { undoTarsAction } from "../electron/host-service/tars-action-undo";
import { admitTarsFollowUps } from "../electron/main/tars-follow-up";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { canUndoTarsAction } from "../src/lib/tars/action-undo";
import { tarsActionMode, TARS_AUTONOMY_LEVELS, tarsCanAutoExtend } from "../src/lib/tars/autonomy";
import type { TarsDecisionAction, TarsMessageOrigin } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { REGISTRY, SETTINGS, testContext } from "./tars-test-context";

const NOW = "2026-11-12T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture(level: typeof TARS_AUTONOMY_LEVELS[number] = "balanced") {
  const db = new Database(":memory:"); databases.push(db);
  const conversations = new TarsConversationStore(db), responsibilities = new TarsStore(db);
  conversations.configure({ ...SETTINGS, autonomy: level });
  const controls: string[] = [];
  let budget = 30, count = 0;
  const runtime = createTarsRuntime({ store: responsibilities, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async () => "run", observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { controls.push(operation); if (operation === "extend") budget += 10; },
    respondTask: async (_row, action) => { controls.push(action.operation); return "sent"; } });
  runtime.stop();
  const ports: TarsDecisionPorts = { conversations, responsibilities, readRegistry: () => REGISTRY,
    requestTick: () => {}, now: () => NOW, readRunBudget: () => ({ maxTurns: budget }),
    control: (action, ledger) => runtime.act(action, ledger) };
  const create = (patch: Partial<TarsResponsibility> = {}) => {
    const { completionGoal = "implementation", ...value } = patch;
    const row = responsibilities.create({ completionGoal, requestId: `work-${count++}`, title: "Repair search", instruction: "Repair and verify.",
      acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex", maxTurns: 30 }, NOW);
    return responsibilities.patch(row.id, row.revision, { state: "blocked", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run", ...value }, NOW);
  };
  const admit = async (action: TarsDecisionAction, automatic = false) => {
    const row = "responsibilityId" in action ? responsibilities.get(action.responsibilityId)! : null;
    const origin: TarsMessageOrigin | undefined = automatic && row ? { kind: "followUp", eventKey: `event-${count++}`,
      responsibilityId: row.id, observedRevision: row.revision, reason: row.state === "resultReady" ? "resultReady" : "blocked", summary: "Observed by host." } : undefined;
    const queued = conversations.create({ requestId: `message-${count++}`, text: "Continue the admitted work." }, NOW, undefined, origin);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Continuing.", actions: [action] }, NOW);
    return { message, receipts: await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports) };
  };
  const undo = (requestId: string) => undoTarsAction({ requestId, expectedRevision: conversations.getAction(requestId)!.revision }, {
    conversations, responsibilities, readRegistry: () => REGISTRY, serialize: runtime.serializeUndo,
    control: (action, ledger) => runtime.act(action, ledger), now: () => NOW });
  return { db, conversations, responsibilities, controls, runtime, ports, create, admit, undo, setBudget: (value: number) => { budget = value; } };
}

for (const level of TARS_AUTONOMY_LEVELS) for (const origin of ["user", "automatic"] as const) {
  test(`${level}/${origin}: extension reaches the fixed cap, then waits for a budget decision`, async () => {
    const f = fixture(level); f.setBudget(50);
    const row = f.create();
    const result = await f.admit({ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "extend" }, origin === "automatic");
    expect(result.receipts[0]?.status).toBe(level === "careful" ? "proposed" : "applied");
    if (level === "careful") return;
    const current = f.responsibilities.get(row.id)!;
    expect((await f.admit({ kind: "control", responsibilityId: row.id, expectedRevision: current.revision, operation: "extend" }, origin === "automatic")).receipts[0]?.status).toBe("proposed");
    expect(f.controls).toEqual(["extend"]);
  });
  test(`${level}/${origin}: only the verified original PR goal authorizes automatic publication`, () => {
    const row = fixture(level).create({ completionGoal: "pullRequest", state: "resultReady", resultVerifiedRunId: "run" });
    for (const goal of ["design", "implementation", "pullRequest", "merge", "confirmation"] as const) for (const verified of [false, true]) {
      const context = { responsibility: { ...row, completionGoal: goal, resultVerifiedRunId: verified ? "run" : "old-run" } };
      expect(tarsActionMode("publish", level, origin, context)).toBe(level !== "careful" && verified && (goal === "pullRequest" || goal === "merge") ? "auto" : "confirm");
    }
    for (const patch of [{ state: "completed" as const }, { executionPending: true }, { agentRunId: null }, { executionWorkspaceId: null }])
      expect(tarsActionMode("publish", level, origin, { responsibility: { ...row, ...patch } })).toBe("confirm");
  });
}

test("extension fails closed on unknown or invalid budgets and counts all previous extensions", () => {
  for (const budget of [undefined, null, { admittedMaxTurns: 0, currentMaxTurns: 10 }, { admittedMaxTurns: 30, currentMaxTurns: NaN },
    { admittedMaxTurns: 30, currentMaxTurns: 51 }, { admittedMaxTurns: 30, currentMaxTurns: 30, additionalTurns: 31 }]) expect(tarsCanAutoExtend(budget)).toBe(false);
  expect(tarsCanAutoExtend({ admittedMaxTurns: 30, currentMaxTurns: 50 })).toBe(true);
  expect(tarsCanAutoExtend({ admittedMaxTurns: 50, currentMaxTurns: 95 })).toBe(true);
  expect(tarsCanAutoExtend({ admittedMaxTurns: 50, currentMaxTurns: 100 })).toBe(false);
});

for (const operation of ["resume", "retryStage", "message", "requestChanges"] as const) {
  test(`automatic ${operation} leaves a durable record; only continuation can be paused by Undo`, async () => {
    const f = fixture(), row = f.create();
    const action = { kind: "control" as const, responsibilityId: row.id, expectedRevision: row.revision, operation,
      ...(["message", "requestChanges"].includes(operation) ? { input: { text: "Keep the existing API and verify the fix." } } : {}) };
    const { message, receipts } = await f.admit(action, true);
    expect(receipts[0]?.status).toBe("applied");
    const requestId = `auto:${message.id}:0`, record = f.conversations.getAction(requestId)!;
    expect(record).toMatchObject({ status: "applied", source: "automatic", action: { operation } });
    expect(new TarsConversationStore(f.db).getAction(requestId)).toEqual(record);
    expect(canUndoTarsAction(record)).toBe(operation === "resume" || operation === "retryStage");
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(f.controls).toEqual([operation]);
    if (operation === "message" || operation === "requestChanges") return;
    expect((await f.undo(requestId)).refusal).toBeNull();
    expect((await f.undo(requestId)).refusal).toBeNull();
    expect(f.controls).toEqual([operation, "pause"]);
    expect(f.responsibilities.get(row.id)?.state).toBe("paused");
    expect(f.conversations.getAction(requestId)?.undo?.undoneAt).toBe(NOW);
  });
}

test("Undo refuses a newer run state and never pauses a replacement run", async () => {
  const f = fixture(), row = f.create();
  const { message } = await f.admit({ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" }, true);
  const current = f.responsibilities.get(row.id)!;
  f.responsibilities.patch(row.id, current.revision, { agentRunId: "replacement" }, NOW);
  expect((await f.undo(`auto:${message.id}:0`)).refusal).toBe("stale");
  expect(f.controls).toEqual(["resume"]);
});

test("verified resultReady creates one follow-up which may propose publication immediately", () => {
  const f = fixture();
  const row = f.create({ completionGoal: "pullRequest", state: "resultReady", resultVerifiedRunId: "run" });
  const followUps = () => admitTarsFollowUps({ conversations: f.conversations, responsibilities: f.responsibilities,
    events: f.responsibilities.events, reaskable: () => new Map(), now: () => NOW });
  expect(followUps().created).toBe(1);
  expect(followUps().created).toBe(0);
  const message = f.conversations.list().find((entry) => entry.origin?.kind === "followUp")!;
  expect(message.origin).toMatchObject({ reason: "resultReady", responsibilityId: row.id });
  const prompt = buildTarsPlannerPrompt(message, testContext(f.responsibilities), []);
  expect(prompt).toContain("You may propose publish after resultReady verification");
  expect(prompt).toContain("Never delegate:");
  expect(prompt).not.toContain("Never propose publish");
});

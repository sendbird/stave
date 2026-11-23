import { describe, expect, test } from "bun:test";
import {
  countNeedsYouTasks,
  deriveTaskAttention,
  deriveWorkspaceAttention,
  detectAttentionTransitions,
  mapFleetAttentionKind,
  type TaskAttention,
  type TaskAttentionFacts,
  type TaskAttentionRequest,
  type TaskAttentionState,
  type TaskAttentionTransition,
} from "@/lib/attention/derive-task-attention";
import {
  taskAttentionFactsFromTurnActivity,
  taskAttentionFactsFromTurnReceipt,
  taskAttentionRequestFromPart,
} from "@/lib/attention/task-attention-fact-adapters";
import { FLEET_ATTENTION_PRIORITY, type FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { createTurnReceipt, type TurnTerminalReceipt } from "@/lib/providers/turn-terminal-receipt";
import type { ApprovalPart, UserInputPart } from "@/types/chat";

const earlier = "2026-11-22T08:00:00.000Z";
const since = "2026-11-22T09:00:00.000Z";
const later = "2026-11-22T10:00:00.000Z";
const activeTurnId = "turn-1";
const turn = { turnId: activeTurnId, since };
const liveOwner = { kind: "live-turn", turnId: activeTurnId } as const;
const hostOwner = { kind: "host-managed" } as const;

function request(
  kind: TaskAttentionRequest["kind"],
  overrides: Partial<TaskAttentionRequest> = {},
): TaskAttentionRequest {
  return { id: kind, kind, owner: hostOwner, since, ...overrides };
}

function pending(kind: TaskAttentionRequest["kind"]): TaskAttentionFacts {
  return { pendingRequests: [request(kind)] };
}

const kindCases = {
  "user-input": ["needs-you", pending("user-input")],
  approval: ["needs-you", pending("approval")],
  "agent-run-sign-off": ["needs-you", pending("agent-run-sign-off")],
  "agent-run-blocked": ["needs-you", pending("agent-run-blocked")],
  "agent-run-stuck": ["problem", { agentRunStuckAt: since }],
  "tars-decision": ["needs-you", pending("tars-decision")],
  "tars-blocked": ["needs-you", pending("tars-blocked")],
  "run-failed": ["problem", { turnFailure: turn }],
  "turn-stalled": ["problem", { activeTurnId, turnStall: turn }],
  "result-ready": ["done-unseen", { lastResultAt: since }],
  "pr-changes-requested": [null, {}],
  "pr-checks-failed": [null, {}],
  "pr-merge-conflict": [null, {}],
  "pr-behind-base": [null, {}],
  "pr-ready-to-merge": [null, {}],
} satisfies Record<FleetAttentionKind, [TaskAttentionState | null, TaskAttentionFacts]>;

describe("Fleet kind mapping", () => {
  test("covers the complete current Fleet priority list", () => {
    expect(Object.keys(kindCases).sort()).toEqual(Object.keys(FLEET_ATTENTION_PRIORITY).sort());
  });

  for (const kind of Object.keys(kindCases) as FleetAttentionKind[]) {
    test(kind, () => {
      const [state, facts] = kindCases[kind];
      expect(mapFleetAttentionKind(kind)).toEqual(state ? { state, reason: kind } : null);
      expect(deriveTaskAttention(facts)).toMatchObject({
        state: state ?? "idle",
        reason: state ? kind : null,
        since: state ? since : null,
      });
    });
  }
});

describe("task attention facts", () => {
  const ownerCases = [
    ["live resolver on the active turn", liveOwner, activeTurnId, "needs-you"],
    ["live resolver for an older turn", liveOwner, "turn-2", "working"],
    ["live resolver after the turn ends", liveOwner, null, "idle"],
    ["pending part without a resolver on the active turn", null, activeTurnId, "working"],
    ["orphaned synchronous part after restart", null, null, "idle"],
    ["host-managed request", hostOwner, null, "needs-you"],
    ["async question", { kind: "async" }, null, "needs-you"],
    ["persistent Agent Run question", { kind: "agent-run-persistent" }, null, "needs-you"],
    ["child request routed to its parent", { kind: "delegated-child", parentTaskId: "parent" }, null, "needs-you"],
    ["child request without a parent route", { kind: "delegated-child", parentTaskId: "" }, null, "idle"],
  ] satisfies Array<[string, TaskAttentionRequest["owner"], string | null, TaskAttentionState]>;

  test.each(ownerCases)("%s", (_label, owner, turnId, expected) => {
    const part = request("user-input", { owner });
    const attention = deriveTaskAttention({ activeTurnId: turnId, pendingRequests: [part] });
    expect(attention.state).toBe(expected);
    expect(attention.requests).toEqual(expected === "needs-you" ? [part] : []);
  });

  const factCases = [
    ["new result", { lastResultAt: since, lastSeenAt: earlier }, "done-unseen", "result-ready", since],
    ["result seen at the same instant", { lastResultAt: since, lastSeenAt: "2026-11-22T18:00:00+09:00" }, "idle", null, null],
    ["failure already seen", { turnFailure: turn, lastSeenAt: later }, "idle", null, null],
    ["seen Agent Run stall", { agentRunStuckAt: since, lastSeenAt: later }, "idle", null, null],
    ["turn stall already seen", { activeTurnId, turnStall: turn, lastSeenAt: later }, "working", "active-turn", null],
    ["turn stall supersedes active work", { activeTurnId, turnStall: turn, lastResultAt: earlier }, "problem", "turn-stalled", since],
    ["stall from another turn", { activeTurnId: "turn-2", turnStall: turn, activeTurnStartedAt: later }, "working", "active-turn", later],
    ["restart supersedes a failure", { activeTurnId: "turn-2", turnFailure: turn, activeTurnStartedAt: later }, "working", "active-turn", later],
    ["newer result supersedes a failure", { turnFailure: turn, lastResultAt: later }, "done-unseen", "result-ready", later],
    ["active work ahead of an unseen result", { activeTurnId, activeTurnStartedAt: since, lastResultAt: earlier }, "working", "active-turn", since],
    ["waiting for a child", { waitingForChild: { since }, lastResultAt: earlier }, "working", "waiting-for-child", since],
    ["seen but still answerable", { ...pending("approval"), lastSeenAt: later }, "needs-you", "approval", since],
  ] satisfies Array<[string, TaskAttentionFacts, TaskAttentionState, TaskAttention["reason"], string | null]>;

  test.each(factCases)("%s", (_label, facts, state, reason, expectedSince) => {
    expect(deriveTaskAttention(facts)).toMatchObject({ state, reason, since: expectedSince });
  });

  test.each(["agent-run-sign-off", "agent-run-blocked", "tars-decision", "tars-blocked"] as const)(
    "%s must have a current response route",
    (kind) => {
      expect(deriveTaskAttention({
        lastResultAt: since,
        pendingRequests: [request(kind, { owner: null })],
      })).toEqual({ state: "done-unseen", reason: "result-ready", requests: [], since });
    },
  );

  test("returns every distinct answerable request and selects a reason ahead of problems", () => {
    const approval = request("approval", { since: earlier });
    const question = request("user-input", { owner: liveOwner });
    const secondQuestion = request("user-input", { id: "another-question", since: later });
    const orphan = request("approval", { id: "orphan", owner: null });
    const pendingRequests = [approval, orphan, secondQuestion, question, { ...question }];
    expect(deriveTaskAttention({ activeTurnId, turnStall: turn, pendingRequests })).toEqual({
      state: "needs-you",
      reason: "user-input",
      requests: [question, secondQuestion, approval],
      since,
    });
    expect(pendingRequests.map(({ id }) => id)).toEqual(["approval", "orphan", "another-question", "user-input", "user-input"]);
  });
});

describe("workspace attention and badge", () => {
  const waiting = deriveTaskAttention({ pendingRequests: [request("approval"), request("user-input")] });
  const problem = deriveTaskAttention({ turnFailure: turn });
  const working = deriveTaskAttention({ activeTurnId });
  const done = deriveTaskAttention({ lastResultAt: since });
  const idle = deriveTaskAttention({});

  const rollupCases = [
    ["empty workspace", [], "idle", 0],
    ["unseen result", [idle, done], "done-unseen", 0],
    ["working ahead of unseen results", [working, done, idle], "working", 0],
    ["problem ahead of work", [working, idle, problem, done], "problem", 0],
    ["two requests on one task count once", [idle, done, waiting, problem, working], "needs-you", 1],
    ["two tasks waiting", [waiting, problem, deriveTaskAttention(pending("approval"))], "needs-you", 2],
  ] satisfies Array<[string, TaskAttention[], TaskAttentionState, number]>;

  test.each(rollupCases)("%s", (_label, tasks, state, count) => {
    expect(deriveWorkspaceAttention(tasks)).toBe(state);
    expect(countNeedsYouTasks(tasks)).toBe(count);
  });
});

describe("attention transitions", () => {
  const idle = deriveTaskAttention({});
  const working = deriveTaskAttention({ activeTurnId });
  const waiting = deriveTaskAttention(pending("approval"));
  const newQuestion = request("user-input", { id: "new-question" });
  const replacement = deriveTaskAttention({ pendingRequests: [newQuestion] });
  const withNewQuestion = deriveTaskAttention({ pendingRequests: [request("approval"), newQuestion] });
  const anotherQuestion = request("user-input", { id: "another-question", since: later });
  const withTwoNewQuestions = deriveTaskAttention({ pendingRequests: [request("approval"), newQuestion, anotherQuestion] });
  const problem = deriveTaskAttention({ turnFailure: turn });
  const done = deriveTaskAttention({ lastResultAt: since });
  const newRequest = { type: "new-request", state: "needs-you", requestId: newQuestion.id } as const;

  const transitionCases = [
    ["startup with a request", undefined, waiting, []],
    ["startup with a problem", undefined, problem, []],
    ["startup with a result", null, done, []],
    ["enter needs-you once for multiple requests", working, withNewQuestion, [{ type: "entered", state: "needs-you" }]],
    ["enter problem", waiting, problem, [{ type: "entered", state: "problem" }]],
    ["enter done-unseen", working, done, [{ type: "entered", state: "done-unseen" }]],
    ["enter working", idle, working, []],
    ["leave needs-you after answering", waiting, idle, []],
    ["same request after reprocessing", waiting, deriveTaskAttention(pending("approval")), []],
    ["same problem with a different reason", problem, deriveTaskAttention({ agentRunStuckAt: later }), []],
    ["new request while another remains", waiting, withNewQuestion, [newRequest]],
    ["multiple new requests each emit an edge", waiting, withTwoNewQuestions, [
      newRequest,
      { type: "new-request", state: "needs-you", requestId: anotherQuestion.id },
    ]],
    ["new request replacing another", waiting, replacement, [newRequest]],
    ["one request removed", withNewQuestion, waiting, []],
  ] satisfies Array<[string, TaskAttention | null | undefined, TaskAttention, TaskAttentionTransition[]]>;

  test.each(transitionCases)("%s", (_label, previous, next, edges) => {
    expect(detectAttentionTransitions(previous, next)).toEqual(edges);
  });
});

describe("attention fact adapters", () => {
  const approval: ApprovalPart = {
    type: "approval",
    toolName: "tool",
    description: "",
    requestId: "request-1",
    state: "approval-requested",
  };
  const question: UserInputPart = {
    type: "user_input",
    delivery: "async",
    toolName: "question",
    questions: [],
    requestId: "request-1",
    state: "input-requested",
  };
  const message = { id: "message-1", turnId: activeTurnId };

  test("uses the part kind and turn to scope reused provider request ids", () => {
    const first = taskAttentionRequestFromPart(message, approval, liveOwner, since);
    const replay = taskAttentionRequestFromPart({ ...message, id: "message-2" }, approval, liveOwner, since);
    const laterTurn = taskAttentionRequestFromPart({ ...message, turnId: "turn-2" }, approval, hostOwner);
    const asyncQuestion = taskAttentionRequestFromPart(message, question, { kind: "async" });
    expect(first).toMatchObject({ kind: "approval", owner: liveOwner, since });
    expect(replay).toEqual(first);
    expect(laterTurn?.id).not.toBe(first?.id);
    expect(asyncQuestion?.id).not.toBe(first?.id);
  });

  test("filters settled parts and refuses to attach a live resolver to another turn", () => {
    expect(taskAttentionRequestFromPart(message, { ...approval, state: "approval-responded" }, liveOwner)).toBeNull();
    expect(taskAttentionRequestFromPart(message, { ...approval, prompted: false }, liveOwner)).toBeNull();
    expect(taskAttentionRequestFromPart(message, { ...question, state: "input-interrupted" }, null)).toBeNull();
    expect(taskAttentionRequestFromPart({ ...message, turnId: "older" }, approval, liveOwner)?.owner).toBeNull();
  });

  test("reads only the matching turn's activity", () => {
    const activity = { turnId: activeTurnId, startedAt: Date.parse(earlier), stalledAt: Date.parse(since) };
    expect(taskAttentionFactsFromTurnActivity(activeTurnId, activity)).toEqual({
      activeTurnId,
      activeTurnStartedAt: earlier,
      turnStall: turn,
    });
    expect(taskAttentionFactsFromTurnActivity("turn-2", activity)).toEqual({ activeTurnId: "turn-2" });
  });

  const receiptCases = [
    ["completed", { lastResultAt: since }],
    ["failed", { turnFailure: turn }],
    ["cancelled", {}],
    ["unknown", {}],
  ] satisfies Array<[TurnTerminalReceipt["outcome"], TaskAttentionFacts]>;

  test.each(receiptCases)("adapts a %s terminal receipt", (outcome, facts) => {
    expect(taskAttentionFactsFromTurnReceipt({
      turnId: activeTurnId,
      terminalReceipt: { ...createTurnReceipt(), completedAt: since, outcome },
    })).toEqual(facts);
  });
});

test("an Agent Run only needs you with a recovery route, and a fresh failure episode is visible again", () => {
  const blocked = { id: "block-1", since, recoveryAvailable: false };
  expect(deriveTaskAttention({ agentRunBlock: blocked })).toMatchObject({ state: "problem", reason: "agent-run-blocked" });
  expect(deriveTaskAttention({ agentRunBlock: { ...blocked, seen: true } }).state).toBe("idle");
  expect(deriveTaskAttention({ agentRunBlock: { ...blocked, id: "block-2", since: later }, lastSeenAt: since }).state).toBe("problem");
  expect(deriveTaskAttention({ agentRunBlock: { ...blocked, recoveryAvailable: true, seen: true } })).toMatchObject({
    state: "needs-you", requests: [{ id: "block-1" }],
  });
});

test("a Tars result waits for a real decision or an available completion control", () => {
  const result = { id: "result-1", since, canAcceptCompletion: false };
  expect(deriveTaskAttention({ tarsResult: result }).state).toBe("done-unseen");
  expect(deriveTaskAttention({ tarsResult: { ...result, seen: true } }).state).toBe("idle");
  expect(deriveTaskAttention({ tarsResult: { ...result, canAcceptCompletion: true } })).toMatchObject({
    state: "needs-you", requests: [{ id: "result-1" }],
  });
  expect(deriveTaskAttention({ tarsResult: result, pendingRequests: [request("tars-decision")] })).toMatchObject({
    state: "needs-you", requests: [{ id: "tars-decision" }],
  });
});

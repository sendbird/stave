import { afterEach, expect, test } from "bun:test";
import { formatAsyncQuestionAnswer } from "../src/lib/async-question-answer";
import type { SendUserMessageResult } from "../src/store/app-store.types";
import { useAppStore } from "../src/store/app.store";
import type { ChatMessage, Task } from "../src/types/chat";

const originalWindow = globalThis.window;
afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  Object.assign(globalThis, { window: originalWindow });
});

type SendArgs = Parameters<ReturnType<typeof useAppStore.getState>["sendUserMessage"]>[0];

const question: ChatMessage = {
  id: "m1", role: "assistant", providerId: "codex", model: "auto", content: "", turnId: "turn-1",
  parts: [{
    type: "user_input", delivery: "async", requestId: "codex-async:call_1", toolName: "request_user_input_async",
    state: "input-requested", questions: [{ key: "question-0", question: "Which scope?", header: "", options: [] }],
  }],
};

function setup(args: {
  activeTurnId?: string;
  task?: Partial<Task>;
  send: (sendArgs: SendArgs) => Promise<SendUserMessageResult>;
  hostResult?: { ok: boolean; message?: string };
}) {
  const sends: SendArgs[] = [];
  const hostCalls: Array<Record<string, unknown>> = [];
  Object.assign(globalThis, { window: { api: { localMcp: {
    respondUserInput: async (request: Record<string, unknown>) => {
      hostCalls.push(request);
      return args.hostResult ?? { ok: true };
    },
  } } } });
  const task = { id: "task-1", title: "Task", provider: "codex", updatedAt: "2026-01-01T00:00:00.000Z", unread: false, archivedAt: null, ...args.task } as Task;
  useAppStore.setState({
    ...useAppStore.getInitialState(), activeWorkspaceId: "ws-1", activeTaskId: "task-1", tasks: [task],
    taskWorkspaceIdById: { "task-1": "ws-1" }, messagesByTask: { "task-1": [question] },
    activeTurnIdsByTask: args.activeTurnId ? { "task-1": args.activeTurnId } : {},
    sendUserMessage: async (sendArgs) => { sends.push(sendArgs); return args.send(sendArgs); },
  });
  return { sends, hostCalls };
}

const answer = { taskId: "task-1", messageId: "m1", requestId: "codex-async:call_1", answers: { "question-0": "Focused" } };
const card = () => useAppStore.getState().messagesByTask["task-1"]![0]!.parts[0];
const settle = async () => { for (let index = 0; index < 5; index += 1) await Bun.sleep(0); };

test("a mid-turn answer steers into the running turn once and is recorded without the host", async () => {
  let accept!: () => void;
  const { sends, hostCalls } = setup({
    activeTurnId: "turn-1",
    send: async () => {
      await new Promise<void>((resolve) => { accept = resolve; });
      return { status: "steered", taskId: "task-1", workspaceId: "ws-1", turnId: "turn-1" };
    },
  });
  useAppStore.getState().resolveUserInput(answer);
  useAppStore.getState().resolveUserInput(answer);
  expect(sends).toHaveLength(1);
  expect(sends[0]?.questionReply).toEqual({ requestId: answer.requestId, sourceMessageId: "m1", questions: [{ header: "", question: "Which scope?", answer: "Focused" }] });
  expect(sends[0]).toMatchObject({ submitIntent: "steer", preservePromptDraft: true, content: "> Which scope?\n\nFocused" });
  expect(card()).toMatchObject({ state: "input-requested" });
  accept();
  await settle();
  expect(card()).toMatchObject({ state: "input-responded", answers: { "question-0": "Focused" } });
  // The renderer owns this transcript; the host holds no copy to update.
  expect(hostCalls).toEqual([]);
  expect(useAppStore.getState().messagesByTask["task-1"]).toHaveLength(1);
});

test("a refused steer waits for the turn in the queue", async () => {
  const { sends } = setup({
    activeTurnId: "turn-1",
    send: async (sendArgs) => sendArgs.submitIntent === "steer"
      ? { status: "steer-unavailable", taskId: "task-1", workspaceId: "ws-1", message: "Steering is off." }
      : { status: "queued", taskId: "task-1", workspaceId: "ws-1" },
  });
  useAppStore.getState().resolveUserInput(answer);
  await settle();
  expect(sends.map((sendArgs) => sendArgs.submitIntent)).toEqual(["steer", "queue"]);
  expect(card()).toMatchObject({ state: "input-responded" });
});

test("after the turn ended the answer starts the next turn", async () => {
  const { sends } = setup({
    send: async () => ({ status: "started", taskId: "task-1", workspaceId: "ws-1", turnId: "turn-2" }),
  });
  useAppStore.getState().resolveUserInput(answer);
  await settle();
  expect(sends.map((sendArgs) => sendArgs.submitIntent)).toEqual(["queue"]);
  expect(card()).toMatchObject({ state: "input-responded" });
});

const hostRecord = { workspaceId: "ws-1", taskId: "task-1", requestId: "codex-async:call_1",
  expectedMessageId: "m1", answers: { "question-0": "Focused" }, denied: undefined, answerDelivered: true };

test("a host-owned turn is also recorded through the host, and a failed record is not a chat error", async () => {
  const { sends, hostCalls } = setup({
    activeTurnId: "turn-1",
    hostResult: { ok: false, message: "Pending user input not found: codex-async:call_1" },
    send: async () => ({ status: "steered", taskId: "task-1", workspaceId: "ws-1", turnId: "turn-1" }),
  });
  useAppStore.setState({ hostOwnedTurnIdsByTask: { "task-1": "turn-1" } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    useAppStore.getState().resolveUserInput(answer);
    await settle();
  } finally {
    console.warn = warn;
  }
  expect(sends).toHaveLength(1);
  expect(hostCalls).toEqual([hostRecord]);
  expect(card()).toMatchObject({ state: "input-responded" });
  expect(useAppStore.getState().messagesByTask["task-1"]).toHaveLength(1);
});

test("an answer that starts an agent run is recorded through the host that now owns the transcript", async () => {
  const { hostCalls } = setup({
    send: async () => ({ status: "run-started", taskId: "task-1", workspaceId: "ws-1", agentRunId: "run-1" }),
  });
  useAppStore.getState().resolveUserInput(answer);
  await settle();
  expect(hostCalls).toEqual([hostRecord]);
  expect(card()).toMatchObject({ state: "input-responded" });
});

test("an unconfirmed steer closes the card instead of inviting a duplicate answer", async () => {
  const { sends } = setup({
    activeTurnId: "turn-1",
    send: async () => ({ status: "steer-delivery-unknown", taskId: "task-1", workspaceId: "ws-1", message: "Unconfirmed." }),
  });
  useAppStore.getState().resolveUserInput(answer);
  await settle();
  expect(sends.map((sendArgs) => sendArgs.submitIntent)).toEqual(["steer"]);
  expect(card()).toMatchObject({ state: "input-responded" });
  expect(useAppStore.getState().messagesByTask["task-1"]!.at(-1)?.content).toContain("could not be confirmed");
});

test("a managed task is not sent an answer from the card", async () => {
  const { sends, hostCalls } = setup({
    task: { controlMode: "managed", controlOwner: "stave" } as Partial<Task>,
    send: async () => ({ status: "started", taskId: "task-1", workspaceId: "ws-1", turnId: "turn-2" }),
  });
  useAppStore.getState().resolveUserInput(answer);
  await settle();
  expect(sends).toEqual([]);
  expect(hostCalls).toEqual([]);
  expect(card()).toMatchObject({ state: "input-requested" });
  expect(useAppStore.getState().messagesByTask["task-1"]!.at(-1)?.content).toContain("Take over the task");
});

test("an answer that was not accepted keeps the card open and says why", async () => {
  const { hostCalls } = setup({
    send: async () => ({ status: "blocked", reason: "account-limit", message: "Usage limit reached." }),
  });
  useAppStore.getState().resolveUserInput(answer);
  await settle();
  expect(card()).toMatchObject({ state: "input-requested" });
  expect(hostCalls).toEqual([]);
  expect(useAppStore.getState().messagesByTask["task-1"]!.at(-1)).toMatchObject({
    content: "User input delivery failed: Usage limit reached.",
  });
});

test("answer text quotes each question above its answer", () => {
  const questions = [
    { key: "question-0", question: "Which scope?\nPick one.", header: "", options: [] },
    { key: "question-1", question: "Constraints?", header: "", options: [] },
  ];
  expect(formatAsyncQuestionAnswer({ questions, answers: { "question-0": " Focused " } }))
    .toBe("> Which scope?\n> Pick one.\n\nFocused\n\n> Constraints?\n\nNo answer.");
  expect(formatAsyncQuestionAnswer({ questions: questions.slice(1), answers: { "question-1": "x" }, denied: true }))
    .toBe("> Constraints?\n\nDeclined to answer.");
});

test("a persisted Run question is answered once through its host controller on a managed task", async () => {
  const { runQuestionRequestId } = await import("../src/lib/agent-runs/persistent-question");
  const requestId = runQuestionRequestId({ agentRunId: "run-1", stageId: "work", attempt: 1 }, "native-1");
  const { sends, hostCalls } = setup({ task: { controlMode: "managed", controlOwner: "external" },
    send: async () => { throw new Error("Only the Run controller may send this reply"); } });
  useAppStore.setState({ messagesByTask: { "task-1": [{ ...question, parts: question.parts.map(part => ({ ...part, requestId })) }] } });
  const args = { ...answer, requestId };
  useAppStore.getState().resolveUserInput(args);
  useAppStore.getState().resolveUserInput(args);
  await settle();
  useAppStore.getState().resolveUserInput(args);
  await settle();
  expect(sends).toEqual([]);
  expect(hostCalls).toEqual([{ workspaceId: "ws-1", taskId: "task-1", requestId, expectedMessageId: "m1",
    answers: answer.answers, denied: undefined }]);
  expect(card()).toMatchObject({ state: "input-responded", answers: answer.answers });
});

// A delegated child is managed by its parent's delegation, which is the only
// path that can carry an answer to its asynchronous question.
function delegatedChild(args: {
  delegation: Partial<import("../src/lib/runs/delegated-task").DelegatedTaskSummary> | null;
  followUp?: import("../src/lib/runs/delegated-task").DelegatedTaskActionResponse;
  /** What the delegation reads as once it took the follow-up; by default its next turn started. */
  afterFollowUp?: Partial<import("../src/lib/runs/delegated-task").DelegatedTaskSummary>;
  /** What the child's turn emits once the follow-up is taken; by default the provider answers with text. */
  turnUpdates?: Array<Partial<import("../src/lib/local-mcp/task-turn-update").LocalMcpTaskTurnUpdate>>;
}) {
  const { sends, hostCalls } = setup({
    task: { controlMode: "managed", controlOwner: "external", parentTaskId: "parent-1" },
    send: async () => { throw new Error("Only the delegation may send to a managed child"); },
  });
  const followUps: Array<Record<string, unknown>> = [];
  const lookups: Array<Record<string, unknown>> = [];
  let child = args.delegation && {
    runId: "run-1", stepId: "step-1", parentTaskId: "parent-1", delegationKey: "slice-1",
    delegatedTaskId: "task-1", delegatedWorkspaceId: "ws-1", delegatedTurnId: "turn-1", providerId: "codex",
    lifecycle: "one-turn", phase: "cancelled", reason: null, attempt: 1,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", completedAt: null,
    ...args.delegation,
  };
  const api = (globalThis.window as unknown as { api: Record<string, Record<string, unknown>> }).api;
  const listeners = new Set<(update: import("../src/lib/local-mcp/task-turn-update").LocalMcpTaskTurnUpdate) => void>();
  const emit = (update: Partial<import("../src/lib/local-mcp/task-turn-update").LocalMcpTaskTurnUpdate>) => {
    for (const listener of listeners) listener({ workspaceId: "ws-1", taskId: "task-1", turnId: "turn-2", providerId: "codex",
      model: "m", sequence: 1, eventType: "text", done: false, ...update });
  };
  api.localMcp!.subscribeTaskTurnUpdates = (listener: (update: never) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  api.runs = {
    // The parent's list is bounded; the child is always looked up by its own id.
    listDelegatedTasks: async () => { throw new Error("The child must be looked up by its own id"); },
    getDelegatedTaskLink: async (request: Record<string, unknown>) => { lookups.push(request); return child; },
    followUpDelegatedTask: async (request: Record<string, unknown>) => {
      followUps.push(request);
      const response = args.followUp ?? { accepted: true, duplicate: false, reason: null, message: null, child };
      if (response.accepted && child) {
        child = { ...child, ...(args.afterFollowUp ?? { delegatedTurnId: "turn-2" }) };
        for (const update of args.turnUpdates ?? [{ eventType: "text" }]) emit(update);
      }
      return response;
    },
  };
  return { sends, hostCalls, followUps, lookups, emit };
}

test("a delegated child's answer goes out as a follow-up of its delegation and is recorded through the host", async () => {
  const { sends, hostCalls, followUps, lookups } = delegatedChild({
    delegation: { phase: "waiting", mcpAnswerAt: "2026-01-01T00:00:00.000Z" },
  });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(outcome).toEqual({ status: "delivered" });
  expect(sends).toEqual([]);
  // Always by the child's own id: before the follow-up, then until its turn shows the provider took the answer.
  expect(lookups.length).toBeGreaterThanOrEqual(2);
  expect(lookups.every((lookup) => lookup.delegatedTaskId === "task-1")).toBe(true);
  expect(followUps).toEqual([{
    parentTaskId: "parent-1", delegationKey: "slice-1", prompt: "> Which scope?\n\nFocused",
    expected: { delegatedTaskId: "task-1", delegatedWorkspaceId: "ws-1", attempt: 1, phase: "waiting" },
  }]);
  expect(hostCalls).toEqual([hostRecord]);
  expect(card()).toMatchObject({ state: "input-responded" });
});

test("an answer to a child whose delegation ended reports that it can no longer be answered", async () => {
  const { sends, hostCalls, followUps } = delegatedChild({ delegation: { phase: "cancelled" } });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(outcome).toMatchObject({ status: "failed", unanswerable: true });
  expect(outcome.status === "failed" && outcome.message).toContain("can no longer be answered");
  expect(sends).toEqual([]);
  expect(followUps).toEqual([]);
  expect(hostCalls).toEqual([]);
  // The answer was not delivered, so the question is not recorded as answered.
  expect(card()).toMatchObject({ state: "input-requested" });
});

test("declining a child's question whose delegation ended closes it without sending anything", async () => {
  const { sends, hostCalls, followUps } = delegatedChild({ delegation: null });
  const outcome = await useAppStore.getState().resolveUserInput({
    taskId: "task-1", messageId: "m1", requestId: "codex-async:call_1", denied: true, onUnanswerable: "close",
  });
  expect(outcome).toEqual({ status: "delivered" });
  expect(sends).toEqual([]);
  expect(followUps).toEqual([]);
  expect(hostCalls).toEqual([{ ...hostRecord, answers: undefined, denied: true }]);
  expect(card()).toMatchObject({ state: "input-denied" });
});

test("an answer to a child that is still working can be sent again later", async () => {
  const { followUps } = delegatedChild({ delegation: { phase: "running" } });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(outcome).toMatchObject({ status: "failed" });
  expect(outcome.status === "failed" && outcome.unanswerable).toBeFalsy();
  expect(followUps).toEqual([]);
  expect(card()).toMatchObject({ state: "input-requested" });
});

test("a refused follow-up keeps the question open and says why", async () => {
  const { hostCalls } = delegatedChild({
    delegation: { phase: "waiting", lifecycle: "detached" },
    followUp: { accepted: false, duplicate: false, reason: "stale-execution", message: "The child moved on.", child: null },
  });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(outcome).toEqual({ status: "failed", message: "The delegation did not accept the answer: The child moved on." });
  expect(hostCalls).toEqual([]);
  expect(card()).toMatchObject({ state: "input-requested" });
});

test("an accepted answer whose child turn fails to start keeps the question open", async () => {
  const { hostCalls, followUps } = delegatedChild({
    delegation: { phase: "waiting", mcpAnswerAt: "2026-01-01T00:00:00.000Z" },
    afterFollowUp: { phase: "failed", delegatedTurnId: null, reason: "Provider unavailable." },
  });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(followUps).toHaveLength(1);
  expect(outcome).toMatchObject({ status: "failed" });
  expect(outcome.status === "failed" && outcome.message).toContain("Provider unavailable.");
  expect(outcome.status === "failed" && outcome.unanswerable).toBeFalsy();
  expect(hostCalls).toEqual([]);
  expect(card()).toMatchObject({ state: "input-requested" });
});

test("a child delegation of another parent is not answered through this one", async () => {
  const { followUps } = delegatedChild({ delegation: { phase: "waiting", parentTaskId: "parent-2" } });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(outcome).toMatchObject({ status: "failed", unanswerable: true });
  expect(followUps).toEqual([]);
});

test("a child turn that ends without output after its id was assigned keeps the question open", async () => {
  // The turn id exists once the turn is registered; the provider then refused the prompt.
  const { hostCalls, followUps } = delegatedChild({
    delegation: { phase: "waiting", mcpAnswerAt: "2026-01-01T00:00:00.000Z" },
    turnUpdates: [{ eventType: "started" }, { eventType: "error" }, { eventType: "done", done: true, terminalReceipt: {
      version: 1, completedAt: "2026-01-01T00:00:01.000Z", outcome: "failed", outputObserved: false, error: null,
      lastError: { message: "Not signed in.", recoverable: false }, stopReason: "runtime_failure", doneObserved: true, nativeTurnId: null, responseText: null,
    } }],
  });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(followUps).toHaveLength(1);
  expect(outcome).toMatchObject({ status: "failed" });
  expect(outcome.status === "failed" && outcome.message).toContain("Not signed in.");
  expect(hostCalls).toEqual([]);
  expect(card()).toMatchObject({ state: "input-requested" });
});

test("an answer recorded for the child's new turn counts as delivered without its live events", async () => {
  const { hostCalls } = delegatedChild({
    delegation: { phase: "waiting", mcpAnswerAt: "2026-01-01T00:00:00.000Z" },
    afterFollowUp: { delegatedTurnId: "turn-2", resultTurnId: "turn-2" },
    turnUpdates: [],
  });
  const outcome = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
  expect(outcome).toEqual({ status: "delivered" });
  expect(hostCalls).toEqual([hostRecord]);
});

test("an unconfirmed answer is not sent again: answering again waits on the same turn", async () => {
  const { followUps, emit } = delegatedChild({
    delegation: { phase: "waiting", mcpAnswerAt: "2026-01-01T00:00:00.000Z" },
    turnUpdates: [{ eventType: "started" }],
  });
  const { sendDelegatedQuestionFollowUp, resetDelegatedQuestionFollowUps } = await import("../src/lib/runs/delegated-question-follow-up");
  resetDelegatedQuestionFollowUps();
  const attempt = () => sendDelegatedQuestionFollowUp({
    parentTaskId: "parent-1", taskId: "task-1", prompt: "Focused", attemptKey: "task-1:q1", turnEvidenceWaitMs: 0, turnEvidencePollMs: 0,
  });
  expect(await attempt()).toEqual({ status: "unconfirmed" });
  expect(await attempt()).toEqual({ status: "unconfirmed" });
  expect(followUps).toHaveLength(1);
  // The late turn answers while the second wait listens.
  const third = attempt();
  emit({ eventType: "tool" });
  expect(await third).toEqual({ status: "sent" });
  expect(followUps).toHaveLength(1);
  resetDelegatedQuestionFollowUps();
});

test("answering again while an earlier answer is unconfirmed records the answer the child received", async () => {
  const { followUps, hostCalls, emit } = delegatedChild({
    delegation: { phase: "waiting", mcpAnswerAt: "2026-01-01T00:00:00.000Z" },
    turnUpdates: [{ eventType: "started" }],
  });
  const { delegatedQuestionTiming, resetDelegatedQuestionFollowUps } = await import("../src/lib/runs/delegated-question-follow-up");
  resetDelegatedQuestionFollowUps();
  const timing = { ...delegatedQuestionTiming };
  Object.assign(delegatedQuestionTiming, { waitMs: 0, pollMs: 0 });
  try {
    // A goes out, and its turn shows nothing within the wait.
    const first = await useAppStore.getState().resolveUserInput({ ...answer, onUnanswerable: "close" });
    expect(first).toMatchObject({ status: "failed" });
    expect(card()).toMatchObject({ state: "input-requested" });
    // B waits on A's turn instead of sending, and the turn answers.
    Object.assign(delegatedQuestionTiming, { waitMs: 1_000, pollMs: 5 });
    const second = useAppStore.getState().resolveUserInput({
      taskId: "task-1", messageId: "m1", requestId: "codex-async:call_1", answers: { scope: "Broad" }, onUnanswerable: "close",
    });
    emit({ eventType: "text" });
    // The caller is told its own answer was not the one delivered.
    expect(await second).toEqual({ status: "delivered", earlierAnswer: true });
    expect(followUps).toHaveLength(1);
    // What the child got (A) is what the card and the host record.
    expect(hostCalls).toEqual([hostRecord]);
    expect(card()).toMatchObject({ state: "input-responded", answers: answer.answers });
  } finally {
    Object.assign(delegatedQuestionTiming, timing);
    resetDelegatedQuestionFollowUps();
  }
});

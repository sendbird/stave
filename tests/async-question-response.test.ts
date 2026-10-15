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
  answers: { "question-0": "Focused" }, denied: undefined, answerDelivered: true };

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
  expect(hostCalls).toEqual([{ workspaceId: "ws-1", taskId: "task-1", requestId, answers: answer.answers, denied: undefined }]);
  expect(card()).toMatchObject({ state: "input-responded", answers: answer.answers });
});

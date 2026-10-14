import { expect, test } from "bun:test";
import { runQuestionRequestId } from "../src/lib/agent-runs/persistent-question";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { ChatMessageSchema } from "../src/lib/task-context/schemas";

for (const provider of ["claude-code", "codex"] as const) {
  test(`${provider}: a native question interrupted at turn end remains one answerable card`, () => {
    const requestId = runQuestionRequestId({ agentRunId: "run-1", stageId: "work", attempt: 1 }, "native-1");
    const question = NormalizedProviderEventSchema.parse({ type: "user_input", requestId,
      toolName: provider === "codex" ? "request_user_input" : "AskUserQuestion",
      questions: [{ key: "file", question: "Which filename?", header: "File", options: [] }] });
    const state = replayProviderEventsToTaskState({ taskId: "task", provider, model: "model", turnId: "turn", messages: [],
      events: [question, { type: "done", stop_reason: "runtime_failure" }] });
    const persisted = state.messages.map(message => ChatMessageSchema.parse(JSON.parse(JSON.stringify(message))));
    const cards = persisted.flatMap(message => message.parts).filter(part => part.type === "user_input");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ requestId, delivery: "async", state: "input-requested" });
    expect(state.activeTurnId).toBeUndefined();
  });
}


test("a maximum-length workflow stage's question identity fits both answer IPC boundaries", async () => {
  const { LocalMcpUserInputResponseArgsSchema, UserInputResponseArgsSchema } = await import("../electron/main/ipc/schemas");
  const { runQuestionStage } = await import("../src/lib/agent-runs/persistent-question");
  const stage = { agentRunId: "12345678-1234-4123-8123-123456789012", stageId: "s".repeat(48), attempt: 30 };
  const requestId = runQuestionRequestId(stage, "toolu_01KCorp7PdBJ1vZjQRJHzQA1", "22345678-1234-4123-8123-123456789012");
  expect(runQuestionStage(requestId)).toEqual(stage);
  expect(LocalMcpUserInputResponseArgsSchema.safeParse({ workspaceId: "workspace", taskId: "task", requestId, answers: { file: "B.md" } }).success).toBe(true);
  expect(UserInputResponseArgsSchema.safeParse({ turnId: "turn", requestId, answers: { file: "B.md" } }).success).toBe(true);
});


test("a reused App Server request id in another turn is a different question", () => {
  const stage = { agentRunId: "run", stageId: "work", attempt: 1 };
  expect(runQuestionRequestId(stage, "request-1", "turn-1")).not.toBe(runQuestionRequestId(stage, "request-1", "turn-2"));
});

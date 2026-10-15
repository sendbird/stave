import { expect, test } from "bun:test";
import { visibleSteerMessageSegments } from "@/lib/session/steer-message-segments";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import { buildSteeredUserMessageState } from "@/store/chat-state-helpers";
import type { ChatMessage } from "@/types/chat";

const before: ChatMessage = {
  id: "assistant-before", role: "assistant", model: "gpt-test", providerId: "codex", turnId: "turn-1",
  content: "", isStreaming: true, parts: [
    { type: "thinking", text: "Checking", isStreaming: true },
    { type: "tool_use", toolUseId: "tool-before", toolName: "Bash", input: "bun test", state: "input-available" },
  ],
};
const steer = (messages: ChatMessage[], id = "steer-1") => buildSteeredUserMessageState({
  messagesByTask: { task: messages }, messageCountByTask: { task: messages.length }, taskId: "task",
  content: "Also check the tests", steeredIntoTurnId: "turn-1", clientMessageId: id,
  provider: "codex", activeModel: "gpt-test", turnStillActive: true,
}).messagesByTask.task!;

test("tool updates stay with the pre-steer call while new work lands after the steer", () => {
  const split = steer([before]);
  expect(split[0]?.parts[0]).toMatchObject({ isStreaming: false, completedAt: expect.any(String) });
  const replayed = replayProviderEventsToTaskState({
    taskId: "task", messages: split, turnId: "turn-1", provider: "codex", model: "gpt-test",
    events: [
      { type: "tool_progress", toolUseId: "tool-before", elapsedSeconds: 5 },
      { type: "tool_result", tool_use_id: "tool-before", output: "Tests passed" },
      { type: "tool", toolUseId: "tool-after", toolName: "Read", input: "test.ts", state: "input-available" },
    ],
  });
  expect(replayed.messages[0]).toMatchObject({ isStreaming: false, parts: expect.arrayContaining([
    expect.objectContaining({ toolUseId: "tool-before", output: "Tests passed", elapsedSeconds: 5, state: "output-available" }),
  ]) });
  expect(replayed.messages.at(-1)).toMatchObject({ isStreaming: true, parts: [expect.objectContaining({ toolUseId: "tool-after" })] });
});

test("reload hides only sealed empty steer segments and keeps the live placeholder and real empty response", () => {
  const twice = steer(steer([before]), "steer-2");
  const visible = visibleSteerMessageSegments(twice);
  expect(visible.map((message) => message.id)).toEqual(["assistant-before", "steer-1", "steer-2", "steer-2-assistant"]);
  const oldStored = twice.map((message) => message.id === "steer-1-assistant" ? { ...message, turnId: undefined } : message);
  expect(visibleSteerMessageSegments(oldStored).map((message) => message.id)).toEqual(visible.map((message) => message.id));
  const realEmpty = { ...twice.at(-1)!, isStreaming: false, content: "No response returned.", terminalStopReason: "end_turn", parts: [{ type: "system_event" as const, content: "No response returned." }] };
  expect(visibleSteerMessageSegments([twice.at(-2)!, realEmpty])).toEqual([twice.at(-2)!, realEmpty]);
  const ordinaryEmpty = { ...before, isStreaming: false, parts: [] };
  const ordinary = [ordinaryEmpty];
  expect(visibleSteerMessageSegments(ordinary)).toBe(ordinary);
});

test("a turn's end closes the prompts a steer sealed before it, and leaves other turns alone", () => {
  const asking: ChatMessage = {
    ...before,
    parts: [
      { type: "approval", toolName: "Bash", requestId: "approval-before", description: "Run the migration", state: "approval-requested" },
      { type: "user_input", toolName: "AskUserQuestion", requestId: "question-before", questions: [], state: "input-requested" },
      { type: "user_input", toolName: "stave_ask_user", requestId: "async-before", questions: [], state: "input-requested", delivery: "async" },
    ],
  };
  const otherTurn: ChatMessage = {
    ...before, id: "assistant-other", turnId: "turn-0", isStreaming: false,
    parts: [{ type: "approval", toolName: "Bash", requestId: "approval-other", description: "Other turn", state: "approval-requested" }],
  };
  const split = steer([otherTurn, asking]);
  const replayed = replayProviderEventsToTaskState({
    taskId: "task", messages: split, turnId: "turn-1", provider: "codex", model: "gpt-test",
    events: [{ type: "done", stop_reason: "error" }],
  });
  const sealed = replayed.messages.find((message) => message.id === "assistant-before")!;
  expect(sealed.parts).toEqual([
    expect.objectContaining({ requestId: "approval-before", state: "approval-interrupted" }),
    expect.objectContaining({ requestId: "question-before", state: "input-interrupted" }),
    // An async question outlives a turn that ended on its own, as on the final answer.
    expect.objectContaining({ requestId: "async-before", state: "input-requested" }),
  ]);
  expect(replayed.messages.find((message) => message.id === "assistant-other")?.parts[0])
    .toMatchObject({ requestId: "approval-other", state: "approval-requested" });
});

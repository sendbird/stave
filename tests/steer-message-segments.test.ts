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

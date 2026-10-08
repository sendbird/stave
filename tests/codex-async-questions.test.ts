import { expect, test } from "bun:test";
import { mapCodexAsyncQuestions } from "../electron/providers/codex-async-questions";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { appendProviderEventToAssistant } from "../src/lib/session/provider-event-replay";
import { ChatMessageSchema } from "../src/lib/task-context/schemas";
import { findLatestPendingUserInputPart } from "../src/store/provider-message.utils";
import type { ChatMessage } from "../src/types/chat";

test("async messages become stable question cards that survive turn completion and persistence", () => {
  const item = { type: "agentMessage", delivery: "async", id: "message-1",
    questions: [{ title: "Which scope?", options: ["Focused", "Full"] }, { title: "Constraints?" }] };
  const event = NormalizedProviderEventSchema.parse(mapCodexAsyncQuestions(item));
  expect(event).toMatchObject({ type: "user_input", delivery: "async", requestId: "codex-async:message-1",
    questions: [{ key: "question-0", question: "Which scope?", allowCustom: true, options: [{ label: "Focused" }, { label: "Full" }] }, { question: "Constraints?", options: [] }] });
  const message: ChatMessage = { id: "m1", role: "assistant", model: "auto", providerId: "codex", content: "", parts: [], isStreaming: true };
  const asked = appendProviderEventToAssistant({ message, event });
  const ended = appendProviderEventToAssistant({ message: asked, event: { type: "done", stop_reason: "end_turn" } });
  const restored = ChatMessageSchema.parse(JSON.parse(JSON.stringify(ended)));
  expect(findLatestPendingUserInputPart({ message: restored, blockingOnly: true })).toBeUndefined();
  expect(findLatestPendingUserInputPart({ message: restored })).toMatchObject({ delivery: "async", state: "input-requested" });
  const answered = { ...restored, parts: restored.parts.map((part) => part.type === "user_input" ? { ...part, state: "input-responded" as const, answers: { "question-0": "Focused" } } : part) };
  const replayed = appendProviderEventToAssistant({ message: answered, event });
  expect(replayed.parts.filter((part) => part.type === "user_input")).toHaveLength(1);
  expect(replayed.parts).toContainEqual(expect.objectContaining({ state: "input-responded" }));
  const stopped = appendProviderEventToAssistant({ message: asked, event: { type: "done", stop_reason: "aborted" } });
  expect(findLatestPendingUserInputPart({ message: stopped })).toBeUndefined();
});

test("ordinary messages and malformed questions do not create empty cards", () => {
  expect(mapCodexAsyncQuestions({ type: "agentMessage", id: "1", text: "Hello" })).toBeNull();
  expect(mapCodexAsyncQuestions({ type: "agentMessage", delivery: "async", id: "1", questions: [null, {}, { title: "" }] })).toBeNull();
});

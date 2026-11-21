import { expect, test } from "bun:test";
import { findComposerAutoRoute, findRecordedTurnRoute } from "@/components/session/turn-route-trace";
import { buildMessageId } from "@/lib/session/message-id";
import type { ChatMessage } from "@/types/chat";

const resolution = (model: string) => ({
  selectedProviderId: "claude-code" as const,
  selectedModel: model,
  source: "heuristic" as const,
  rationale: "implement",
  confidence: null,
  taskType: "implementation" as const,
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", model: "", providerId: "claude-code", content: "", ...overrides } as ChatMessage;
}

test("reads the saved decision of the turn on screen, not of the latest send", () => {
  const messages = [
    message({ role: "user", providerId: "user", content: "First prompt" }),
    message({ turnId: "turn-1", modelResolution: resolution("claude-opus-5"), modelInfo: { effort: "max" } }),
    message({ role: "user", providerId: "user", content: "Second prompt" }),
    message({ turnId: "turn-2", modelResolution: resolution("claude-sonnet-5") }),
  ];
  const first = findRecordedTurnRoute(messages, "turn-1");
  expect(first?.resolution.selectedModel).toBe("claude-opus-5");
  expect(first?.prompt).toBe("First prompt");
  expect(first?.modelInfo).toEqual({ effort: "max" });
  expect(findRecordedTurnRoute(messages, "turn-2")?.prompt).toBe("Second prompt");
});

test("finds nothing for a turn Auto did not route or an unknown turn", () => {
  const messages = [message({ turnId: "turn-1" })];
  expect(findRecordedTurnRoute(messages, "turn-1")).toBeNull();
  expect(findRecordedTurnRoute(messages, "turn-9")).toBeNull();
  expect(findRecordedTurnRoute(messages, null)).toBeNull();
});

test("binds the Auto label to the reply and route from the same turn", () => {
  const taskId = "task-m-1";
  const route = resolution("claude-opus-5");
  const routedReply = message({
    turnId: "routed-turn",
    model: "claude-sonnet-5",
    modelInfo: { effort: "high" },
    modelResolution: route,
  });
  expect(findComposerAutoRoute([routedReply], taskId, undefined, undefined)).toMatchObject({
    model: "claude-sonnet-5",
    modelInfo: { effort: "high" },
    resolution: route,
  });
  expect(findComposerAutoRoute([routedReply], taskId, "new-turn", "routed-turn")).toBeNull();

  const manualReply = message({ turnId: "manual-turn", model: "claude-opus-5" });
  expect(findComposerAutoRoute([routedReply, manualReply], taskId, undefined, "routed-turn")).toBeNull();
});

test("reads a host Agent turn before replay adds a turnId to the reply", () => {
  const taskId = "task-m-1";
  const turnId = "agent-turn";
  const prompt = message({
    id: buildMessageId({ taskId, count: 2, turnId }),
    role: "user",
    providerId: "user",
    agentRunPrompt: { agentRunId: "run", assignment: null },
  });
  const reply = message({
    id: buildMessageId({ taskId, count: 3, turnId }),
    providerId: "codex",
    model: "gpt-6.2-sol",
    modelInfo: { effort: "high" },
  });
  expect(findComposerAutoRoute([prompt, reply], taskId, turnId, undefined)).toMatchObject({
    model: "gpt-6.2-sol",
    turnId,
  });
  expect(findComposerAutoRoute([prompt, { ...reply, turnId }], taskId, undefined, undefined)).toMatchObject({
    model: "gpt-6.2-sol",
    turnId,
  });
  expect(findComposerAutoRoute([prompt, { ...reply, turnId: "other-turn" }], taskId, undefined, undefined)).toBeNull();
});

import { expect, test } from "bun:test";
import { findRecordedTurnRoute } from "@/components/session/turn-route-trace";
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

import { describe, expect, test } from "bun:test";
import {
  estimateMessagePayloadBytes,
  trimPersistedMessageWindow,
} from "@/store/resident-message-budget";
import type { ChatMessage } from "@/types/chat";

const message = (id: string, text: string): ChatMessage => ({
  id,
  role: "assistant",
  model: "test",
  providerId: "codex",
  content: text,
  parts: [{ type: "text", text }],
});

describe("persisted message payload window", () => {
  test("evicts complete old messages by payload size without modifying originals", () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      message(String(i), "한글".repeat(1_000)),
    );
    const size = estimateMessagePayloadBytes(messages[0]!);
    const trimmed = trimPersistedMessageWindow({
      messages,
      maxBytes: size * 3,
      slackBytes: 0,
    });
    expect(trimmed).toEqual(messages.slice(-3));
    expect(trimmed[0]).toBe(messages[5]);
    expect(messages).toHaveLength(8);
    expect(messages[0]?.content).toBe("한글".repeat(1_000));
  });

  test("preserves identity inside the byte hysteresis band", () => {
    const messages = [
      message("a", "x".repeat(1_000)),
      message("b", "y"),
      message("c", "z"),
    ];
    const size = messages.reduce(
      (sum, item) => sum + estimateMessagePayloadBytes(item),
      0,
    );
    expect(
      trimPersistedMessageWindow({
        messages,
        maxBytes: size - 10,
        slackBytes: 10,
      }),
    ).toBe(messages);
  });

  test("keeps oversized latest rows and pending interactions accessible", () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      message(String(i), "x".repeat(1_000)),
    );
    const pending = {
      ...messages[1]!,
      parts: [
        {
          type: "user_input" as const,
          requestId: "input",
          toolName: "ask",
          questions: [],
          state: "input-requested" as const,
        },
      ],
    };
    messages[1] = pending;
    expect(
      trimPersistedMessageWindow({ messages, maxBytes: 1, slackBytes: 0 }),
    ).toEqual(messages.slice(1));
    const latest = messages.slice(-2);
    expect(
      trimPersistedMessageWindow({
        messages: latest,
        maxBytes: 1,
        slackBytes: 0,
      }),
    ).toBe(latest);
  });

  test("counts tool outputs, diffs and new streaming revisions", () => {
    const initial = message("a", "text");
    const updated: ChatMessage = {
      ...initial,
      parts: [
        {
          type: "tool_use",
          toolUseId: "tool",
          toolName: "Read",
          input: "{}",
          output: "x".repeat(10_000),
          state: "output-available",
        },
      ],
    };
    expect(estimateMessagePayloadBytes(updated)).toBeGreaterThan(
      estimateMessagePayloadBytes(initial) + 19_000,
    );
    expect(estimateMessagePayloadBytes(initial)).toBe(
      estimateMessagePayloadBytes(initial),
    );
  });
});

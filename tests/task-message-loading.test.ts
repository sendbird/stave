import { describe, expect, test } from "bun:test";
import {
  MAX_LOADED_TASK_MESSAGES,
  MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK,
  resolveInitialLatestTaskMessagesPageSize,
  trimLoadedTaskMessages,
} from "@/store/task-message-loading";
import type { ChatMessage } from "@/types/chat";

describe("resolveInitialLatestTaskMessagesPageSize", () => {
  test("clamps to a smaller page on short viewports", () => {
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 720 }),
    ).toBe(24);
  });

  test("scales with a typical desktop viewport", () => {
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 900 }),
    ).toBe(27);
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 1080 }),
    ).toBe(36);
  });

  test("caps large displays instead of eagerly loading huge histories", () => {
    expect(
      resolveInitialLatestTaskMessagesPageSize({ viewportHeightPx: 1600 }),
    ).toBe(48);
  });
});

function buildMessages(count: number, taskId = "task-1"): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${taskId}-m-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    model: index % 2 === 0 ? "user" : "gpt-5.4",
    providerId: index % 2 === 0 ? "user" : "codex",
    content: `message ${index + 1}`,
    parts: [],
  }));
}

describe("trimLoadedTaskMessages", () => {
  test("returns the same array reference when within cap + slack", () => {
    const messages = buildMessages(
      MAX_LOADED_TASK_MESSAGES + MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK,
    );
    // No reallocation while hovering at the hysteresis ceiling.
    expect(trimLoadedTaskMessages({ messages })).toBe(messages);
  });

  test("trims to the cap once the window exceeds cap + slack", () => {
    const total =
      MAX_LOADED_TASK_MESSAGES + MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK + 1;
    const messages = buildMessages(total);
    const trimmed = trimLoadedTaskMessages({ messages });

    expect(trimmed).not.toBe(messages);
    expect(trimmed).toHaveLength(MAX_LOADED_TASK_MESSAGES);
    // Keeps the TAIL: the most recent / in-flight message is never dropped.
    expect(trimmed[trimmed.length - 1]?.id).toBe(`task-1-m-${total}`);
    expect(trimmed[0]?.id).toBe(
      `task-1-m-${total - MAX_LOADED_TASK_MESSAGES + 1}`,
    );
  });

  test("honors custom cap/slack and short-circuits under the threshold", () => {
    const messages = buildMessages(20);
    const trimmed = trimLoadedTaskMessages({ messages, cap: 5, slack: 2 });
    expect(trimmed).toHaveLength(5);
    expect(trimmed[trimmed.length - 1]?.id).toBe("task-1-m-20");

    const small = buildMessages(6);
    expect(trimLoadedTaskMessages({ messages: small, cap: 5, slack: 2 })).toBe(
      small,
    );
  });
});

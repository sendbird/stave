import { describe, expect, test } from "bun:test";
import {
  buildUsageLimitContinuationPrompt,
  findUsageLimitStop,
  isUsageLimitErrorText,
} from "../src/lib/providers/usage-limit-stop";
import type { ChatMessage, MessagePart } from "../src/types/chat";

function assistant(parts: MessagePart[]): ChatMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    model: "claude-opus-5-5",
    providerId: "claude-code",
    content: "",
    parts,
  } as ChatMessage;
}

const errorPart = (content: string): MessagePart => ({
  type: "system_event",
  content: `[error] ${content}`,
});

describe("isUsageLimitErrorText", () => {
  test.each([
    "Rate limit reached (5-hour limit). Resets at 3:00:00 PM.",
    "Extra usage credits are exhausted. Resets at 9:00 AM.",
    "You've hit your limit · resets 3pm (Asia/Seoul)",
    "Claude AI usage limit reached|1760000000",
    "Codex usage limit reached. Wait for the limit to reset or check account limits.",
    "{\"code\":\"usage_limit_reached\"}",
  ])("treats %p as a usage limit", (text) => {
    expect(isUsageLimitErrorText(text)).toBe(true);
  });

  test.each([
    "Approaching 5-hour limit (92% used)",
    "API Error: 429 rate_limit_error: per-minute token rate exceeded",
    "Codex rate limit hit. Retry shortly.",
    "model is overloaded",
    "Codex authentication failed. Run `codex login` and retry.",
  ])("does not treat %p as a usage limit", (text) => {
    expect(isUsageLimitErrorText(text)).toBe(false);
  });
});

describe("findUsageLimitStop", () => {
  test("finds a limit error that ends the turn", () => {
    const stop = findUsageLimitStop([
      assistant([
        { type: "text", text: "Reading the files first." },
        { type: "tool_use", toolName: "Read", input: "{}", state: "output-available" },
        errorPart("Rate limit reached (5-hour limit). Resets at 3:00:00 PM."),
      ]),
    ]);
    expect(stop).toEqual({
      message: "Rate limit reached (5-hour limit). Resets at 3:00:00 PM.",
    });
  });

  test("accepts the limit notice written as the reply itself", () => {
    expect(
      findUsageLimitStop([
        assistant([
          errorPart("Rate limit reached (5-hour limit). Resets at 3:00:00 PM."),
          { type: "text", text: "You've hit your limit · resets 3pm" },
        ]),
      ]),
    ).not.toBeNull();
  });

  test("ignores a limit the turn carried on past", () => {
    expect(
      findUsageLimitStop([
        assistant([
          errorPart("Rate limit reached (5-hour limit). Resets at 3:00:00 PM."),
          { type: "tool_use", toolName: "Edit", input: "{}", state: "output-available" },
          { type: "text", text: "Done." },
        ]),
      ]),
    ).toBeNull();
  });

  test("ignores other errors and a conversation that ends with the user", () => {
    expect(findUsageLimitStop([assistant([errorPart("model is overloaded")])])).toBeNull();
    expect(
      findUsageLimitStop([
        assistant([errorPart("Rate limit reached (5-hour limit).")]),
        { id: "user-2", role: "user", model: "", content: "next", parts: [] } as unknown as ChatMessage,
      ]),
    ).toBeNull();
    expect(findUsageLimitStop(undefined)).toBeNull();
  });
});

test("the continuation never replays the original prompt", () => {
  const prompt = buildUsageLimitContinuationPrompt();
  expect(prompt).toContain("usage limit");
  expect(prompt).toContain("finish only the remaining work");
});

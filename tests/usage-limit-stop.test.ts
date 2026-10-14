import { describe, expect, test } from "bun:test";
import {
  buildUsageLimitContinuationPrompt,
  findUsageLimitStop,
  findUsageLimitStopInEvents,
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


describe("terminal usage-limit evidence", () => {
  test("a structured cause wins over text, including successful recovery and cancellation", () => {
    expect(findUsageLimitStopInEvents([{ type: "done", stop_reason: "usage_limit_exceeded", accountProfileId: "system", usageLimitResetsAt: "2026-09-26T11:00:00.000Z" }])).toEqual({ accountProfileId: "system", resetsAt: "2026-09-26T11:00:00.000Z" });
    for (const reason of ["end_turn", "completed", "user_abort", "output_overflow"]) {
      expect(findUsageLimitStopInEvents([{ type: "error", message: "Usage limit reached", recoverable: false }, { type: "done", stop_reason: reason }])).toBeNull();
    }
  });
  test("legacy generic failures reuse usage error detection, while warnings and work after a limit do not stop", () => {
    expect(findUsageLimitStopInEvents([{ type: "error", message: "Codex usage limit reached", recoverable: false }, { type: "done", stop_reason: "failed" }])).not.toBeNull();
    expect(findUsageLimitStopInEvents([{ type: "error", message: "Rate limit reached", recoverable: true }, { type: "done" }])).toBeNull();
    expect(findUsageLimitStopInEvents([{ type: "error", message: "Rate limit reached", recoverable: false }, { type: "text", text: "Done" }, { type: "done" }])).toBeNull();
    expect(findUsageLimitStopInEvents([{ type: "error", message: "Codex rate limit hit. Retry shortly.", recoverable: false }, { type: "done", stop_reason: "failed" }])).toBeNull();
    expect(findUsageLimitStopInEvents([{ type: "error", message: "Usage limit reached", recoverable: false }])).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";

import { AcpEventMapper } from "../electron/providers/acp/acp-event-mapper";
import {
  AcpPromptResponseSchema,
  AcpUsageUpdateSchema,
  normalizeAcpPromptUsage,
} from "../electron/providers/acp/acp-schemas";

function parsePromptUsage(result: unknown) {
  const parsed = AcpPromptResponseSchema.parse(result);
  return (
    normalizeAcpPromptUsage(parsed.usage) ??
    normalizeAcpPromptUsage(parsed._meta?.usage)
  );
}

describe("ACP prompt usage normalization", () => {
  test("reads the snake_case spelling", () => {
    expect(
      parsePromptUsage({
        stopReason: "end_turn",
        usage: {
          input_tokens: 34,
          output_tokens: 21,
          thought_tokens: 7,
          cached_read_tokens: 13,
          cached_write_tokens: 5,
        },
      }),
    ).toEqual({
      inputTokens: 34,
      outputTokens: 21,
      thoughtTokens: 7,
      cacheReadTokens: 13,
      cacheCreationTokens: 5,
    });
  });

  test("reads the camelCase spelling agents also ship", () => {
    expect(
      parsePromptUsage({
        stopReason: "end_turn",
        usage: {
          inputTokens: 7433,
          outputTokens: 18,
          cacheReadTokens: 8864,
          cacheWriteTokens: 0,
        },
      }),
    ).toEqual({
      inputTokens: 7433,
      outputTokens: 18,
      cacheReadTokens: 8864,
      cacheCreationTokens: 0,
    });
  });

  test("falls back to usage nested under _meta", () => {
    expect(
      parsePromptUsage({
        stopReason: "end_turn",
        _meta: { usage: { input_tokens: 10, output_tokens: 4 } },
      }),
    ).toEqual({ inputTokens: 10, outputTokens: 4 });
  });

  test("treats an unrecognised usage object as not reported", () => {
    expect(
      parsePromptUsage({ stopReason: "end_turn", usage: { seconds: 12 } }),
    ).toBeNull();
    expect(parsePromptUsage({ stopReason: "end_turn" })).toBeNull();
  });
});

describe("ACP usage_update", () => {
  test("keeps a partial reading instead of dropping the update", () => {
    expect(
      AcpUsageUpdateSchema.safeParse({
        sessionUpdate: "usage_update",
        used: 233,
      }).success,
    ).toBe(true);
    expect(
      AcpUsageUpdateSchema.safeParse({
        sessionUpdate: "usage_update",
        cost: { amount: 0.003, currency: "USD" },
      }).success,
    ).toBe(true);
  });

  test("rejects an update that carries no reading at all", () => {
    expect(
      AcpUsageUpdateSchema.safeParse({ sessionUpdate: "usage_update" }).success,
    ).toBe(false);
  });

  test("maps a percentage-only update to context usage", () => {
    const mapper = new AcpEventMapper();
    expect(
      mapper.mapNotification({
        sessionId: "session-1",
        update: { sessionUpdate: "usage_update", usedPercent: 42 },
      }),
    ).toEqual([{ type: "context_usage", usedPercent: 42 }]);
  });
});

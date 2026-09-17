import { describe, expect, test } from "bun:test";
import {
  computePromptCacheStats,
  detectPromptCacheMiss,
  formatCacheHitLabel,
  formatPromptCacheMissLabel,
} from "../src/lib/providers/usage-cache";

describe("computePromptCacheStats", () => {
  test("adds Claude's separately reported cache counters to the prompt", () => {
    // Claude's `input_tokens` is the uncached remainder only, so a turn that
    // reads 90k from cache and 1k fresh has a 91k prompt, not a 1k one.
    const stats = computePromptCacheStats({
      providerId: "claude-code",
      usage: {
        inputTokens: 1_000,
        outputTokens: 500,
        cacheReadTokens: 90_000,
        cacheCreationTokens: 9_000,
      },
    });

    expect(stats.promptTokens).toBe(100_000);
    expect(stats.cachedTokens).toBe(90_000);
    expect(stats.uncachedTokens).toBe(10_000);
    expect(stats.cacheCreationTokens).toBe(9_000);
    expect(stats.cacheHitPercent).toBe(90);
  });

  test("treats Codex's cached input as a subset of its input", () => {
    // Codex's `inputTokens` already covers the whole prompt; the schema's
    // `netNewInputTokens` is `inputTokens - cachedInputTokens`. Adding them
    // would double-count every cached token.
    const stats = computePromptCacheStats({
      providerId: "codex",
      usage: {
        inputTokens: 100_000,
        outputTokens: 500,
        cacheReadTokens: 90_000,
      },
    });

    expect(stats.promptTokens).toBe(100_000);
    expect(stats.cachedTokens).toBe(90_000);
    expect(stats.uncachedTokens).toBe(10_000);
    expect(stats.cacheHitPercent).toBe(90);
  });

  test("never reports a prompt smaller than its own cache reads", () => {
    const stats = computePromptCacheStats({
      providerId: "codex",
      usage: { inputTokens: 0, outputTokens: 10, cacheReadTokens: 4_000 },
    });

    expect(stats.promptTokens).toBe(4_000);
    expect(stats.uncachedTokens).toBe(0);
    expect(stats.cacheHitPercent).toBe(100);
  });

  test("reports no percentage when there was no prompt to measure", () => {
    const stats = computePromptCacheStats({
      providerId: "claude-code",
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    expect(stats.promptTokens).toBe(0);
    expect(stats.cacheHitPercent).toBeNull();
    expect(formatCacheHitLabel(stats)).toBeNull();
  });

  test("ignores missing and negative counters", () => {
    const stats = computePromptCacheStats({
      providerId: "claude-code",
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: null,
        cacheCreationTokens: -5,
      },
    });

    expect(stats.promptTokens).toBe(100);
    expect(stats.cachedTokens).toBe(0);
    expect(stats.cacheHitPercent).toBe(0);
  });

  test("publishes no rate for a provider whose prompt convention is unverified", () => {
    // ACP agents report `cached_read_tokens` separately, which reads additive,
    // but that is not confirmed per agent. A rate that could be wrong by a
    // factor of two is worse than no rate.
    const acp = computePromptCacheStats({
      providerId: "cursor",
      usage: { inputTokens: 120, outputTokens: 18, cacheReadTokens: 90 },
    });
    expect(acp.cacheReported).toBe(false);
    expect(formatCacheHitLabel(acp)).toBeNull();
  });

  test("does not claim a 0% hit rate for a provider that reports no cache", () => {
    // A provider that reported no cache counters at all: "0% cached" there
    // would be a fabricated measurement rather than a cold prompt.
    const silent = computePromptCacheStats({
      providerId: "claude-code",
      usage: { inputTokens: 21, outputTokens: 13 },
    });
    expect(silent.cacheReported).toBe(false);
    expect(formatCacheHitLabel(silent)).toBeNull();

    // A provider that does report cache accounting shows a genuine cold prompt.
    const coldPrompt = computePromptCacheStats({
      providerId: "claude-code",
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 },
    });
    expect(coldPrompt.cacheReported).toBe(true);
    expect(formatCacheHitLabel(coldPrompt)).toBe("0% cached");
  });

  test("handles an absent usage payload", () => {
    expect(computePromptCacheStats({ usage: null })).toEqual({
      cacheReported: false,
      promptTokens: 0,
      cachedTokens: 0,
      uncachedTokens: 0,
      cacheCreationTokens: 0,
      cacheHitPercent: null,
    });
  });

  test("formats a readable cache-hit label", () => {
    expect(
      formatCacheHitLabel(
        computePromptCacheStats({
          providerId: "codex",
          usage: {
            inputTokens: 1_000,
            outputTokens: 0,
            cacheReadTokens: 720,
          },
        }),
      ),
    ).toBe("72% cached");
  });
});

describe("detectPromptCacheMiss", () => {
  const warmPrevious = {
    providerId: "claude-code" as const,
    model: "claude-opus-5",
    nativeSessionId: "session-1",
    usage: {
      inputTokens: 500,
      outputTokens: 300,
      cacheReadTokens: 40_000,
      cacheCreationTokens: 1_200,
      contextUsedTokens: 42_000,
    },
  };

  test("stays quiet on a warm turn that only appended its own delta", () => {
    expect(
      detectPromptCacheMiss({
        previous: warmPrevious,
        current: {
          ...warmPrevious,
          usage: {
            inputTokens: 400,
            outputTokens: 200,
            cacheReadTokens: 42_000,
            cacheCreationTokens: 1_500,
            contextUsedTokens: 44_000,
          },
        },
      }),
    ).toBeNull();
  });

  test("names a model switch as the cause even when reads look healthy", () => {
    // A tool-heavy turn re-reads its rebuilt cache on every later request, so
    // cumulative reads can exceed the previous context; the model change is
    // still a fact and still invalidated the cache.
    const miss = detectPromptCacheMiss({
      previous: warmPrevious,
      current: {
        providerId: "claude-code",
        model: "claude-sonnet-5",
        nativeSessionId: "session-1",
        usage: {
          inputTokens: 1_000,
          outputTokens: 800,
          cacheReadTokens: 120_000,
          cacheCreationTokens: 45_000,
        },
      },
    });
    expect(miss).toMatchObject({
      cause: "model_changed",
      rebuiltTokens: 45_000,
      previousModel: "claude-opus-5",
      model: "claude-sonnet-5",
    });
    expect(formatPromptCacheMissLabel(miss!)).toBe(
      "likely cause: model changed (claude-opus-5 → claude-sonnet-5) · 45,000 tokens re-cached",
    );
  });

  test("names a rotated native session", () => {
    expect(
      detectPromptCacheMiss({
        previous: warmPrevious,
        current: {
          ...warmPrevious,
          nativeSessionId: "session-2",
          usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 43_000 },
        },
      }),
    ).toMatchObject({ cause: "session_changed", rebuiltTokens: 43_000 });
  });

  test("infers a rebuild from a rewrite of the whole previous context", () => {
    // Same model, same session, but the turn wrote the previous context back
    // and read less than it: a cache that expired or was invalidated upstream.
    expect(
      detectPromptCacheMiss({
        previous: warmPrevious,
        current: {
          ...warmPrevious,
          usage: {
            inputTokens: 800,
            outputTokens: 300,
            cacheReadTokens: 0,
            cacheCreationTokens: 41_000,
          },
        },
      }),
    ).toMatchObject({ cause: "context_rebuilt", rebuiltTokens: 41_000 });
    // Ordinary growth — a big file read — is not a miss.
    expect(
      detectPromptCacheMiss({
        previous: warmPrevious,
        current: {
          ...warmPrevious,
          usage: {
            inputTokens: 800,
            outputTokens: 300,
            cacheReadTokens: 42_000,
            cacheCreationTokens: 60_000,
          },
        },
      }),
    ).toBeNull();
  });

  test("says nothing without a previous turn or without cache accounting", () => {
    expect(
      detectPromptCacheMiss({ previous: null, current: warmPrevious }),
    ).toBeNull();
    expect(
      detectPromptCacheMiss({
        previous: warmPrevious,
        current: {
          providerId: "cursor",
          model: "auto",
          usage: { inputTokens: 5, outputTokens: 5, cacheCreationTokens: 50_000 },
        },
      }),
    ).toBeNull();
  });
});

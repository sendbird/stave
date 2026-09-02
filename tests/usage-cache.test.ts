import { describe, expect, test } from "bun:test";
import {
  computePromptCacheStats,
  formatCacheHitLabel,
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

  test("does not claim a 0% hit rate for a provider that reports no cache", () => {
    // Kiro and Cursor never report cache accounting; "0% cached" there would
    // be a fabricated measurement rather than a cold prompt.
    const silent = computePromptCacheStats({
      providerId: "kiro",
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

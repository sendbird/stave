import { describe, expect, test } from "bun:test";
import { buildBoundedHistory } from "@/lib/providers/bounded-history";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import { buildProviderTurnPrompt } from "@/lib/providers/provider-request-translators";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import { resolveLatestConversationContextUsage } from "@/components/ai-elements/prompt-input.utils";
import { normalizeCodexContextUsage } from "../electron/providers/codex-token-usage";
import { createClaudeContextUsageTracker } from "../electron/providers/claude-context-usage";
import { createClaudeCompactionTracker } from "../electron/providers/claude-compaction";
import type { ChatMessage } from "@/types/chat";
import type { ProviderId } from "@/lib/providers/provider.types";

function user(id: string, content: string): ChatMessage {
  return {
    id,
    role: "user",
    providerId: "user",
    model: "user",
    content,
    parts: [{ type: "text", text: content }],
  };
}
function assistant(
  id: string,
  providerId: ProviderId,
  content: string,
): ChatMessage {
  return {
    id,
    role: "assistant",
    providerId,
    model: "model",
    content,
    parts: [{ type: "text", text: content }],
  };
}

describe("provider switch-back context", () => {
  test.each(["claude-code", "codex"] as const)(
    "compact preserves unsynced turns for %s, including split event batches",
    (provider) => {
      const other = provider === "codex" ? "claude-code" : "codex";
      const messages = [
        user("m1", "Build the feature"),
        assistant("m2", provider, "Original work"),
        user("m3", "Keep the accessibility constraints"),
        assistant("m4", other, "Added keyboard navigation"),
        user("m5", "/compact"),
      ];
      const start = replayProviderEventsToTaskState({
        taskId: "task",
        messages,
        provider,
        model: "model",
        turnId: "compact",
        providerSession: {
          [provider]: {
            nativeSessionId: "session",
            syncedThroughMessageId: "m2",
          },
        },
        events: [
          {
            type: "system",
            content: "Context compacted (manual).",
            compactBoundary: { trigger: "manual" },
          },
        ],
      });
      const done = replayProviderEventsToTaskState({
        taskId: "task",
        messages: start.messages,
        provider,
        model: "model",
        turnId: "compact",
        providerSession: start.providerSession,
        events: [{ type: "done" }],
      });
      expect(done.providerSession?.[provider]).toEqual({
        nativeSessionId: "session",
        syncedThroughMessageId: "m2",
      });
      expect(done.activeTurnId).toBeUndefined();
      const request = buildCanonicalConversationRequest({
        providerId: provider,
        history: done.messages,
        userInput: "Continue",
        nativeSessionId: "session",
        syncedThroughMessageId: "m2",
      });
      const prompt = buildProviderTurnPrompt({
        providerId: provider,
        prompt: "Continue",
        conversation: request,
        activeResumeSessionId: "session",
      });
      expect(prompt).toContain("Keep the accessibility constraints");
      expect(prompt).toContain("Added keyboard navigation");
      expect(prompt).not.toContain("Original work");
    },
  );

  test.each(["user_abort", "runtime_failure"])(
    "does not advance a failed turn cursor: %s",
    (stop_reason) => {
      const result = replayProviderEventsToTaskState({
        taskId: "task",
        messages: [user("m3", "Continue")],
        provider: "codex",
        model: "model",
        providerSession: {
          codex: { nativeSessionId: "session", syncedThroughMessageId: "m2" },
        },
        events: [
          { type: "text", text: "Partial output" },
          { type: "done", stop_reason },
        ],
      });
      expect(result.providerSession?.codex).toEqual({
        nativeSessionId: "session",
        syncedThroughMessageId: "m2",
      });
    },
  );

  test("an error persisted before a later done batch preserves the cursor", () => {
    const start = replayProviderEventsToTaskState({
      taskId: "task",
      messages: [user("m3", "Continue")],
      provider: "codex",
      model: "model",
      providerSession: {
        codex: { nativeSessionId: "session", syncedThroughMessageId: "m2" },
      },
      events: [
        { type: "error", message: "Dispatch failed", recoverable: true },
      ],
    });
    const done = replayProviderEventsToTaskState({
      taskId: "task",
      messages: start.messages,
      provider: "codex",
      model: "model",
      providerSession: start.providerSession,
      events: [{ type: "done" }],
    });
    expect(done.providerSession).toEqual(start.providerSession);
  });

  test("legacy native sessions conservatively receive other providers' messages", () => {
    const request = buildCanonicalConversationRequest({
      providerId: "codex",
      history: [assistant("other", "claude-code", "New constraint")],
      userInput: "Continue",
      nativeSessionId: "legacy",
    });
    expect(
      buildProviderTurnPrompt({
        providerId: "codex",
        prompt: "Continue",
        conversation: request,
        activeResumeSessionId: "legacy",
      }),
    ).toContain("New constraint");
  });
});

describe("bounded history", () => {
  test("retains the earliest available request and recent correction within budget", () => {
    const text = buildBoundedHistory({
      messages: [
        { role: "user", text: "Original requirement: keyboard support" },
        { role: "assistant", text: "old output ".repeat(3000) },
        { role: "user", text: "Correction: preserve RTL layout too" },
        { role: "assistant", text: "Latest verified result" },
      ],
    });
    expect(text.length).toBeLessThanOrEqual(12_000);
    expect(text).toContain("user: Original requirement: keyboard support");
    expect(text).toContain("user: Correction: preserve RTL layout too");
    expect(text).toContain("assistant: Latest verified result");
    expect(text).toContain("Some task history is omitted");
    expect(text).toContain("Later corrections take precedence");
  });
  test("short history stays intact and large messages retain role and tail", () => {
    expect(buildBoundedHistory({ messages: [] })).toBe("(no prior messages)");
    expect(
      buildBoundedHistory({ messages: [{ role: "user", text: "Hi" }] }),
    ).toBe("user: Hi");
    const text = buildBoundedHistory({
      messages: [
        {
          role: "user",
          text: "Start " + "x".repeat(20_000) + " final requirement",
        },
      ],
    });
    expect(text).toContain("user: Start");
    expect(text).toContain("final requirement");
    expect(text.length).toBeLessThanOrEqual(12_000);
  });
});

describe("context window snapshots", () => {
  test("Claude compact requires a native boundary, not a successful SDK result alone", () => {
    const pending = createClaudeCompactionTracker("/compact focus on tests");
    pending.observe([{ type: "text", text: "Command finished" }]);
    expect(pending.finish(false)?.type).toBe("error");
    pending.observe([
      {
        type: "system",
        content: "Context compacted (manual).",
        compactBoundary: { trigger: "manual" },
      },
    ]);
    expect(pending.finish(false)).toBeNull();
    expect(createClaudeCompactionTracker("/compact").finish(true)).toBeNull();
    expect(createClaudeCompactionTracker("Continue").finish(false)).toBeNull();
  });
  test("Codex uses last total tokens and model window, not cumulative billing", () => {
    expect(
      normalizeCodexContextUsage({
        last: { totalTokens: 3200, inputTokens: 3000, cachedInputTokens: 2800 },
        total: { totalTokens: 400_000 },
        modelContextWindow: 100_000,
      }),
    ).toEqual({ type: "context_usage", usedTokens: 3200, sizeTokens: 100_000 });
    for (const value of [
      undefined,
      {},
      { last: { totalTokens: -1 }, modelContextWindow: 100 },
      { last: { totalTokens: NaN }, modelContextWindow: 100 },
    ])
      expect(normalizeCodexContextUsage(value)).toBeNull();
  });
  test("Claude combines the latest primary API input/cache/output with the matching model window", () => {
    const track = createClaudeContextUsageTracker();
    const primary = (
      tokens: number,
      parent_tool_use_id: string | null = null,
    ) => ({
      type: "assistant",
      parent_tool_use_id,
      message: {
        model: "primary",
        usage: {
          input_tokens: tokens,
          cache_read_input_tokens: 2000,
          cache_creation_input_tokens: 100,
          output_tokens: 50,
        },
      },
    });
    track(primary(500));
    track(primary(800));
    track(primary(20_000, "child"));
    const result = {
      type: "result",
      usage: { input_tokens: 90_000 },
      modelUsage: {
        primary: { contextWindow: 200_000, inputTokens: 90_000 },
        child: { contextWindow: 1_000_000 },
      },
    };
    expect(track(result)).toEqual({
      type: "context_usage",
      usedTokens: 2950,
      sizeTokens: 200_000,
    });
    track({ type: "system", subtype: "compact_boundary" });
    expect(track(result)).toBeNull();
  });
  test("selected provider never inherits another provider's context meter", () => {
    const a = {
      ...assistant("a", "codex", "Done"),
      usage: { inputTokens: 1, outputTokens: 1, contextUsedPercent: 20 },
    };
    const b = {
      ...assistant("b", "claude-code", "Done"),
      usage: { inputTokens: 1, outputTokens: 1, contextUsedPercent: 90 },
    };
    expect(
      resolveLatestConversationContextUsage([a, b], "codex")?.usedPercent,
    ).toBe(20);
    expect(
      resolveLatestConversationContextUsage([a, b], "claude-code")?.usedPercent,
    ).toBe(90);
    expect(resolveLatestConversationContextUsage([a, b], "kiro")).toBeNull();
  });
  test("manual compaction stops showing an older snapshot until the next report", () => {
    const before = {
      ...assistant("before", "codex", "Done"),
      usage: { inputTokens: 1, outputTokens: 1, contextUsedPercent: 90 },
    };
    const after = {
      ...assistant("after", "codex", ""),
      parts: [
        {
          type: "system_event" as const,
          content: "Context compacted (manual).",
          compactBoundary: { trigger: "manual" },
        },
      ],
    };
    expect(
      resolveLatestConversationContextUsage([before, after], "codex"),
    ).toBeNull();
  });
  test("failed compaction clears the transient progress row", () => {
    const result = replayProviderEventsToTaskState({
      taskId: "task",
      messages: [user("m1", "/compact")],
      provider: "codex",
      model: "model",
      events: [
        { type: "system", content: "Compacting conversation context…" },
        { type: "error", message: "Compaction failed", recoverable: true },
        { type: "done", stop_reason: "runtime_failure" },
      ],
    });
    expect(
      result.messages
        .at(-1)
        ?.parts.some(
          (part) =>
            part.type === "system_event" &&
            part.content.startsWith("Compacting conversation"),
        ),
    ).toBe(false);
    expect(
      result.messages
        .at(-1)
        ?.parts.some(
          (part) =>
            part.type === "system_event" &&
            part.content.includes("Compaction failed"),
        ),
    ).toBe(true);
  });
});

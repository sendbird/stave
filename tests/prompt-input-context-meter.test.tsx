import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PromptInputContextMeter,
  advanceBoundaryAnnouncement,
  startBoundaryAnnouncement,
} from "@/components/ai-elements/prompt-input-context-meter";
import { conversationContextUsageTone } from "@/components/ai-elements/prompt-input.utils";
import { PromptInputContextBreakdown } from "@/components/ai-elements/prompt-input-context-breakdown";
import { contextMeterStyles } from "@/components/ai-elements/prompt-input-context-meter.styles";
import { sx } from "@/components/ads/utils/stylex";

describe("PromptInputContextMeter", () => {
  test("announces the fill and offers compact when available", () => {
    const html = renderToStaticMarkup(
      createElement(PromptInputContextMeter, {
        usage: {
          usedPercent: 75,
          usedTokens: 750,
          windowTokens: 1_000,
          remainingTokens: 250,
          messageId: "assistant-1",
        },
        compactAvailable: true,
        compactDisabled: false,
        onCompact: () => {},
      }),
    );

    // The trigger names what is left, not only what is used.
    expect(html).toContain('aria-label="Conversation context 75% used: 750 of 1,000 tokens, 250 tokens left"');
    expect(html).toContain(">75%<");
    // 75% is the warn tone; assert against the StyleX style identity rather
    // than a Tailwind class string.
    expect(html).toContain(sx(contextMeterStyles.fillWarn));
    expect(html).toContain("width:75%");
  });

  test("uses the ok tone for a light fill", () => {
    const html = renderToStaticMarkup(
      createElement(PromptInputContextMeter, {
        usage: {
          usedPercent: 12,
          messageId: "assistant-1",
        },
        compactAvailable: false,
        compactDisabled: true,
      }),
    );

    expect(html).toContain('aria-label="Conversation context 12% used"');
    expect(html).toContain(sx(contextMeterStyles.fillOk));
    expect(html).toContain("width:12%");
  });

  test("never reads the composition while rendering, and keeps one polite region ready", () => {
    let loads = 0;
    const html = renderToStaticMarkup(
      createElement(PromptInputContextMeter, {
        usage: { usedPercent: 72, usedTokens: 72_000, windowTokens: 100_000, messageId: "assistant-1" },
        compactAvailable: true,
        compactDisabled: false,
        providerId: "claude-code",
        loadBreakdown: async () => {
          loads += 1;
          return { ok: false, detail: "should not run" };
        },
      }),
    );
    expect(loads).toBe(0);
    expect(html).toContain('aria-label="Conversation context 72% used: 72,000 of 100,000 tokens, 28,000 tokens left"');
    // A meter that mounts already past a boundary did not cross it.
    expect(html).toMatch(/role="status"[^>]*><\/span>|aria-live="polite"[^>]*><\/span>/);
  });
});

describe("context boundary announcement", () => {
  test("speaks once when the meter first climbs into warning, and once into danger", () => {
    let state = startBoundaryAnnouncement(conversationContextUsageTone(59));
    state = advanceBoundaryAnnouncement(state, conversationContextUsageTone(60), "60%");
    expect(state.text).toBe("Conversation context is 60% full.");
    const afterWarning = state;
    // Staying in warning says nothing new.
    state = advanceBoundaryAnnouncement(state, conversationContextUsageTone(61), "61%");
    expect(state).toBe(afterWarning);
    state = advanceBoundaryAnnouncement(state, conversationContextUsageTone(86), "86%");
    expect(state.text).toBe("Conversation context is 86% full and close to its limit.");
    // A compact drops it back; climbing again does not repeat a boundary.
    state = advanceBoundaryAnnouncement(state, conversationContextUsageTone(20), "20%");
    state = advanceBoundaryAnnouncement(state, conversationContextUsageTone(70), "70%");
    expect(state.text).toBe("Conversation context is 86% full and close to its limit.");
    expect(state.announced).toEqual(["warning", "danger"]);
  });

  test("a meter that mounts past a boundary did not cross it", () => {
    const state = startBoundaryAnnouncement(conversationContextUsageTone(90));
    expect(advanceBoundaryAnnouncement(state, conversationContextUsageTone(91), "91%").text).toBe("");
  });
});

describe("PromptInputContextBreakdown", () => {
  const snapshot = {
    categories: [
      { id: "system_prompt" as const, name: "System prompt", tokens: 3_100, color: "gray", kind: "used" as const },
      { id: "mcp_tools" as const, name: "MCP tools", tokens: 8_200, color: "cyan", kind: "used" as const },
      { id: "memory_files" as const, name: "Memory files", tokens: 2_300, color: "orange", kind: "used" as const },
    ],
    totalTokens: 13_600,
    maxTokens: 100_000,
    rawMaxTokens: 100_000,
    percentage: 14,
    model: "claude-test",
    memoryFiles: [{ path: "/tmp/workspace/CLAUDE.md", type: "Project", tokens: 2_300 }],
    mcpTools: [{ name: "search", serverName: "docs", tokens: 8_200 }],
  };

  test("lists Claude's fixed parts with an estimated conversation row", () => {
    const html = renderToStaticMarkup(
      createElement(PromptInputContextBreakdown, {
        providerId: "claude-code",
        state: { status: "ready", snapshot },
        usedTokens: 72_000,
      }),
    );
    expect(html).toContain("Composition");
    expect(html).toContain("System prompt");
    expect(html).toContain("MCP tools");
    expect(html).toContain("Conversation (estimated)");
    // Each part to a tenth of a thousand, so the rows add up to the total.
    expect(html).toContain(">58.4k<");
    expect(html).toContain(">3.1k<");
    // MCP tools and memory files expand; the plain row does not.
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(2);
  });

  test("says another provider reports no breakdown instead of inventing one", () => {
    const html = renderToStaticMarkup(
      createElement(PromptInputContextBreakdown, {
        providerId: "codex",
        state: { status: "idle" },
        usedTokens: 72_000,
      }),
    );
    expect(html).toContain("This provider doesn&#x27;t report what fills the context.");
    expect(html).not.toContain("Conversation (estimated)");
    expect(html).toContain('data-context-breakdown="not-reported"');
  });

  test("shows a measuring line until the read answers", () => {
    const html = renderToStaticMarkup(
      createElement(PromptInputContextBreakdown, {
        providerId: "claude-code",
        state: { status: "loading" },
        usedTokens: 72_000,
      }),
    );
    expect(html).toContain("Measuring…");
  });
});

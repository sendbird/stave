import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";

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

    expect(html).toContain('aria-label="Conversation context 75% used"');
    expect(html).toContain(">75%<");
    expect(html).toContain("bg-warning");
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
    expect(html).toContain("bg-success");
    expect(html).toContain("width:12%");
  });
});

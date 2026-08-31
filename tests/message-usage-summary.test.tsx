import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MessageUsageSummary } from "../src/components/session/message-usage-summary";

describe("MessageUsageSummary", () => {
  test("exposes the turn and delegated execution summary to keyboard users", () => {
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        usage: {
          inputTokens: 120,
          outputTokens: 18,
          cacheReadTokens: 90,
        },
        delegatedUsage: [
          {
            executionId: "advisor-1",
            role: "advisor",
            providerId: "codex",
            model: "gpt-5.6-terra",
            inputTokens: 80,
            outputTokens: 12,
            cacheReadTokens: 64,
            sessionReused: true,
          },
        ],
      }),
    );

    expect(html).toContain("<button");
    expect(html).toContain(
      'aria-label="Turn usage details: 120 input tokens, 18 output tokens, 1 delegated execution"',
    );
    expect(html).toContain("1 delegated");
  });
});

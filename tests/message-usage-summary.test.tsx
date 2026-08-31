import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MessageUsageSummary } from "../src/components/session/message-usage-summary";

describe("MessageUsageSummary", () => {
  test("exposes the turn and delegated execution summary to keyboard users", () => {
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        providerId: "cursor",
        model: "gpt-5.6-sol[context=272k,reasoning=high,fast=true]",
        usage: {
          inputTokens: 120,
          outputTokens: 18,
          cacheReadTokens: 90,
          contextUsedTokens: 144,
          contextWindowTokens: 1024,
          contextCostAmount: 0.002,
          contextCostCurrency: "USD",
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
      'aria-label="Turn usage details for Cursor · gpt-5.6-sol[context=272k,reasoning=high,fast=true]: 120 input tokens, 18 output tokens, 1 delegated execution"',
    );
    expect(html).toContain("1 delegated");
  });

  test("omits unconfirmed delegated placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        delegatedUsage: [
          {
            executionId: "worker-pending",
            role: "worker",
            providerId: "kiro",
            model: "kiro-model",
          },
        ],
      }),
    );

    expect(html).toBe("");
  });

  test("identifies persisted Kiro usage after the current login changes", () => {
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        providerId: "kiro",
        model: "kiro-model",
        usage: { inputTokens: 21, outputTokens: 13 },
      }),
    );

    expect(html).toContain(
      'aria-label="Turn usage details for Kiro · kiro-model: 21 input tokens, 13 output tokens"',
    );
  });
});

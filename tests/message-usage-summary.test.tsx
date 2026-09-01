import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MessageUsageSummary,
  providerMayOmitTurnUsage,
} from "../src/components/session/message-usage-summary";

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

  test("shows a percentage and credit spend when no token counts arrive", () => {
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        providerId: "kiro",
        model: "auto",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          contextUsedPercent: 3.671,
          contextCostAmount: 0.05413,
          contextCostCurrency: "credits",
        },
      }),
    );

    expect(html).toContain("3.7%");
    expect(html).toContain("0.0541 credits");
    // A 0/0 token pair means "not reported", not a zero-token turn.
    expect(html).not.toContain("0 input tokens");
  });

  test("does not keep an empty-state badge for Cursor", () => {
    // Cursor never reports over ACP. An always-on "not reported" badge would
    // just decorate every Cursor turn, so the control stays off until numbers
    // actually arrive.
    expect(providerMayOmitTurnUsage("cursor")).toBe(false);
    expect(providerMayOmitTurnUsage("kiro")).toBe(true);
    expect(providerMayOmitTurnUsage("claude-code")).toBe(false);
    expect(
      renderToStaticMarkup(
        createElement(MessageUsageSummary, {
          providerId: "cursor",
          model: "composer-2.5",
        }),
      ),
    ).toBe("");
  });

  test("does not print a fabricated zero token pair for Cursor", () => {
    // Cursor reports context and cost but never token counts, so the usage
    // record it produces is seeded with 0/0.
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        providerId: "cursor",
        model: "composer-2.5",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          contextUsedPercent: 12.5,
          contextCostAmount: 0.002,
          contextCostCurrency: "USD",
        },
      }),
    );

    expect(html).toContain("13%");
    expect(html).not.toContain("0 input tokens");
    expect(html).toContain(
      'aria-label="Turn usage details for Cursor · composer-2.5: token usage not reported by the provider"',
    );

    // Nothing reported at all still renders nothing rather than an empty chip.
    expect(
      renderToStaticMarkup(
        createElement(MessageUsageSummary, {
          providerId: "cursor",
          model: "composer-2.5",
          usage: { inputTokens: 0, outputTokens: 0 },
        }),
      ),
    ).toBe("");
  });

  test("says so explicitly when Kiro reports no usage", () => {
    const html = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        providerId: "kiro",
        model: "auto",
      }),
    );

    expect(html).toContain("usage not reported");
    expect(html).toContain(
      'aria-label="Turn usage details for Kiro · auto: token usage not reported by the provider"',
    );
  });

  test("leaves native runtimes on their literal rendering", () => {
    // Scoped to ACP: a Claude turn that reports 0/0 still says 0/0, and a
    // Claude message with no usage record renders no badge at all.
    const zeroed = renderToStaticMarkup(
      createElement(MessageUsageSummary, {
        providerId: "claude-code",
        model: "opus",
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    );
    expect(zeroed).not.toContain("usage not reported");
    expect(zeroed).toContain(
      'aria-label="Turn usage details for Claude · opus: 0 input tokens, 0 output tokens"',
    );

    expect(
      renderToStaticMarkup(
        createElement(MessageUsageSummary, {
          providerId: "codex",
          model: "gpt-5.6-terra",
        }),
      ),
    ).toBe("");
  });
});

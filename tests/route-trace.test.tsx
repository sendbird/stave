import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRouteTraceSignals,
  isRoutedDecision,
  RouteTrace,
} from "@/components/auto-routing";
import {
  buildAutoRoutingDecisionRecord,
  type AutoRoutingDecision,
} from "@/store/auto-routing";

const PROMPT =
  "Fix the terminal host close ordering so the PTY is torn down before the renderer detaches.";

function buildDecision(overrides: Partial<AutoRoutingDecision> = {}): AutoRoutingDecision {
  return {
    providerId: "claude-code",
    model: "claude-sonnet-5",
    role: "primary",
    taskType: "implementation",
    taskClass: "implement",
    tier: "standard",
    confidence: 0.82,
    source: "heuristic",
    rationale: "implement · medium complexity · 3 files · budget 86%",
    ruleId: "implement",
    ruleReason: "Implementation runs on Sonnet 5 at high effort · budget guard −1 rung",
    stance: "balanced",
    signals: {
      taskClass: "implement",
      complexity: "medium",
      sensitive: false,
      fileContextCount: 3,
      budgetUsedPercent: 86,
      lastAssistantProvider: "claude-code",
    },
    providerChanged: false,
    stick: false,
    claudeEffort: "high",
    ...overrides,
  };
}

function render(decision: AutoRoutingDecision, props: { defaultCollapsed?: boolean } = {}) {
  const record = buildAutoRoutingDecisionRecord({ decision, prompt: PROMPT });
  return renderToStaticMarkup(
    createElement(RouteTrace, {
      record,
      budgetStepDownAt: 80,
      providerAvailability: { kiro: false },
      ...props,
    }),
  );
}

describe("RouteTrace", () => {
  test("draws only the hops the router landed on, in order", () => {
    const html = render(buildDecision());
    const order = ["prompt", "signals", "task", "rule", "model"].map((hop) =>
      html.indexOf(`data-hop="${hop}"`),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    expect(html).toContain(PROMPT);
    expect(html).toContain("Implementation");
    expect(html).toContain('data-rule-id="implement"');
    expect(html).toContain("budget guard −1 rung");
    // The model is named once by identity; the provider label does not repeat it.
    expect(html).toContain("Sonnet 5");
    expect(html).not.toContain("Claude Code · ");
    // No alternatives: the flow table's muted rows are absent here.
    expect(html).not.toContain("skipped");
    expect(html).not.toContain('data-task-class="plan"');
  });

  test("marks the signals that moved the decision", () => {
    const chips = buildRouteTraceSignals({
      decision: buildDecision({
        signals: {
          taskClass: "implement",
          complexity: "high",
          sensitive: true,
          skill: "ci-fix",
          fileContextCount: 1,
          budgetUsedPercent: 86,
        },
      }),
      budgetStepDownAt: 80,
      providerAvailability: { kiro: false },
    });
    const decisive = chips.filter((chip) => chip.decisive).map((chip) => chip.id);
    expect(decisive).toEqual(["skill", "sensitive", "budget", "providers"]);
    expect(chips.find((chip) => chip.id === "files")?.label).toBe("1 file");

    const html = render(buildDecision());
    expect(html).toContain('data-signal="budget" data-decisive="true"');
    expect(html).toContain("Kiro unavailable");
  });

  test("folds to the one-line answer when collapsed", () => {
    const html = render(buildDecision(), { defaultCollapsed: true });
    expect(html).toContain('data-collapsed="true"');
    expect(html).not.toContain('data-testid="route-trace-chain"');
    expect(html).toContain("Sonnet 5");
    expect(html).toContain("implement");
    expect(html).toContain('aria-expanded="false"');
  });

  test("treats manual picks and disabled Auto as no route", () => {
    const routed = buildAutoRoutingDecisionRecord({ decision: buildDecision(), prompt: PROMPT });
    const manual = buildAutoRoutingDecisionRecord({
      decision: buildDecision({ source: "manual", ruleId: null }),
      prompt: PROMPT,
    });
    const disabled = buildAutoRoutingDecisionRecord({
      decision: buildDecision({ source: "disabled", ruleId: null }),
      prompt: PROMPT,
    });
    expect(isRoutedDecision(routed)).toBe(true);
    expect(isRoutedDecision(manual)).toBe(false);
    expect(isRoutedDecision(disabled)).toBe(false);
    expect(isRoutedDecision(null)).toBe(false);
  });
});

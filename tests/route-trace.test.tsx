import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRouteTraceSignals,
  isRoutedDecision,
  RouteTrace,
  routeTraceEntryFromRecord,
  routeTraceEntryFromResolution,
} from "@/components/auto-routing";
import { routeTraceStyles } from "@/components/auto-routing/route-trace.styles";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildAutoRoutingDecisionRecord,
  type AutoRoutingDecision,
} from "@/lib/routing/auto-routing";

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
      entry: routeTraceEntryFromRecord(record),
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
      providerAvailability: { codex: false },
    });
    const decisive = chips.filter((chip) => chip.decisive).map((chip) => chip.id);
    expect(decisive).toEqual(["skill", "sensitive", "budget", "providers"]);
    expect(chips.find((chip) => chip.id === "files")?.label).toBe("1 file");

    const html = render(buildDecision());
    expect(html).toContain('data-signal="budget" data-decisive="true"');
  });

  test("names an unavailable provider only when the decision involved it", () => {
    const notSetUp = { cursor: false, kiro: false, opencode: false } as const;
    const providerChip = (decision: AutoRoutingDecision, availability: Record<string, boolean>) =>
      buildRouteTraceSignals({ decision, providerAvailability: availability }).find((chip) => chip.id === "providers");

    // CLIs the user never set up are not part of a Claude decision.
    expect(providerChip(buildDecision(), notSetUp)).toBeUndefined();
    expect(render(buildDecision())).not.toContain("Kiro unavailable");
    // A managed provider's outage always matters.
    expect(providerChip(buildDecision(), { ...notSetUp, codex: false })?.label).toBe("Codex unavailable");
    // The task was running on Kiro, so its outage moved the route.
    const offKiro = buildDecision({ signals: { ...buildDecision().signals, lastAssistantProvider: "kiro" } });
    expect(providerChip(offKiro, notSetUp)?.label).toBe("Kiro unavailable");
  });

  test("keeps the header identity on one aligned row", () => {
    const html = render(buildDecision(), { defaultCollapsed: true });
    expect(html).toContain('data-testid="route-trace-header"');
    expect(html).toContain(sx(routeTraceStyles.title));
    expect(html).toContain(sx(routeTraceStyles.titleIdentity));
    expect(html).toContain("← implement");
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

describe("RouteTrace from a saved turn", () => {
  const gatewayDecision = {
    providerId: "gateway" as const,
    model: "claude-sonnet-5",
    preferred: { mode: "gateway" as const, connectionId: "6f1d1c8e-8a4b-4c6f-9a55-0c0f0b7d6a10", model: "anthropic/claude-sonnet-5" },
    fallback: false,
    elapsedMs: 1_840,
    reportedCostUsd: 0.000_42,
  };
  const resolution = {
    selectedProviderId: "claude-code" as const,
    selectedModel: "claude-sonnet-5",
    source: "classifier" as const,
    rationale: "implement · medium complexity · 3 files · budget 86%",
    confidence: 0.82,
    taskType: "implementation" as const,
    ruleId: "implement",
    ruleReason: "Implementation runs on Sonnet 5 at high effort",
    taskClass: "implement",
    stance: "balanced",
    routingDecision: gatewayDecision,
  };

  function renderEntry(entry: ReturnType<typeof routeTraceEntryFromResolution>) {
    return renderToStaticMarkup(createElement(RouteTrace, { entry, budgetStepDownAt: 80 }));
  }

  test("draws the saved decision without the signals only memory kept", () => {
    const html = renderEntry(routeTraceEntryFromResolution({
      resolution,
      message: { modelInfo: { effort: "high" } },
      prompt: `  ${PROMPT}\n`,
    }));
    expect(html).toContain('data-route-origin="recorded"');
    expect(html).toContain(PROMPT);
    expect(html).not.toContain('data-hop="signals"');
    const order = ["prompt", "decision", "task", "rule", "model"].map((hop) => html.indexOf(`data-hop="${hop}"`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Display name, with the raw id kept for the hover title.
    expect(html).toContain('title="claude-sonnet-5"');
    expect(html).toContain("1.8s");
    expect(html).toContain('data-decision-fact="cost"');
    expect(html).not.toContain('data-decision-fact="failure"');
  });

  test("adds the live signals only when memory holds the same decision", () => {
    const live = buildAutoRoutingDecisionRecord({
      decision: buildDecision({ source: "classifier", rationale: resolution.rationale }),
      prompt: PROMPT,
    });
    const same = routeTraceEntryFromResolution({ resolution, message: {}, prompt: PROMPT, live });
    expect(renderEntry(same)).toContain('data-hop="signals"');
    const newer = buildAutoRoutingDecisionRecord({
      decision: buildDecision({ source: "classifier", rationale: "plan · high complexity", taskClass: "plan" }),
      prompt: "Plan the migration",
    });
    const other = routeTraceEntryFromResolution({ resolution, message: {}, prompt: PROMPT, live: newer });
    const html = renderEntry(other);
    expect(html).not.toContain('data-hop="signals"');
    expect(html).toContain('data-task-class="implement"');
  });

  test("names a Gateway failure only when it carries its own reason", () => {
    const failed = routeTraceEntryFromResolution({
      resolution: { ...resolution, routingDecision: { ...gatewayDecision, providerId: "codex", model: "gpt-6-luna", fallback: true, failure: "budget", reportedCostUsd: null } },
      message: {},
      prompt: PROMPT,
    });
    const html = renderEntry(failed);
    expect(html).toContain('data-decision-fact="failure"');
    expect(html).toContain("budget exhausted");
    expect(html).not.toContain('data-decision-fact="cost"');
    const vague = renderEntry(routeTraceEntryFromResolution({
      resolution: { ...resolution, routingDecision: { ...gatewayDecision, fallback: true, failure: "unavailable", reportedCostUsd: null } },
      message: {},
      prompt: PROMPT,
    }));
    expect(vague).not.toContain('data-decision-fact="failure"');
  });

  test("a saved turn without decision facts draws no decision hop", () => {
    const { routingDecision: _omit, ...plain } = resolution;
    const html = renderEntry(routeTraceEntryFromResolution({ resolution: plain, message: {}, prompt: "" }));
    expect(html).not.toContain('data-hop="decision"');
  });
});

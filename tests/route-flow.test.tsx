import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { explainRuleMiss, RouteFlow } from "@/components/auto-routing";
import {
  buildStarterProfile,
  resolveRoute,
  type RouteRule,
  type RouterSignals,
} from "@/lib/providers/auto-routing-profile";
import { computeRouterSignals, summarizeRouterSignals } from "@/store/auto-routing";

const PLAN_PROMPT =
  "Plan how to move the terminal host to a single close pipeline. Which modules change, in what order, and what could break?";

function buildRouteFlowProfile() {
  const profile = buildStarterProfile("balanced");
  profile.rules = [
    {
      id: "safety-critical",
      when: { taskClass: "safety-critical", sensitive: true },
      then: { providerId: "any-eligible" },
      reason: "Escalate safety-critical work.",
      enabled: true,
    },
    {
      id: "skill-ship",
      when: { skill: ["ship"] },
      then: { providerId: "any-eligible" },
      reason: "Use the shipping route.",
      enabled: true,
    },
    {
      id: "budget-cheapest",
      when: { budgetUsedAtLeast: 97 },
      then: { providerId: "any-eligible" },
      reason: "Use the cheapest route at the budget limit.",
      enabled: true,
    },
    {
      id: "plan",
      when: { taskClass: "plan" },
      then: { providerId: "any-eligible" },
      reason: "Route planning work.",
      enabled: true,
    },
    {
      id: "implement",
      when: { taskClass: "implement" },
      then: { providerId: "any-eligible" },
      reason: "Route implementation work.",
      enabled: true,
    },
    {
      id: "advisor-default",
      when: { role: "advisor" },
      then: { providerId: "any-eligible" },
      reason: "Route advisor work.",
      enabled: true,
    },
  ];
  return profile;
}

function renderPlanFlow(options: { compact?: boolean } = {}) {
  const profile = buildRouteFlowProfile();
  const { signals } = computeRouterSignals({
    prompt: PLAN_PROMPT,
    fileContextCount: 0,
    history: [],
    currentProviderId: "claude-code",
    profile,
    phase: "plan",
  });
  const route = resolveRoute({ profile, role: "primary", signals });
  const html = renderToStaticMarkup(
    createElement(RouteFlow, {
      profile,
      signals,
      route,
      summary: summarizeRouterSignals(signals),
      prompt: PLAN_PROMPT,
      role: "primary",
      compact: options.compact,
      "data-testid": "route-flow",
    }),
  );
  return { html, route, profile };
}

function nodeHtml(html: string, attribute: string) {
  const start = html.indexOf(attribute);
  if (start === -1) {
    return null;
  }
  const open = html.lastIndexOf("<div", start);
  const close = html.indexOf("</div>", start);
  return html.slice(open, close);
}

describe("RouteFlow", () => {
  test("lights the matched task class, rule and model and explains skipped rules", () => {
    const { html, route } = renderPlanFlow();
    expect(route.taskClass).toBe("plan");
    expect(route.ruleId).toBe("plan");

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Routing decision"');

    const planClass = nodeHtml(html, 'data-task-class="plan"');
    expect(planClass).not.toBeNull();
    expect(planClass).toContain('aria-current="true"');
    const implementClass = nodeHtml(html, 'data-task-class="implement"');
    expect(implementClass).not.toContain("aria-current");

    const planRule = nodeHtml(html, 'data-rule-id="plan"');
    expect(planRule).toContain('data-rule-state="matched"');
    expect(planRule).toContain('aria-current="true"');

    // Rules above the match on the primary table carry the first failing condition.
    const safety = nodeHtml(html, 'data-rule-id="safety-critical"');
    expect(safety).toContain('data-rule-state="skipped"');
    expect(safety).toContain("skipped · task class is Plan");
    const ship = nodeHtml(html, 'data-rule-id="skill-ship"');
    expect(ship).toContain("skipped · skill not present");
    const budget = nodeHtml(html, 'data-rule-id="budget-cheapest"');
    expect(budget).toContain("skipped · usage unknown");

    // Rules below the match are muted with no note.
    const implementRule = nodeHtml(html, 'data-rule-id="implement"');
    expect(implementRule).toContain('data-rule-state="below"');
    expect(implementRule).not.toContain("skipped ·");

    // Delegated-role rules stay out of the primary column.
    expect(html).not.toContain('data-rule-id="advisor-default"');

    const chosen = nodeHtml(html, `data-model="${route.model}"`);
    expect(chosen).toContain('aria-current="true"');
    expect(chosen).toContain("rule target");

    expect(html).toContain('data-testid="route-flow-summary"');
    expect(html).toContain(`Plan via rule plan → `);
    expect(html).toContain(route.reason);
  });

  test("compact hides the skipped-rule notes", () => {
    const { html } = renderPlanFlow({ compact: true });
    expect(html).not.toContain("skipped ·");
    expect(html).toContain('data-rule-state="skipped"');
  });

  test("shows a lit fallback node when no rule matched", () => {
    const profile = buildRouteFlowProfile();
    profile.rules = profile.rules.filter((rule) => rule.id !== "plan");
    const { signals } = computeRouterSignals({
      prompt: PLAN_PROMPT,
      fileContextCount: 0,
      history: [],
      currentProviderId: "claude-code",
      profile,
      phase: "plan",
    });
    const route = resolveRoute({ profile, role: "primary", signals });
    expect(route.ruleId).toBeNull();
    const html = renderToStaticMarkup(
      createElement(RouteFlow, {
        profile,
        signals,
        route,
        summary: summarizeRouterSignals(signals),
        prompt: PLAN_PROMPT,
        role: "primary",
      }),
    );
    const fallback = nodeHtml(html, 'data-rule-id="fallback"');
    expect(fallback).toContain('aria-current="true"');
    expect(html).toContain("Plan via fallback →");
  });
});

describe("explainRuleMiss", () => {
  const baseSignals: RouterSignals = {
    taskClass: "implement",
    complexity: "medium",
    sensitive: false,
    fileContextCount: 0,
    budgetUsedPercent: 41,
    currentProviderId: "claude-code",
  };
  const rule = (when: RouteRule["when"], enabled = true): RouteRule => ({
    id: "r",
    when,
    then: { providerId: "any-eligible" },
    reason: "",
    enabled,
  });

  test("returns the first failing condition in router order", () => {
    expect(explainRuleMiss(rule({ taskClass: "plan" }, false), baseSignals, "primary")).toBe(
      "disabled",
    );
    expect(explainRuleMiss(rule({ role: "advisor" }), baseSignals, "primary")).toBe(
      "role is Primary",
    );
    expect(explainRuleMiss(rule({ taskClass: "plan" }), baseSignals, "primary")).toBe(
      "task class is Implement",
    );
    expect(explainRuleMiss(rule({ sensitive: true }), baseSignals, "primary")).toBe(
      "not sensitive",
    );
    expect(explainRuleMiss(rule({ budgetUsedAtLeast: 97 }), baseSignals, "primary")).toBe(
      "usage 41% < 97%",
    );
    expect(explainRuleMiss(rule({ skill: ["ship"] }), baseSignals, "primary")).toBe(
      "skill not present",
    );
    expect(
      explainRuleMiss(rule({ skill: ["ship"] }), { ...baseSignals, skill: "ci-fix" }, "primary"),
    ).toBe("skill is /ci-fix");
    expect(
      explainRuleMiss(rule({ skill: ["ship"] }), { ...baseSignals, skill: "ship" }, "primary", {
        skillRouting: false,
      }),
    ).toBe("skill routing off");
    expect(explainRuleMiss(rule({ complexity: "high" }), baseSignals, "primary")).toBe(
      "complexity is medium",
    );
  });

  test("returns null when every condition holds", () => {
    expect(
      explainRuleMiss(
        rule({ taskClass: "implement", budgetUsedAtLeast: 40 }),
        baseSignals,
        "primary",
      ),
    ).toBeNull();
  });
});

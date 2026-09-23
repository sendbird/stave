import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  type RouteRule,
} from "@/lib/providers/auto-routing-profile";
import {
  analyzeUsage,
  buildProfileFromUsage,
  collectUsageSamples,
  describeRuleThen,
  recommendStance,
  USAGE_PROFILE_NAME,
  wizardChangeKey,
  type UsageSample,
} from "@/lib/providers/auto-routing-wizard";
import {
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_HAIKU_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
} from "@/lib/providers/model-catalog";
import type { ChatMessage } from "@/types/chat";

function sample(
  prompt: string,
  model: string,
  overrides: Partial<UsageSample> = {},
): UsageSample {
  return { prompt, providerId: "claude-code", model, ...overrides };
}

const PLAN_PROMPTS = [
  "Plan the architecture for the new notifications module",
  "Design a strategy for the settings redesign and list the phases",
  "Plan how we should split the monolith into packages",
  "Outline an architecture plan for the offline cache",
  "Plan the rollout of the new theme editor step by step",
  "Design the approach for the routine scheduler refactor",
];
const IMPLEMENT_PROMPTS = [
  "Implement the settings dialog for routing profiles",
  "Implement the new toolbar button and wire it to the store",
  "Implement pagination for the task list component",
  "Implement a hook that tracks the active workspace",
  "Implement the export command for custom themes",
  "Implement the empty state for the delegation panel",
];
const CI_FIX_PROMPTS = [
  "Fix the failing CI pipeline on main",
  "The lint job fails in CI, fix it",
  "CI is red because of the typecheck step, fix it",
  "Fix the flaky CI test that fails on the build step",
];
const SHIP_PROMPTS = ["/ship", "/ship release 0.19", "/ship it now"];
const DEBUG_PROMPTS = [
  "Debug why the app crashes on startup",
  "Debug the stack trace from the terminal pane",
];

/** ~21 turns: plans on Opus, coding on Fable, CI and /ship on Haiku. */
function buildFixture(): UsageSample[] {
  return [
    ...PLAN_PROMPTS.slice(0, 5).map((prompt, index) =>
      sample(prompt, DEFAULT_CLAUDE_OPUS_MODEL, {
        effort: "medium",
        at: `2026-09-0${index + 1}T00:00:00.000Z`,
      }),
    ),
    sample(PLAN_PROMPTS[5] ?? "", "gpt-5.5", {
      providerId: "codex",
      at: "2026-09-06T00:00:00.000Z",
    }),
    ...IMPLEMENT_PROMPTS.slice(0, 4).map((prompt) =>
      sample(prompt, CLAUDE_FABLE_MODEL, { effort: "high" }),
    ),
    ...IMPLEMENT_PROMPTS.slice(4).map((prompt) =>
      sample(prompt, DEFAULT_CLAUDE_SONNET_MODEL, { effort: "high" }),
    ),
    ...CI_FIX_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_HAIKU_MODEL)),
    ...SHIP_PROMPTS.map((prompt) =>
      sample(prompt, DEFAULT_CLAUDE_HAIKU_MODEL, { skill: "ship" }),
    ),
    ...DEBUG_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_SONNET_MODEL)),
  ];
}

function message(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">,
): ChatMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    model: overrides.role === "user" ? "" : DEFAULT_CLAUDE_OPUS_MODEL,
    providerId: overrides.role === "user" ? "user" : "claude-code",
    parts: [],
    ...overrides,
  };
}

function findRule(rules: RouteRule[], predicate: (rule: RouteRule) => boolean) {
  // Complexity-split siblings (implement-deep, debug-light) share a task class
  // with the generic rule; the wizard only ever replaces the generic one.
  const matches = rules.filter(predicate);
  const rule = matches.find((entry) => entry.when.complexity === undefined) ?? matches[0];
  if (!rule) {
    throw new Error("expected rule");
  }
  return rule;
}

describe("collectUsageSamples", () => {
  test("pairs each user prompt with the answering assistant turn", () => {
    const messages: ChatMessage[] = [
      message({ role: "user", content: "/ship release" }),
      message({
        role: "assistant",
        content: "Shipped.",
        model: DEFAULT_CLAUDE_HAIKU_MODEL,
        startedAt: "2026-09-01T00:00:00.000Z",
      }),
      message({ role: "user", content: "Plan the settings redesign" }),
      message({
        role: "assistant",
        content: "",
        model: DEFAULT_CLAUDE_OPUS_MODEL,
        modelInfo: { effort: "medium" },
      }),
      // Unanswered prompt: the next row is another user turn.
      message({ role: "user", content: "Implement the plan" }),
      message({ role: "user", content: "Still streaming" }),
      message({
        role: "assistant",
        content: "...",
        model: CLAUDE_FABLE_MODEL,
        isStreaming: true,
      }),
      message({ role: "user", content: "Auto model" }),
      message({ role: "assistant", content: "ok", model: "auto" }),
      message({ role: "user", content: "Empty model" }),
      message({ role: "assistant", content: "ok", model: "  " }),
    ];

    const samples = collectUsageSamples(messages);

    expect(samples).toEqual([
      {
        prompt: "/ship release",
        providerId: "claude-code",
        model: DEFAULT_CLAUDE_HAIKU_MODEL,
        at: "2026-09-01T00:00:00.000Z",
        skill: "ship",
      },
      {
        prompt: "Plan the settings redesign",
        providerId: "claude-code",
        model: DEFAULT_CLAUDE_OPUS_MODEL,
        effort: "medium",
      },
    ]);
  });

  test("returns nothing for an empty transcript", () => {
    expect(collectUsageSamples([])).toEqual([]);
  });
});

describe("analyzeUsage", () => {
  test("finds the dominant model per task class and skill", () => {
    const analysis = analyzeUsage(buildFixture());

    expect(analysis.totalSamples).toBe(21);
    expect(analysis.confidence).toBe("medium");

    const plan = analysis.classes.find((entry) => entry.taskClass === "plan");
    expect(plan).toMatchObject({
      count: 6,
      dominantCount: 5,
      share: 29,
      tier: "flagship",
      dominant: {
        providerId: "claude-code",
        model: DEFAULT_CLAUDE_OPUS_MODEL,
        effort: "medium",
      },
    });

    const implement = analysis.classes.find(
      (entry) => entry.taskClass === "implement",
    );
    expect(implement).toMatchObject({
      count: 6,
      dominantCount: 4,
      tier: "frontier",
      dominant: { model: CLAUDE_FABLE_MODEL, effort: "high" },
    });

    const ciFix = analysis.classes.find((entry) => entry.taskClass === "ci-fix");
    expect(ciFix).toMatchObject({
      count: 4,
      dominantCount: 4,
      tier: "light",
      dominant: { model: DEFAULT_CLAUDE_HAIKU_MODEL },
    });
    expect(ciFix?.dominant.effort).toBeUndefined();

    expect(analysis.skills).toEqual([
      {
        skill: "ship",
        count: 3,
        dominantCount: 3,
        dominant: { providerId: "claude-code", model: DEFAULT_CLAUDE_HAIKU_MODEL },
      },
    ]);

    expect(analysis.providers[0]).toMatchObject({ providerId: "claude-code", count: 20 });
    expect(analysis.providers[1]).toMatchObject({ providerId: "codex", count: 1, share: 5 });
    expect(analysis.recommendedStance).toBe("balanced");
  });

  test("writes human insights from the aggregates", () => {
    const analysis = analyzeUsage(buildFixture());

    expect(analysis.insights).toContain("You ran 5 of 6 Plan prompts on Claude Opus 5.5");
    expect(analysis.insights).toContain(
      "/ship goes to Claude Haiku 4.5 every time (3 runs)",
    );
    expect(analysis.insights).toContain("Codex answered 5% of turns");
  });

  test("breaks frequency ties toward the most recent model", () => {
    const analysis = analyzeUsage([
      sample(PLAN_PROMPTS[0] ?? "", DEFAULT_CLAUDE_OPUS_MODEL, {
        at: "2026-09-01T00:00:00.000Z",
      }),
      sample(PLAN_PROMPTS[1] ?? "", CLAUDE_FABLE_MODEL, {
        at: "2026-09-03T00:00:00.000Z",
      }),
    ]);

    expect(analysis.classes[0]?.dominant.model).toBe(CLAUDE_FABLE_MODEL);
    expect(analysis.confidence).toBe("low");
  });

  test("handles empty input", () => {
    const analysis = analyzeUsage([]);

    expect(analysis).toEqual({
      totalSamples: 0,
      confidence: "low",
      classes: [],
      skills: [],
      providers: [],
      insights: [],
      recommendedStance: "balanced",
    });
  });
});

describe("recommendStance", () => {
  test("mostly frontier and flagship turns read as quality-first", () => {
    const samples = [
      ...PLAN_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_OPUS_MODEL)),
      ...IMPLEMENT_PROMPTS.map((prompt) => sample(prompt, CLAUDE_FABLE_MODEL)),
      ...CI_FIX_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_HAIKU_MODEL)),
    ];
    expect(recommendStance(samples)).toBe("quality-first");
  });

  test("mostly light turns read as cost-saver", () => {
    const samples = [
      ...CI_FIX_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_HAIKU_MODEL)),
      ...SHIP_PROMPTS.map((prompt) => sample(prompt, "gpt-5.6-luna", { providerId: "codex" })),
      ...DEBUG_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_SONNET_MODEL)),
    ];
    expect(recommendStance(samples)).toBe("cost-saver");
  });

  test("defaults to balanced without samples", () => {
    expect(recommendStance([])).toBe("balanced");
  });
});

describe("buildProfileFromUsage", () => {
  test("replaces class rules that have enough samples and leaves the rest", () => {
    const base = buildStarterProfile("starter-balanced");
    const analysis = analyzeUsage(buildFixture());

    const { profile, changes } = buildProfileFromUsage(analysis, { base });

    expect(profile.id).toBe("custom");
    expect(profile.name).toBe(USAGE_PROFILE_NAME);

    const plan = findRule(profile.rules, (rule) => rule.when.taskClass === "plan");
    expect(plan.id).toBe("usage-plan");
    expect(plan.then).toEqual({
      providerId: "claude-code",
      model: DEFAULT_CLAUDE_OPUS_MODEL,
      effort: "medium",
    });
    expect(plan.reason).toBe(
      "You usually run plan prompts on Claude Opus 5.5 (5 of 6 turns)",
    );

    const implement = findRule(
      profile.rules,
      (rule) => rule.when.taskClass === "implement",
    );
    expect(implement.then).toEqual({
      providerId: "claude-code",
      model: CLAUDE_FABLE_MODEL,
      effort: "high",
    });

    const ciFix = findRule(profile.rules, (rule) => rule.when.taskClass === "ci-fix");
    expect(ciFix.then).toEqual({
      providerId: "claude-code",
      model: DEFAULT_CLAUDE_HAIKU_MODEL,
    });

    // Insufficient samples retain generic complexity defaults.
    expect(profile.rules.some((rule) => rule.when.taskClass === "debug")).toBe(false);
    expect(profile.rules.find((rule) => rule.id === "complex")).toEqual(
      base.rules.find((rule) => rule.id === "complex"),
    );

    const ship = findRule(profile.rules, (rule) => rule.when.skill?.[0] === "ship");
    expect(ship.id).toBe("usage-skill-ship");
    expect(ship.then).toEqual({
      providerId: "claude-code",
      model: DEFAULT_CLAUDE_HAIKU_MODEL,
    });

    const ruleChanges = changes.filter((change) => change.kind === "rule");
    expect(ruleChanges.map(wizardChangeKey).sort()).toEqual([
      "class:ci-fix",
      "class:implement",
      "class:plan",
      "class:quick-edit",
      "skill:ship",
    ]);
    const planChange = ruleChanges.find((change) => change.taskClass === "plan");
    expect(planChange).toEqual({
      kind: "rule",
      taskClass: "plan",
      after: "Claude Opus 5.5 (Claude) · Medium",
      evidence: "You usually run plan prompts on Claude Opus 5.5 (5 of 6 turns)",
    });
    // The balanced fixture keeps the balanced base stance.
    expect(changes.some((change) => change.kind === "stance")).toBe(false);
    expect(profile.stance).toBe("balanced");
  });

  test("keeps safety ahead of inferred rules and complexity defaults last", () => {
    const base = buildStarterProfile("starter-balanced");
    const { profile } = buildProfileFromUsage(analyzeUsage(buildFixture()), {
      base,
    });

    const ids = profile.rules.map((rule) => rule.id);
    const indexOf = (id: string) => ids.indexOf(id);
    expect(indexOf("advisor-default")).toBe(0);
    expect(indexOf("delegate-default")).toBeLessThan(indexOf("safety-critical"));
    expect(indexOf("safety-critical")).toBeLessThan(indexOf("usage-skill-ship"));
    expect(indexOf("usage-skill-ship")).toBeLessThan(indexOf("usage-plan"));
    expect(indexOf("usage-plan")).toBeLessThan(indexOf("complex"));
    expect(profile.rules).toHaveLength(base.rules.length + 5);
  });

  test("inserts a new skill rule when the base has none", () => {
    const base = buildStarterProfile("starter-balanced");
    const analysis = analyzeUsage(
      ["/review", "/review the PR", "/review again"].map((prompt) =>
        sample(prompt, "gpt-5.5", { providerId: "codex", skill: "review" }),
      ),
    );

    const { profile, changes } = buildProfileFromUsage(analysis, { base });

    const review = findRule(profile.rules, (rule) => rule.id === "usage-skill-review");
    expect(review.when).toEqual({ skill: ["review"] });
    expect(review.then).toEqual({ providerId: "codex", model: "gpt-5.5" });
    const change = changes.find((entry) => entry.skill === "review");
    expect(change?.before).toBeUndefined();
    expect(change?.after).toBe("GPT-5.5 (Codex)");
  });

  test("recommends a stance change with evidence", () => {
    const base = buildStarterProfile("starter-balanced");
    const analysis = analyzeUsage(
      PLAN_PROMPTS.map((prompt) => sample(prompt, DEFAULT_CLAUDE_OPUS_MODEL)),
    );

    const { profile, changes } = buildProfileFromUsage(analysis, { base });

    expect(profile.stance).toBe("quality-first");
    expect(changes.find((change) => change.kind === "stance")).toEqual({
      kind: "stance",
      before: "Balanced",
      after: "Quality-first",
      evidence: "100% of your turns ran on frontier or flagship models",
    });
  });

  test("honours include filters and the minimum sample override", () => {
    const base = buildStarterProfile("starter-balanced");
    const analysis = analyzeUsage(buildFixture());

    const { profile, changes } = buildProfileFromUsage(analysis, {
      base,
      minSamplesPerClass: 2,
      include: { taskClasses: ["debug"], skills: [], stance: false },
    });

    expect(changes.map(wizardChangeKey)).toEqual(["class:debug"]);
    const debug = findRule(profile.rules, (rule) => rule.when.taskClass === "debug");
    expect(debug.then.model).toBe(DEFAULT_CLAUDE_SONNET_MODEL);
    expect(profile.rules.some((rule) => rule.when.taskClass === "plan")).toBe(false);
    expect(profile.rules.find((rule) => rule.id === "standard")).toEqual(
      base.rules.find((rule) => rule.id === "standard"),
    );
  });

  test("empty analysis produces no changes and an untouched rule table", () => {
    const base = buildStarterProfile("starter-cost-saver");
    const { profile, changes } = buildProfileFromUsage(analyzeUsage([]), { base });

    expect(changes).toEqual([]);
    expect(profile.rules).toEqual(base.rules);
    expect(profile.stance).toBe("cost-saver");
  });
});

describe("describeRuleThen", () => {
  test("describes tiers, models, providers and effort", () => {
    expect(describeRuleThen({ providerId: "any-eligible", tier: "light" })).toBe(
      "Light tier",
    );
    expect(
      describeRuleThen({
        providerId: "alternate-provider",
        tier: "frontier",
        effort: "medium",
      }),
    ).toBe("Frontier tier (other provider) · Medium");
    expect(describeRuleThen({ providerId: "any-eligible" })).toBe("Provider default");
  });
});

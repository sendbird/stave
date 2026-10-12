import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  buildStarterRules,
  cloneProfileAsCustom,
  FOLLOW_LEVEL_TIER,
  getProfileRouteLevel,
  previewRouteLevels,
  resolveRoute,
  validateProfile,
  withRouteLevel,
  withStance,
  type AutoRoutingProfile,
  type RouterSignals,
  type StarterProfileId,
} from "@/lib/providers/auto-routing-profile";
import {
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_HAIKU_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
} from "@/lib/providers/model-catalog";

function signals(overrides: Partial<RouterSignals> = {}): RouterSignals {
  return {
    taskClass: "implement",
    complexity: "medium",
    sensitive: false,
    fileContextCount: 0,
    currentProviderId: "claude-code",
    ...overrides,
  };
}

function route(profile: AutoRoutingProfile, overrides: Partial<RouterSignals> = {}) {
  return resolveRoute({ profile, role: "primary", signals: signals(overrides) });
}

describe("frontier effort defaults", () => {
  test("Quality-first stops the frontier levels at high effort on both providers", () => {
    const quality = buildStarterProfile("starter-quality-first");
    for (const currentProviderId of ["claude-code", "codex"] as const) {
      const extreme = route(quality, { complexity: "extreme", currentProviderId });
      expect(extreme.tier).toBe("frontier");
      expect(extreme.effort).toBe("high");
      const expert = route(quality, { complexity: "expert", currentProviderId });
      expect(expert.tier).toBe("frontier");
      expect(expert.effort).toBe("medium");
    }
    expect(route(quality, { complexity: "extreme" }).model).toBe(CLAUDE_FABLE_MODEL);
    expect(route(quality, { complexity: "extreme", currentProviderId: "codex" }).model).toBe("gpt-6-astra");
  });

  test("each preference runs its own end of the Extreme range", () => {
    const efforts = (["starter-cost-saver", "starter-balanced", "starter-quality-first"] as StarterProfileId[])
      .map((id) => route(buildStarterProfile(id), { complexity: "extreme" }).effort);
    expect(efforts).toEqual(["medium", "high", "high"]);
  });

  test("no starter route reaches xhigh on a frontier model", () => {
    for (const id of ["starter-cost-saver", "starter-balanced", "starter-quality-first"] as StarterProfileId[]) {
      for (const providerId of ["claude-code", "codex"] as const) {
        for (const entry of previewRouteLevels({ profile: buildStarterProfile(id), providerId })) {
          if (entry.route?.tier === "frontier") {
            expect(["low", "medium", "high"]).toContain(entry.route.effort);
          }
        }
      }
    }
  });
});

describe("custom levels", () => {
  const balanced = buildStarterProfile("starter-balanced");

  test("starter level rules follow the level instead of naming a rung or effort", () => {
    const levelRules = buildStarterRules().filter((rule) => rule.when.complexity);
    expect(levelRules).toHaveLength(5);
    for (const rule of levelRules) {
      expect(rule.then).toEqual({ providerId: "any-eligible", tier: FOLLOW_LEVEL_TIER });
    }
  });

  test("a level setting changes the rung and the effort each preference runs", () => {
    const custom = withRouteLevel(cloneProfileAsCustom(balanced), "extreme", {
      tier: "flagship",
      effort: "high",
      effortRange: ["medium", "xhigh"],
    });
    expect(route(custom, { complexity: "extreme" })).toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "high" });
    expect(route(withStance(custom, "quality-first"), { complexity: "extreme" }))
      .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "xhigh" });
    expect(route(withStance(custom, "cost-saver"), { complexity: "extreme" }))
      .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "medium" });
    // Other levels keep the built-in ladder.
    expect(route(custom, { complexity: "low" })).toMatchObject({ model: DEFAULT_CLAUDE_HAIKU_MODEL, effort: "medium" });
  });

  test("lowering a level's rung lowers its floor, so the route can still resolve", () => {
    const custom = withRouteLevel(cloneProfileAsCustom(balanced), "extreme", {
      tier: "light",
      effort: "medium",
      effortRange: ["low", "medium"],
    });
    expect(getProfileRouteLevel(custom, "extreme").floor).toBe("light");
    expect(route(custom, { complexity: "extreme" })).toMatchObject({ model: DEFAULT_CLAUDE_HAIKU_MODEL, effort: "medium" });
  });

  test("raising a level's rung keeps the built-in floor for the budget guard", () => {
    const custom = withRouteLevel(cloneProfileAsCustom(balanced), "low", {
      tier: "frontier",
      effort: "low",
      effortRange: ["low", "low"],
    });
    expect(getProfileRouteLevel(custom, "low")).toMatchObject({ tier: "frontier", floor: "light" });
    expect(route(custom, { complexity: "low" })).toMatchObject({ model: CLAUDE_FABLE_MODEL, effort: "low" });
    expect(route(custom, { complexity: "low", budgetUsedPercent: 99 })).toMatchObject({ model: DEFAULT_CLAUDE_HAIKU_MODEL, budgetShift: -2 });
  });

  test("a rule that names its own effort still wins over the level", () => {
    const custom = withRouteLevel(cloneProfileAsCustom(balanced), "high", {
      tier: "flagship",
      effort: "low",
      effortRange: ["low", "low"],
    });
    expect(route(custom, { complexity: "high", taskClass: "safety-critical" }))
      .toMatchObject({ ruleId: "safety-critical", effort: "high" });
  });

  test("a setting equal to the built-in level is not stored, and reset removes it", () => {
    const base = cloneProfileAsCustom(balanced);
    expect(withRouteLevel(base, "medium", { tier: "flagship", effort: "medium", effortRange: ["medium", "high"] }).levels).toEqual({});
    const edited = withRouteLevel(base, "medium", { tier: "balanced", effort: "medium", effortRange: ["medium", "high"] });
    expect(edited.levels.medium).toEqual({ tier: "balanced", effort: "medium", effortRange: ["medium", "high"] });
    expect(withRouteLevel(edited, "medium", null).levels).toEqual({});
  });

  test("validation orders the range, keeps the effort inside it, and drops junk", () => {
    const stored = {
      ...cloneProfileAsCustom(balanced),
      levels: {
        high: { tier: "frontier", effort: "max", effortRange: ["xhigh", "low"] },
        expert: { tier: "nonsense", effort: "ultra", effortRange: "x" },
        unknown: { tier: "light" },
        low: "light",
      },
    };
    const validated = validateProfile(stored);
    expect(validated.levels.high).toEqual({ tier: "frontier", effort: "xhigh", effortRange: ["low", "xhigh"] });
    // An unreadable expert setting falls back to the built-in level, so nothing is stored.
    expect(validated.levels.expert).toBeUndefined();
    expect(Object.keys(validated.levels)).toEqual(["high"]);
    expect(validateProfile(validated)).toEqual(validated);
  });

  test("the profile preview shows the customized level", () => {
    const custom = withRouteLevel(cloneProfileAsCustom(balanced), "expert", {
      tier: "flagship",
      effort: "high",
      effortRange: ["medium", "high"],
    });
    const expert = previewRouteLevels({ profile: custom, providerId: "codex" })
      .find((entry) => entry.level.complexity === "expert");
    expect(expert?.route).toMatchObject({ model: "gpt-6.1-sol", effort: "high" });
  });
});

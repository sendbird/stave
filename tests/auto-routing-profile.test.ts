import { describe, expect, test } from "bun:test";
import {
  applyStance,
  buildRoleSignals,
  buildRoleTableGroups,
  buildStarterRules,
  buildStarterProfile,
  cloneProfileAsCustom,
  formatResolvedRouteLabel,
  migrateLegacyAutoSettings,
  resolveDelegateDefaults,
  listEligibleRouteModels,
  resolveRoute,
  SELECTABLE_ROUTER_ROLES,
  STARTER_PROFILES,
  validateProfile,
  withStance,
  type AutoRoutingProfile,
  type RouteRule,
  type RouterSignals,
} from "@/lib/providers/auto-routing-profile";
import {
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  formatModelPrice,
  MODEL_PRICING,
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

const balanced = buildStarterProfile("starter-balanced");

/** The advisor rule older builds seeded; existing profiles may still carry it. */
const storedAdvisorRule: RouteRule = {
  id: "advisor-default",
  when: { role: "advisor" },
  then: { providerId: "alternate-provider", tier: "frontier", effort: "medium" },
  reason: "A second opinion uses a capable model from another available provider.",
  enabled: true,
};

describe("starter profiles", () => {
  test("three starters share one role table and differ only by stance", () => {
    expect(STARTER_PROFILES.map((profile) => profile.stance)).toEqual([
      "balanced",
      "cost-saver",
      "quality-first",
    ]);
    const [first, ...rest] = STARTER_PROFILES;
    for (const profile of rest) {
      expect(profile.rules).toEqual(first!.rules);
    }
    expect(applyStance(buildStarterProfile("starter-cost-saver")).shift).toBe(-1);
    expect(applyStance(buildStarterProfile("starter-quality-first")).shift).toBe(1);
  });

  test("withStance adopts the stance's budget thresholds", () => {
    const shifted = withStance(balanced, "cost-saver");
    expect(shifted.stance).toBe("cost-saver");
    expect(shifted.budgetGuard).toEqual({ stepDownAt: 60, cheapestAt: 90 });
  });

  test("cloning a starter yields an independent custom profile", () => {
    const custom = cloneProfileAsCustom(balanced);
    custom.rules[0]!.enabled = false;
    expect(custom.id).toBe("custom");
    expect(balanced.rules[0]!.enabled).toBe(true);
  });
});

describe("resolveRoute", () => {
  test("ordinary task categories share the standard route: the flagship at medium effort", () => {
    for (const taskClass of ["plan", "research", "implement", "debug", "review", "docs", "quick-edit", "ci-fix"] as const) {
      expect(resolveRoute({ profile: balanced, role: "primary", signals: signals({ taskClass }) }))
        .toMatchObject({ providerId: "claude-code", model: DEFAULT_CLAUDE_OPUS_MODEL,
          effort: "medium", ruleId: "standard", complexity: "medium" });
      expect(resolveRoute({ profile: balanced, role: "primary", signals: signals({ taskClass, currentProviderId: "codex" }) }))
        .toMatchObject({ providerId: "codex", model: "gpt-6.1-sol", effort: "medium", ruleId: "standard" });
    }
  });

  test("each level maps to one rung and effort on both providers", () => {
    const expected = {
      low: { claude: [DEFAULT_CLAUDE_SONNET_MODEL, "medium"], codex: ["gpt-6-luna", "medium"], rule: "bounded" },
      medium: { claude: [DEFAULT_CLAUDE_OPUS_MODEL, "medium"], codex: ["gpt-6.1-sol", "medium"], rule: "standard" },
      high: { claude: [DEFAULT_CLAUDE_OPUS_MODEL, "high"], codex: ["gpt-6.1-sol", "high"], rule: "complex" },
      expert: { claude: [CLAUDE_FABLE_MODEL, "medium"], codex: ["gpt-6-astra", "medium"], rule: "expert" },
      extreme: { claude: [CLAUDE_FABLE_MODEL, "high"], codex: ["gpt-6-astra", "high"], rule: "extreme" },
    } as const;
    for (const [complexity, route] of Object.entries(expected) as Array<[keyof typeof expected, (typeof expected)[keyof typeof expected]]>) {
      for (const taskClass of ["implement", "plan", "docs"] as const) {
        expect(resolveRoute({ profile: balanced, role: "primary", signals: signals({ taskClass, complexity }) }))
          .toMatchObject({ model: route.claude[0], effort: route.claude[1], ruleId: route.rule });
        expect(resolveRoute({ profile: balanced, role: "primary",
          signals: signals({ taskClass, complexity, currentProviderId: "codex" }) }))
          .toMatchObject({ model: route.codex[0], effort: route.codex[1], ruleId: route.rule });
      }
    }
  });

  test("Auto never picks Haiku unless it is allowed explicitly", () => {
    expect(listEligibleRouteModels({ profile: balanced, providerId: "claude-code" })).not.toContain("claude-haiku-4-5");
    const allowed = { ...balanced, eligibleModelsByProvider: { "claude-code": ["claude-haiku-4-5", DEFAULT_CLAUDE_SONNET_MODEL] } };
    expect(resolveRoute({ profile: allowed, role: "primary", signals: signals({ complexity: "low" }) }).model)
      .toBe("claude-haiku-4-5");
  });

  test("a skill name does not bypass the capability floor", () => {
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ skill: "ship", currentProviderId: "codex" }) }))
      .toMatchObject({ model: "gpt-6.1-sol", ruleId: "standard" });
  });

  test("a sensitive change routes as complex work, and a sensitive expert task keeps the frontier", () => {
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ taskClass: "safety-critical", sensitive: true, complexity: "low" }) }))
      .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "high", ruleId: "safety-critical", complexity: "high" });
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ taskClass: "safety-critical", sensitive: true, complexity: "expert" }) }))
      .toMatchObject({ model: CLAUDE_FABLE_MODEL, ruleId: "expert" });
  });

  test("unclear scope routes as standard work, not light and not the frontier", () => {
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ complexity: "low", uncertain: true }) }))
      .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "medium", complexity: "medium" });
  });

  test("preference and usage cannot lower sensitive or complex work below its floor", () => {
    for (const stance of ["starter-balanced", "starter-cost-saver", "starter-quality-first"] as const) {
      const profile = buildStarterProfile(stance);
      expect(resolveRoute({ profile, role: "primary",
        signals: signals({ taskClass: "safety-critical", sensitive: true, budgetUsedPercent: 99 }) }))
        .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, ruleId: "safety-critical" });
      expect(resolveRoute({ profile, role: "primary",
        signals: signals({ complexity: "high", budgetUsedPercent: 99 }) }))
        .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL });
      expect(resolveRoute({ profile, role: "primary",
        signals: signals({ complexity: "extreme", budgetUsedPercent: 99 }) }))
        .toMatchObject({ model: CLAUDE_FABLE_MODEL });
    }
  });

  test("standard work may step down to the balanced rung under budget pressure", () => {
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ budgetUsedPercent: 99, currentProviderId: "codex" }) }))
      .toMatchObject({ model: "gpt-5.6-terra", budgetShift: -2 });
  });

  test("preference keeps the model and moves effort within the level's range", () => {
    const route = (stance: "starter-cost-saver" | "starter-balanced" | "starter-quality-first", complexity: RouterSignals["complexity"]) =>
      resolveRoute({ profile: buildStarterProfile(stance), role: "primary", signals: signals({ complexity }) });
    expect(route("starter-cost-saver", "medium")).toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "medium", stanceShift: -1 });
    expect(route("starter-quality-first", "medium")).toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "high", stanceShift: 1 });
    expect(route("starter-cost-saver", "low")).toMatchObject({ model: DEFAULT_CLAUDE_SONNET_MODEL, effort: "low" });
    expect(route("starter-quality-first", "high")).toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "xhigh" });
    expect(route("starter-cost-saver", "expert")).toMatchObject({ model: CLAUDE_FABLE_MODEL, effort: "low" });
    expect(route("starter-quality-first", "expert")).toMatchObject({ model: CLAUDE_FABLE_MODEL, effort: "medium" });
  });

  test("an allow list with no capable model fails visibly", () => {
    const profile = {
      ...balanced,
      eligibleModelsByProvider: { "claude-code": ["claude-haiku-4-5"], codex: ["gpt-6-luna"] },
    };
    expect(() => resolveRoute({ profile, role: "primary", signals: signals({ complexity: "high" }) }))
      .toThrow("Complex work needs a Flagship model or stronger");
  });

  test("a provider with no capable model hands the turn to one that has it, even with switching off", () => {
    // Cursor and Kiro run on their own "auto" model, which Auto treats as the
    // light rung; a Claude allow list of Haiku cannot run complex work.
    for (const currentProviderId of ["cursor", "kiro"] as const) {
      const route = resolveRoute({ profile: balanced, role: "primary", signals: signals({ currentProviderId }) });
      expect(route).toMatchObject({ providerId: "claude-code", model: DEFAULT_CLAUDE_OPUS_MODEL });
      expect(route.reason).toContain("has no allowed model for standard work");
    }
    const narrow = { ...balanced, eligibleModelsByProvider: { "claude-code": ["claude-haiku-4-5"] } };
    expect(resolveRoute({ profile: narrow, role: "primary", signals: signals({ complexity: "high" }) }))
      .toMatchObject({ providerId: "codex", model: "gpt-6.1-sol" });
  });

  test("an unavailable provider fails over even though provider switching is off", () => {
    // Provider switching governs discretionary routing. A provider that cannot
    // run the turn at all — uninstalled, or its account usage exhausted — is a
    // hard constraint, so the route moves instead of resolving to nothing.
    expect(balanced.signals.providerSwitch).toBe(false);
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ providerAvailability: { "claude-code": false } }) }).providerId)
      .toBe("codex");
    // With every provider gone there is nothing to fail over to, so the
    // configuration error still surfaces rather than picking a blocked route.
    expect(() => resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ providerAvailability: { "claude-code": false, codex: false } }) }))
      .toThrow("No available allowed model");
  });

  test("usage first reduces cache-preserving effort and then respects the capability floor", () => {
    const stepped = resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ complexity: "high", budgetUsedPercent: 85 }) });
    expect(stepped).toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL,
      effort: "medium", budgetShift: -1, budgetHeldModel: true });
    expect(stepped.reason).toContain("keeps its cache");
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ budgetUsedPercent: 99 }) }))
      .toMatchObject({ model: DEFAULT_CLAUDE_SONNET_MODEL, budgetShift: -2 });
    expect(resolveRoute({ profile: { ...balanced, signals: { ...balanced.signals, budgetGuard: false } },
      role: "primary", signals: signals({ budgetUsedPercent: 99 }) }).budgetShift).toBe(0);
  });

  test("custom skill rules fire only when skill routing is on", () => {
    const profile = { ...balanced, rules: [
      { id: "custom-ship", when: { skill: ["ship"] }, then: { providerId: "any-eligible" as const, tier: "flagship" as const },
        enabled: true, reason: "Custom shipping route." }, ...balanced.rules,
    ] };
    expect(resolveRoute({ profile, role: "primary", signals: signals({ skill: "ship" }) }).ruleId).toBe("custom-ship");
    expect(resolveRoute({ profile: { ...profile, signals: { ...profile.signals, skillRouting: false } },
      role: "primary", signals: signals({ skill: "ship" }) }).ruleId).toBe("standard");
  });

  test("role filters: primary rules never leak into delegated roles", () => {
    const worker = resolveRoute({
      profile: balanced,
      role: "worker",
      signals: signals({ taskClass: "implement" }),
    });
    expect(worker.ruleId).toBeNull();
    expect(worker.reason).toContain("fallback");

    const advisor = resolveRoute({
      profile: { ...balanced, rules: [storedAdvisorRule, ...balanced.rules] },
      role: "advisor",
      signals: signals({ currentProviderId: "claude-code", currentModel: CLAUDE_FABLE_MODEL }),
    });
    expect(advisor).toMatchObject({
      providerId: "codex",
      model: "gpt-6-astra",
      effort: "medium",
      ruleId: "advisor-default",
    });

    const delegate = resolveRoute({
      profile: balanced,
      role: "delegate",
      signals: signals({ currentProviderId: "codex" }),
    });
    expect(delegate).toMatchObject({
      providerId: "codex",
      model: "gpt-6.1-sol",
      effort: "medium",
      ruleId: "delegate-default",
    });
  });

  test("an advisor never answers with the primary's own model", () => {
    const profile: AutoRoutingProfile = {
      ...balanced,
      rules: [{ ...storedAdvisorRule, then: { ...storedAdvisorRule.then, providerId: "any-eligible" } }, ...balanced.rules],
    };
    const route = resolveRoute({
      profile,
      role: "advisor",
      signals: signals({ currentProviderId: "claude-code", currentModel: CLAUDE_FABLE_MODEL }),
    });
    expect(route.providerId).toBe("claude-code");
    expect(route.model).not.toBe(CLAUDE_FABLE_MODEL);
  });

  test("disabled rules are skipped", () => {
    const profile: AutoRoutingProfile = {
      ...balanced,
      rules: balanced.rules.map((entry) =>
        entry.id === "standard" ? { ...entry, enabled: false } : entry,
      ),
    };
    const route = resolveRoute({
      profile,
      role: "primary",
      signals: signals({ taskClass: "plan" }),
    });
    expect(route.ruleId).toBeNull();
  });

  test("formatResolvedRouteLabel drops the vendor prefix", () => {
    expect(formatResolvedRouteLabel({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "high" })).toBe(
      "Opus 5.5 · High",
    );
    expect(formatResolvedRouteLabel({ model: "gpt-6-luna" })).toBe("GPT-6 Luna");
  });
});

describe("role helpers", () => {
  test("resolveDelegateDefaults follows the delegate rule", () => {
    expect(resolveDelegateDefaults(balanced, { provider: "claude-code" })).toMatchObject({
      providerId: "claude-code",
      model: DEFAULT_CLAUDE_OPUS_MODEL,
      effort: "medium",
    });
  });

});

describe("role table", () => {
  test("new rules, starters and Reset offer only the roles that still route", () => {
    expect([...SELECTABLE_ROUTER_ROLES]).toEqual(["primary", "delegate"]);
    const roles = buildStarterRules().map((entry) => entry.when.role ?? "primary");
    expect(roles.filter((role) => role === "advisor" || role === "worker")).toEqual([]);
  });

  test("a stored advisor rule stays readable as a legacy group after the selectable roles", () => {
    const kept = validateProfile({ ...balanced, rules: [storedAdvisorRule, ...balanced.rules] });
    expect(kept.rules[0]).toMatchObject({ id: "advisor-default", when: { role: "advisor" } });
    const groups = buildRoleTableGroups(kept.rules);
    expect(groups.map((group) => [group.role, group.legacy])).toEqual([
      ["primary", false],
      ["delegate", false],
      ["advisor", true],
    ]);
    expect(groups[2]!.rules).toEqual([{ rule: kept.rules[0]!, index: 0 }]);
  });

  test("a legacy role without stored rules is not shown", () => {
    expect(buildRoleTableGroups(balanced.rules).map((group) => group.role)).toEqual(["primary", "delegate"]);
  });
});

describe("validation and migration", () => {
  test("migrateLegacyAutoSettings maps the objective and flags onto a profile", () => {
    const profile = migrateLegacyAutoSettings({
      autoRoutingObjective: 0.1,
      autoRoutingUseClassifier: true,
      autoRoutingSafetyEscalation: false,
      autoRoutingAllowProviderSwitch: true,
      autoRoutingEligibleClaudeModels: [DEFAULT_CLAUDE_SONNET_MODEL, " ", DEFAULT_CLAUDE_SONNET_MODEL],
      autoRoutingEligibleCodexModels: [],
    });
    expect(profile).toMatchObject({
      version: 5,
      id: "starter-cost-saver",
      stance: "cost-saver",
      budgetGuard: { stepDownAt: 60, cheapestAt: 90 },
      signals: {
        classifier: true,
        safetyEscalation: false,
        providerSwitch: true,
        skillRouting: true,
        budgetGuard: true,
      },
    });
    expect(profile.eligibleModelsByProvider).toEqual({
      "claude-code": [DEFAULT_CLAUDE_SONNET_MODEL],
    });
  });

  test("validateProfile repairs malformed input and drops unknown rules", () => {
    expect(validateProfile(null)).toEqual(balanced);
    const repaired = validateProfile({
      id: "custom",
      stance: "bogus",
      rules: [
        { id: "a", when: { taskClass: "nope" }, then: { providerId: "mars" } },
        { id: "a", when: { skill: ["/Ship"] }, then: { providerId: "codex", tier: "light" }, reason: "x" },
        { id: "a", when: {}, then: { providerId: "any-eligible", effort: "high" } },
      ],
      budgetGuard: { stepDownAt: 95, cheapestAt: 50 },
      signals: { classifier: "yes" },
    });
    expect(repaired.stance).toBe("balanced");
    expect(repaired.name).toBe("Custom");
    expect(repaired.rules.map((entry) => entry.id)).toEqual(["a", "a-2"]);
    expect(repaired.rules[0]!.when.skill).toEqual(["ship"]);
    expect(repaired.budgetGuard).toEqual({ stepDownAt: 95, cheapestAt: 95 });
    expect(repaired.signals.classifier).toBe(true);
  });
});

describe("pricing", () => {
  test("picker models carry list prices; runtime-catalog providers do not", () => {
    expect(formatModelPrice(DEFAULT_CLAUDE_OPUS_MODEL)).toBe("$4 / $20");
    expect(formatModelPrice("gpt-6-luna")).toBe("$0.1 / $0.5");
    expect(formatModelPrice("auto")).toBeNull();
    for (const price of Object.values(MODEL_PRICING)) {
      expect(price?.source.startsWith("https://")).toBe(true);
    }
  });

  test("keeps the previous turn's model when the route only steps down", () => {
    // Opus answered the last turn; a bounded turn would route to the light
    // model. The conversation's cache is scoped to Opus, so the cheaper pick
    // would re-read every prior token uncached — the model is held instead.
    const held = resolveRoute({
      profile: balanced,
      role: "primary",
      signals: signals({
        taskClass: "docs", complexity: "low",
        lastAssistantProvider: "claude-code",
        lastAssistantModel: DEFAULT_CLAUDE_OPUS_MODEL,
      }),
    });
    expect(held).toMatchObject({
      model: DEFAULT_CLAUDE_OPUS_MODEL,
      cacheHeldModel: true,
    });
    expect(held.reason).toContain("prompt cache stays warm");

    // Stepping up is a quality decision and goes through.
    const escalated = resolveRoute({
      profile: balanced,
      role: "primary",
      signals: signals({
        taskClass: "plan", complexity: "high",
        lastAssistantProvider: "claude-code",
        lastAssistantModel: DEFAULT_CLAUDE_SONNET_MODEL,
      }),
    });
    expect(escalated.cacheHeldModel).toBe(false);
    expect(escalated.model).not.toBe(DEFAULT_CLAUDE_SONNET_MODEL);

    // The hard budget ceiling still forces the cheapest model.
    const ceiling = resolveRoute({
      profile: balanced,
      role: "primary",
      signals: signals({
        taskClass: "implement",
        budgetUsedPercent: 98,
        lastAssistantProvider: "claude-code",
        lastAssistantModel: DEFAULT_CLAUDE_OPUS_MODEL,
      }),
    });
    expect(ceiling.cacheHeldModel).toBe(false);
    expect(ceiling.model).not.toBe(DEFAULT_CLAUDE_OPUS_MODEL);

    // A model the route's provider cannot run is never held.
    const foreignModel = resolveRoute({
      profile: balanced,
      role: "primary",
      signals: signals({
        taskClass: "docs",
        lastAssistantProvider: "claude-code",
        lastAssistantModel: "gpt-6-sol",
      }),
    });
    expect(foreignModel.cacheHeldModel).toBe(false);
    expect(foreignModel.providerId).toBe("claude-code");
  });

  test("buildRoleSignals fills the defaults delegated roles need", () => {
    expect(buildRoleSignals({ currentProviderId: "codex" })).toMatchObject({
      taskClass: "implement",
      complexity: "medium",
      currentProviderId: "codex",
    });
  });
});


test("model-first migration preserves custom routing and respects subsequent opt-out", () => {
  const custom = cloneProfileAsCustom(buildStarterProfile("starter-balanced"));
  custom.rules[0]!.reason = "Preserve custom routing";
  const migrated = validateProfile({ ...custom, version: 3, signals: { ...custom.signals, classifier: false } });
  expect(migrated.signals.classifier).toBe(true);
  expect(migrated.rules).toEqual(custom.rules);
  expect(migrated.eligibleModelsByProvider).toEqual(custom.eligibleModelsByProvider);
  expect(validateProfile({ ...migrated, signals: { ...migrated.signals, classifier: false } }).signals.classifier).toBe(false);
  expect(migrateLegacyAutoSettings({ autoRoutingUseClassifier: false }).signals.classifier).toBe(true);
});

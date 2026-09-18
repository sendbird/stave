import { describe, expect, test } from "bun:test";
import {
  applyStance,
  buildRoleSignals,
  buildStarterProfile,
  cloneProfileAsCustom,
  formatResolvedRouteLabel,
  migrateLegacyAutoSettings,
  resolveDelegateDefaults,
  resolveRoute,
  STARTER_PROFILES,
  validateProfile,
  withStance,
  type AutoRoutingProfile,
  type RouterSignals,
} from "@/lib/providers/auto-routing-profile";
import {
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  formatModelPrice,
  MODEL_PRICING,
} from "@/lib/providers/model-catalog";
import { resolveAdvisorAutoTarget } from "@/lib/providers/advisor";
import {
  resolveRoutedWorkerModel,
  resolveWorkerProfile,
} from "@/lib/providers/worker-mode";

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
  test("ordinary task categories share the balanced route", () => {
    for (const taskClass of ["plan", "research", "implement", "debug", "review", "docs", "quick-edit", "ci-fix"] as const) {
      expect(resolveRoute({ profile: balanced, role: "primary", signals: signals({ taskClass }) }))
        .toMatchObject({ providerId: "claude-code", model: DEFAULT_CLAUDE_SONNET_MODEL,
          effort: "medium", ruleId: "standard" });
    }
  });

  test("complexity determines capability for both coding and non-coding work", () => {
    for (const taskClass of ["implement", "debug", "plan", "docs"] as const) {
      expect(resolveRoute({ profile: balanced, role: "primary",
        signals: signals({ taskClass, complexity: "high" }) }))
        .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "high", ruleId: "complex" });
      expect(resolveRoute({ profile: balanced, role: "primary",
        signals: signals({ taskClass, complexity: "low", currentProviderId: "codex" }) }))
        .toMatchObject({ model: "gpt-5.6-luna", effort: "medium", ruleId: "bounded" });
    }
  });

  test("a skill name does not bypass the capability floor", () => {
    expect(resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ skill: "ship", currentProviderId: "codex" }) }))
      .toMatchObject({ model: "gpt-5.6-terra", ruleId: "standard" });
  });

  test("preference and usage cannot lower sensitive or complex work below its floor", () => {
    for (const stance of ["starter-balanced", "starter-cost-saver", "starter-quality-first"] as const) {
      const profile = buildStarterProfile(stance);
      expect(resolveRoute({ profile, role: "primary",
        signals: signals({ taskClass: "safety-critical", sensitive: true, budgetUsedPercent: 99 }) }))
        .toMatchObject({ model: CLAUDE_FABLE_MODEL, ruleId: "safety-critical" });
      expect(resolveRoute({ profile, role: "primary",
        signals: signals({ complexity: "high", budgetUsedPercent: 99 }) }))
        .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL });
    }
  });

  test("preference shifts quality and effort within eligible capability", () => {
    expect(resolveRoute({ profile: buildStarterProfile("starter-cost-saver"),
      role: "primary", signals: signals() }))
      .toMatchObject({ model: DEFAULT_CLAUDE_SONNET_MODEL, effort: "low", stanceShift: -1 });
    expect(resolveRoute({ profile: buildStarterProfile("starter-quality-first"),
      role: "primary", signals: signals() }))
      .toMatchObject({ model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "medium", stanceShift: 1 });
  });

  test("incompatible allowlists fail visibly without silently changing providers", () => {
    const profile = { ...balanced, eligibleModelsByProvider: { "claude-code": ["claude-haiku-4-5"] } };
    expect(() => resolveRoute({ profile, role: "primary", signals: signals({ complexity: "high" }) }))
      .toThrow("No available allowed model");
    expect(resolveRoute({ profile: { ...profile, signals: { ...profile.signals, providerSwitch: true } },
      role: "primary", signals: signals({ complexity: "high" }) }).providerId).toBe("codex");
    expect(() => resolveRoute({ profile: balanced, role: "primary",
      signals: signals({ providerAvailability: { "claude-code": false } }) })).toThrow();
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
      profile: balanced,
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
      model: "gpt-5.6-sol",
      effort: "medium",
      ruleId: "delegate-default",
    });
  });

  test("an advisor never answers with the primary's own model", () => {
    const profile: AutoRoutingProfile = {
      ...balanced,
      rules: balanced.rules.map((entry) =>
        entry.id === "advisor-default"
          ? { ...entry, then: { ...entry.then, providerId: "any-eligible" } }
          : entry,
      ),
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
      "Opus 5 · High",
    );
    expect(formatResolvedRouteLabel({ model: "gpt-5.6-luna" })).toBe("GPT-5.6 Luna");
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

  test("resolveAdvisorAutoTarget resolves `auto` and passes concrete targets through", () => {
    expect(
      resolveAdvisorAutoTarget({
        target: { providerId: "claude-code", model: "auto" },
        profile: balanced,
        primaryProviderId: "claude-code",
        primaryModel: DEFAULT_CLAUDE_OPUS_MODEL,
      }),
    ).toEqual({ providerId: "codex", model: "gpt-6-astra", effort: "medium" });
    const pinned = { providerId: "codex" as const, model: "gpt-5.6-sol" };
    expect(
      resolveAdvisorAutoTarget({ target: pinned, profile: balanced, primaryProviderId: "claude-code" }),
    ).toBe(pinned);
  });

  test("worker resolution keeps the preset model unless a worker rule matches", () => {
    expect(
      resolveRoutedWorkerModel({
        profile: balanced,
        providerId: "claude-code",
        primaryModel: DEFAULT_CLAUDE_OPUS_MODEL,
      }),
    ).toBeNull();
    const routed: AutoRoutingProfile = {
      ...balanced,
      rules: [
        {
          id: "worker-light",
          when: { role: "worker" },
          then: { providerId: "any-eligible", model: "claude-haiku-4-5" },
          reason: "Workers run on the light model.",
          enabled: true,
        },
        ...balanced.rules,
      ],
    };
    expect(
      resolveRoutedWorkerModel({
        profile: routed,
        providerId: "claude-code",
        primaryModel: DEFAULT_CLAUDE_OPUS_MODEL,
      }),
    ).toMatchObject({ model: "claude-haiku-4-5", ruleId: "worker-light" });
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: DEFAULT_CLAUDE_OPUS_MODEL,
      intent: {
        mode: "task-executor",
        presetId: "verified-patch",
        workerModel: "auto",
        workerEffort: "auto",
      },
      autoRoutingProfile: routed,
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.profile.resolvedWorkerModel).toBe("claude-haiku-4-5");
      expect(resolution.profile.resolvedWorkerEffort).toBeNull();
    }
  });

  test("a routed worker model that cannot run as a worker is ignored", () => {
    const routed: AutoRoutingProfile = {
      ...balanced,
      rules: [
        {
          id: "worker-astra",
          when: { role: "worker" },
          then: { providerId: "codex", model: "gpt-6-astra" },
          reason: "",
          enabled: true,
        },
      ],
    };
    expect(
      resolveRoutedWorkerModel({
        profile: routed,
        providerId: "codex",
        primaryModel: "gpt-5.6-sol",
      }),
    ).toBeNull();
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
      version: 4,
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
    expect(formatModelPrice(DEFAULT_CLAUDE_OPUS_MODEL)).toBe("$5 / $25");
    expect(formatModelPrice("gpt-5.6-luna")).toBe("$0.2 / $1.2");
    expect(formatModelPrice("auto")).toBeNull();
    for (const price of Object.values(MODEL_PRICING)) {
      expect(price?.source.startsWith("https://")).toBe(true);
    }
  });

  test("keeps the previous turn's model when the route only steps down", () => {
    // Opus answered the last turn; a docs turn would route to the balanced
    // model. The conversation's cache is scoped to Opus, so the cheaper pick
    // would re-read every prior token uncached — the model is held instead.
    const held = resolveRoute({
      profile: balanced,
      role: "primary",
      signals: signals({
        taskClass: "docs",
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
        lastAssistantModel: "gpt-5.6-sol",
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

import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  cloneProfileAsCustom,
  FOLLOW_LEVEL_TIER,
  resolveRoute,
  resolveRouteTierForModel,
  validateProfile,
  type AutoRoutingProfile,
  type RouteRule,
  type RouterSignals,
} from "@/lib/providers/auto-routing-profile";
import {
  getStrengthPreset,
  getStrengthSources,
  isStrengthRule,
  matchStrengthPreset,
  PROVIDER_STRENGTH_PRESETS,
  readDelegationStrengths,
  readProviderStrengths,
  STRENGTH_AREA_CONDITIONS,
  STRENGTH_AREAS,
  STRENGTH_SOURCES,
  strengthAreaLabel,
  writeProviderStrengths,
  type StrengthArea,
} from "@/lib/providers/provider-strength-presets";
import { parseRouteIntent } from "@/lib/providers/route-intent";
import { computeRouterSignals, detectPromptDomain } from "@/lib/routing/auto-routing";
import {
  fallBackToParentProvider,
  resolveDelegationProvider,
  shouldCheckDelegationProvider,
} from "@/lib/runs/delegation-provider";
import { AgentModelSchema } from "@/lib/agents/schema";

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

function withRules(rules: RouteRule[], base = buildStarterProfile("starter-balanced")): AutoRoutingProfile {
  const custom = cloneProfileAsCustom(base);
  return { ...custom, rules: [...rules, ...custom.rules] };
}

const reviewOnCodex = (tier?: RouteRule["then"]["tier"]): RouteRule => ({
  id: "review-codex",
  when: { taskClass: "review" },
  then: { providerId: "codex", ...(tier ? { tier } : {}) },
  reason: "Reviews run on Codex.",
  enabled: true,
});

describe("follow-level rule tier", () => {
  test("a provider rule that follows the level keeps the level's rung", () => {
    const profile = withRules([reviewOnCodex(FOLLOW_LEVEL_TIER)]);
    const simple = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "review", complexity: "low" }) });
    const expert = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "review", complexity: "expert" }) });
    expect(simple.providerId).toBe("codex");
    expect(expert.providerId).toBe("codex");
    expect(resolveRouteTierForModel(simple.model)).toBe("light");
    expect(resolveRouteTierForModel(expert.model)).toBe("frontier");
  });

  test("a rule without a tier keeps its older meaning, one rung for every level", () => {
    const profile = withRules([reviewOnCodex()]);
    const simple = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "review", complexity: "low" }) });
    const standard = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "review", complexity: "medium" }) });
    expect(simple.model).toBe(standard.model);
  });

  test("follow-level survives validation", () => {
    const profile = withRules([reviewOnCodex(FOLLOW_LEVEL_TIER)]);
    const validated = validateProfile(profile);
    expect(validated.rules.find((rule) => rule.id === "review-codex")?.then.tier).toBe(FOLLOW_LEVEL_TIER);
  });
});

describe("provider changes only at a task boundary", () => {
  const profile = withRules([reviewOnCodex(FOLLOW_LEVEL_TIER)]);

  test("a task's first turn moves to the rule's provider", () => {
    const route = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "review", boundary: true }) });
    expect(route.providerId).toBe("codex");
  });

  test("inside a task the provider that answered last stays", () => {
    const route = resolveRoute({
      profile,
      role: "primary",
      signals: signals({ taskClass: "review", boundary: false, lastAssistantProvider: "claude-code" }),
    });
    expect(route.providerId).toBe("claude-code");
    expect(route.reason).toContain("next task");
  });

  test("Provider switch lets a rule move a task mid-way", () => {
    const switching = { ...profile, signals: { ...profile.signals, providerSwitch: true } };
    const route = resolveRoute({
      profile: switching,
      role: "primary",
      signals: signals({ taskClass: "review", boundary: false, lastAssistantProvider: "claude-code" }),
    });
    expect(route.providerId).toBe("codex");
  });

  test("an agent's preferred provider leads only at a boundary", () => {
    const plain = cloneProfileAsCustom(buildStarterProfile("starter-balanced"));
    const first = resolveRoute({ profile: plain, role: "primary", signals: signals({ boundary: true, preferredProvider: "codex" }) });
    const later = resolveRoute({
      profile: plain,
      role: "primary",
      signals: signals({ boundary: false, lastAssistantProvider: "claude-code", preferredProvider: "codex" }),
    });
    expect(first.providerId).toBe("codex");
    expect(later.providerId).toBe("claude-code");
  });

  test("an unavailable preferred provider is reported, not followed", () => {
    const plain = cloneProfileAsCustom(buildStarterProfile("starter-balanced"));
    const route = resolveRoute({
      profile: plain,
      role: "primary",
      signals: signals({ boundary: true, preferredProvider: "codex", providerAvailability: { codex: false } }),
    });
    expect(route.providerId).toBe("claude-code");
  });
});

describe("usage is judged per provider", () => {
  test("a spent window on the previous provider does not downgrade the destination", () => {
    const profile = withRules([reviewOnCodex(FOLLOW_LEVEL_TIER)]);
    const base = signals({ taskClass: "review", complexity: "high", boundary: true });
    const fresh = resolveRoute({ profile, role: "primary", signals: base });
    const route = resolveRoute({
      profile,
      role: "primary",
      signals: { ...base, budgetUsedPercent: 99, budgetUsedPercentByProvider: { "claude-code": 99, codex: 5 } },
    });
    expect(route.providerId).toBe("codex");
    expect(route.model).toBe(fresh.model);
    expect(route.budgetShift).toBe(0);
  });
});

describe("provider strength presets", () => {
  const base = cloneProfileAsCustom(buildStarterProfile("starter-balanced"));

  test("every preset row cites sources that exist", () => {
    const ids = new Set(STRENGTH_SOURCES.map((source) => source.id));
    for (const preset of PROVIDER_STRENGTH_PRESETS) {
      for (const evidence of Object.values(preset.evidence)) {
        expect(evidence!.sourceIds.length).toBeGreaterThan(0);
        for (const id of evidence!.sourceIds) expect(ids.has(id)).toBe(true);
      }
      expect(getStrengthSources(Object.values(preset.evidence).flatMap((entry) => entry!.sourceIds)).length).toBeGreaterThan(0);
    }
    for (const source of STRENGTH_SOURCES) expect(source.url).toStartWith("https://");
  });

  test("an empty profile reads as empty and off", () => {
    expect(readProviderStrengths(base)).toEqual({ map: {}, enabled: false, empty: true });
  });

  test("writing a preset round-trips and lands before the level rules", () => {
    const preset = getStrengthPreset("evidence-2026-10")!;
    const written = writeProviderStrengths(base, { map: preset.map, enabled: true });
    expect(readProviderStrengths(written)).toEqual({ map: preset.map, enabled: true, empty: false });
    expect(matchStrengthPreset(readProviderStrengths(written).map)?.id).toBe("evidence-2026-10");
    const ids = written.rules.map((rule) => rule.id);
    const firstStrength = ids.findIndex((id) => id.startsWith("strength-"));
    expect(ids[firstStrength - 1]).toBe("delegate-default");
    expect(ids.indexOf("extreme")).toBeGreaterThan(firstStrength);
    for (const rule of written.rules.filter(isStrengthRule)) {
      const area = rule.id.slice("strength-".length) as StrengthArea;
      expect(rule.then.tier).toBe(FOLLOW_LEVEL_TIER);
      expect(STRENGTH_AREAS).toContain(area);
      expect(rule.when).toEqual(STRENGTH_AREA_CONDITIONS[area]);
    }
    // The two domain rows match before the generic implementation row.
    expect(ids.indexOf("strength-ui")).toBeLessThan(ids.indexOf("strength-logic"));
    // Rewriting replaces rather than duplicates.
    const again = writeProviderStrengths(written, { map: { review: "codex" }, enabled: true });
    expect(again.rules.filter(isStrengthRule).map((rule) => rule.id)).toEqual(["strength-review"]);
  });

  test("a user's own task rule outranks a strength", () => {
    const own: RouteRule = { id: "my-review", when: { taskClass: "review" }, then: { providerId: "claude-code", tier: FOLLOW_LEVEL_TIER }, reason: "Mine.", enabled: true };
    const profile = writeProviderStrengths({ ...base, rules: [own, ...base.rules] }, { map: { review: "codex" }, enabled: true });
    const route = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "review", boundary: true, currentProviderId: "codex" }) });
    expect(route.ruleId).toBe("my-review");
    expect(route.providerId).toBe("claude-code");
  });

  test("strengths stored off do not route; on, a first review turn moves to Codex", () => {
    const off = writeProviderStrengths(base, { map: { review: "codex" }, enabled: false });
    const on = writeProviderStrengths(base, { map: { review: "codex" }, enabled: true });
    const first = signals({ taskClass: "review", boundary: true });
    expect(resolveRoute({ profile: off, role: "primary", signals: first }).providerId).toBe("claude-code");
    const routed = resolveRoute({ profile: on, role: "primary", signals: first });
    expect(routed.providerId).toBe("codex");
    expect(routed.ruleId).toBe("strength-review");
  });

  test("an agent's preferred provider outranks a strength", () => {
    const profile = writeProviderStrengths(base, { map: { implement: "claude-code" }, enabled: true });
    const route = resolveRoute({
      profile,
      role: "primary",
      signals: signals({ taskClass: "implement", boundary: true, preferredProvider: "codex" }),
    });
    expect(route.providerId).toBe("codex");
    expect(route.ruleId).not.toBe("strength-implement");
    // Without the agent's preference the strength applies.
    const plain = resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "implement", boundary: true, currentProviderId: "codex" }) });
    expect(plain.providerId).toBe("claude-code");
  });

  test("the cautious preset keeps only medium-or-better rows, and every row is translated", () => {
    const confident = getStrengthPreset("confident")!;
    for (const [taskClass, providerId] of Object.entries(confident.map)) {
      expect(providerId).toBeTruthy();
      expect(confident.evidence[taskClass as keyof typeof confident.evidence]!.confidence).not.toBe("low");
    }
    for (const evidence of Object.values(confident.evidence)) {
      expect(evidence!.rationale).not.toContain("providers:");
      expect(evidence!.rationale.length).toBeGreaterThan(20);
    }
    // Mixed or conflicting evidence keeps the task's provider in the evidence preset.
    const evidence = getStrengthPreset("evidence-2026-10")!;
    expect(evidence.map.implement).toBeUndefined();
    expect(evidence.map["ci-fix"]).toBeUndefined();
    expect(evidence.map.debug).toBeUndefined();
    expect(evidence.map.docs).toBeUndefined();
    // Interface work leans Claude and logic leans Codex, both with low confidence.
    expect(evidence.map.ui).toBe("claude-code");
    expect(evidence.map.logic).toBe("codex");
    expect(evidence.evidence.ui!.confidence).toBe("low");
    expect(evidence.evidence.logic!.confidence).toBe("low");
    for (const area of STRENGTH_AREAS) expect(strengthAreaLabel(area).length).toBeGreaterThan(0);
  });

  test("strength rules survive validation", () => {
    const written = writeProviderStrengths(base, { map: { review: "codex", plan: "claude-code" }, enabled: true });
    expect(readProviderStrengths(validateProfile(written)).map).toEqual({ review: "codex", plan: "claude-code" });
  });
});

describe("resolveDelegationProvider", () => {
  test("explicit, Fixed, preferred, then parent", () => {
    expect(resolveDelegationProvider({ explicit: "codex", parentProviderId: "claude-code" })).toMatchObject({ ok: true, providerId: "codex", source: "explicit" });
    expect(resolveDelegationProvider({ agentModel: { mode: "fixed", providerId: "codex" }, parentProviderId: "claude-code" })).toMatchObject({ ok: true, providerId: "codex", source: "agent-fixed" });
    expect(resolveDelegationProvider({ agentModel: { mode: "auto", preferredProvider: "codex" }, parentProviderId: "claude-code" })).toMatchObject({ ok: true, providerId: "codex", source: "agent-preferred" });
    expect(resolveDelegationProvider({ agentModel: { mode: "auto", preferredProvider: "alternate-provider" }, parentProviderId: "codex" })).toMatchObject({ ok: true, providerId: "claude-code" });
    expect(resolveDelegationProvider({ agentModel: { mode: "auto" }, parentProviderId: "codex" })).toMatchObject({ ok: true, providerId: "codex", source: "parent" });
  });

  test("an explicit provider beats a preference but not a Fixed agent", () => {
    expect(resolveDelegationProvider({ explicit: "claude-code", agentModel: { mode: "auto", preferredProvider: "codex" }, parentProviderId: "codex" })).toMatchObject({ ok: true, providerId: "claude-code" });
    expect(resolveDelegationProvider({ explicit: "claude-code", agentModel: { mode: "fixed", providerId: "codex" } })).toMatchObject({ ok: false, code: "provider-conflict" });
  });

  test("a strength applies after the agent's preference and before the parent", () => {
    expect(resolveDelegationProvider({ agentModel: { mode: "auto", taskClass: "review" }, parentProviderId: "claude-code", strengthProviderId: "codex" }))
      .toMatchObject({ ok: true, providerId: "codex", source: "strengths" });
    expect(resolveDelegationProvider({ agentModel: { mode: "auto", preferredProvider: "claude-code" }, parentProviderId: "codex", strengthProviderId: "codex" }))
      .toMatchObject({ ok: true, providerId: "claude-code", source: "agent-preferred" });
    expect(resolveDelegationProvider({ explicit: "claude-code", parentProviderId: "codex", strengthProviderId: "codex" }))
      .toMatchObject({ ok: true, providerId: "claude-code", source: "explicit" });
  });

  test("only a preference that differs from the parent is checked, and it falls back to the parent", () => {
    const preferred = resolveDelegationProvider({ agentModel: { mode: "auto", preferredProvider: "alternate-provider" }, parentProviderId: "claude-code" });
    expect(shouldCheckDelegationProvider(preferred, "claude-code")).toBe(true);
    expect(fallBackToParentProvider(preferred, "claude-code")).toEqual({ ok: true, providerId: "claude-code", source: "parent", unavailableProviderId: "codex" });
    const fixed = resolveDelegationProvider({ agentModel: { mode: "fixed", providerId: "codex" }, parentProviderId: "claude-code" });
    const explicit = resolveDelegationProvider({ explicit: "codex", parentProviderId: "claude-code" });
    const same = resolveDelegationProvider({ agentModel: { mode: "auto", preferredProvider: "codex" }, parentProviderId: "codex" });
    expect(shouldCheckDelegationProvider(fixed, "claude-code")).toBe(false);
    expect(shouldCheckDelegationProvider(explicit, "claude-code")).toBe(false);
    expect(shouldCheckDelegationProvider(same, "codex")).toBe(false);
  });

  test("a Fixed agent on a provider that cannot delegate, or an unknown parent, is refused", () => {
    expect(resolveDelegationProvider({ agentModel: { mode: "fixed", providerId: "cursor" } })).toMatchObject({ ok: false, code: "provider-unknown" });
    expect(resolveDelegationProvider({ agentModel: { mode: "auto", preferredProvider: "alternate-provider" } })).toMatchObject({ ok: false, code: "provider-unknown" });
    expect(resolveDelegationProvider({})).toMatchObject({ ok: false, code: "provider-unknown" });
  });
});

describe("agent preferred provider schema", () => {
  test("accepts the three preferences and rejects anything else", () => {
    for (const preferredProvider of ["claude-code", "codex", "alternate-provider"]) {
      expect(AgentModelSchema.safeParse({ mode: "auto", preferredProvider }).success).toBe(true);
    }
    expect(AgentModelSchema.safeParse({ mode: "auto", preferredProvider: "cursor" }).success).toBe(false);
    expect(AgentModelSchema.safeParse({ mode: "fixed", providerId: "codex", preferredProvider: "codex" }).success).toBe(false);
  });
});

describe("delegation strengths from the host's Auto settings", () => {
  const base = cloneProfileAsCustom(buildStarterProfile("starter-balanced"));
  const on = writeProviderStrengths(base, { map: { review: "codex" }, enabled: true });
  const off = writeProviderStrengths(base, { map: { review: "codex" }, enabled: false });

  test("only when Auto and the table are both on", () => {
    expect(readDelegationStrengths({ routing: { autoRoutingEnabled: true, autoRoutingProfile: on } })).toEqual({ review: "codex" });
    expect(readDelegationStrengths({ routing: { autoRoutingEnabled: false, autoRoutingProfile: on } })).toBeNull();
    expect(readDelegationStrengths({ routing: { autoRoutingEnabled: true, autoRoutingProfile: off } })).toBeNull();
    expect(readDelegationStrengths({ routing: { autoRoutingEnabled: true, autoRoutingProfile: base } })).toBeNull();
    expect(readDelegationStrengths({ routing: { autoRoutingEnabled: true } })).toBeNull();
    expect(readDelegationStrengths(null)).toBeNull();
  });
});

describe("implementation splits by domain", () => {
  const base = cloneProfileAsCustom(buildStarterProfile("starter-balanced"));
  const profile = writeProviderStrengths(base, { map: { ui: "claude-code", logic: "codex" }, enabled: true });
  const first = (overrides: Partial<RouterSignals>) =>
    resolveRoute({ profile, role: "primary", signals: signals({ taskClass: "implement", boundary: true, ...overrides }) });

  test("interface work starts on Claude, logic on Codex, an unclear domain stays", () => {
    expect(first({ domain: "ui", currentProviderId: "codex" })).toMatchObject({ providerId: "claude-code", ruleId: "strength-ui" });
    expect(first({ domain: "logic" })).toMatchObject({ providerId: "codex", ruleId: "strength-logic" });
    expect(first({ currentProviderId: "codex" }).providerId).toBe("codex");
    expect(first({ currentProviderId: "claude-code" }).providerId).toBe("claude-code");
  });

  test("the generic implementation row catches the rest", () => {
    const withOther = writeProviderStrengths(base, { map: { ui: "claude-code", implement: "codex" }, enabled: true });
    const route = (domain?: "ui" | "logic") => resolveRoute({
      profile: withOther,
      role: "primary",
      signals: signals({ taskClass: "implement", boundary: true, ...(domain ? { domain } : {}) }),
    });
    expect(route("ui").providerId).toBe("claude-code");
    expect(route("logic").providerId).toBe("codex");
    expect(route().providerId).toBe("codex");
  });

  test("a domain condition survives validation", () => {
    const validated = validateProfile(profile);
    expect(validated.rules.find((rule) => rule.id === "strength-ui")?.when).toEqual({ taskClass: "implement", domain: "ui" });
    expect(readProviderStrengths(validated).map).toEqual({ ui: "claude-code", logic: "codex" });
  });
});

describe("domain signal", () => {
  const classified = (domain?: "ui" | "logic" | "unknown") => ({
    version: 2 as const,
    intent: "implement" as const,
    complexity: "medium" as const,
    risk: "normal" as const,
    continuity: "new" as const,
    ...(domain ? { domain } : {}),
    evidenceCodes: [],
  });
  const compute = (prompt: string, classifier: ReturnType<typeof classified> | null) =>
    computeRouterSignals({
      prompt,
      fileContextCount: 0,
      history: [],
      currentProviderId: "claude-code",
      profile: buildStarterProfile("starter-balanced"),
      classifier,
    }).signals.domain;

  test("the classifier answer may carry a domain or leave it out", () => {
    const base = '{"version":2,"intent":"implement","complexity":"medium","risk":"normal","continuity":"new","evidenceCodes":[]}';
    expect(parseRouteIntent(base)?.domain).toBeUndefined();
    expect(parseRouteIntent(base.replace('"evidenceCodes"', '"domain":"ui","evidenceCodes"'))?.domain).toBe("ui");
    expect(parseRouteIntent(base.replace('"evidenceCodes"', '"domain":"backend","evidenceCodes"'))).toBeNull();
  });

  test("the classifier decides; a UI keyword fills in only when it says nothing", () => {
    expect(compute("Wire the billing API", classified("logic"))).toBe("logic");
    expect(compute("Fix the modal layout", classified("unknown"))).toBeUndefined();
    expect(compute("Fix the modal layout", classified())).toBe("ui");
    expect(compute("Fix the modal layout", null)).toBe("ui");
    expect(compute("Add retry to the job queue", null)).toBeUndefined();
  });

  test("UI keywords in English and Korean", () => {
    expect(detectPromptDomain("Polish the settings dialog CSS")).toBe("ui");
    expect(detectPromptDomain("설정 화면 레이아웃을 다듬어줘")).toBe("ui");
    expect(detectPromptDomain("Speed up the SQL query")).toBeUndefined();
  });
});

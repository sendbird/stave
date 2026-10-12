import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  cloneProfileAsCustom,
  FOLLOW_LEVEL_TIER,
  validateProfile,
} from "@/lib/providers/auto-routing-profile";

describe("profile version 6 upgrade", () => {
  const V5_LEVEL_RULES = [
    { id: "extreme", when: { complexity: "extreme" }, then: { providerId: "any-eligible", tier: "frontier", effort: "high" }, reason: "", enabled: true },
    { id: "expert", when: { complexity: "expert" }, then: { providerId: "any-eligible", tier: "frontier", effort: "medium" }, reason: "", enabled: true },
    { id: "complex", when: { complexity: "high" }, then: { providerId: "any-eligible", tier: "flagship", effort: "high" }, reason: "", enabled: true },
    { id: "standard", when: { complexity: "medium" }, then: { providerId: "any-eligible", tier: "flagship", effort: "medium" }, reason: "", enabled: true },
    { id: "bounded", when: { complexity: "low" }, then: { providerId: "any-eligible", tier: "light", effort: "medium" }, reason: "", enabled: true },
  ];

  test("unchanged version 5 level rules in a custom table follow the level", () => {
    const stored = { ...cloneProfileAsCustom(buildStarterProfile("starter-balanced")), version: 5, levels: undefined, rules: V5_LEVEL_RULES };
    const upgraded = validateProfile(stored);
    expect(upgraded.version).toBe(6);
    expect(upgraded.levels).toEqual({});
    for (const rule of upgraded.rules) {
      expect(rule.then).toEqual({ providerId: "any-eligible", tier: FOLLOW_LEVEL_TIER });
    }
    expect(validateProfile(upgraded)).toEqual(upgraded);
  });

  test("a level rule the user changed keeps its own rung and effort", () => {
    const edited = [
      { ...V5_LEVEL_RULES[0]!, then: { providerId: "any-eligible", tier: "frontier", effort: "xhigh" } },
      { ...V5_LEVEL_RULES[1]!, when: { complexity: "expert", taskClass: "plan" } },
      { ...V5_LEVEL_RULES[2]!, then: { providerId: "codex", tier: "flagship", effort: "high" } },
    ];
    const stored = { ...cloneProfileAsCustom(buildStarterProfile("starter-balanced")), version: 5, rules: edited };
    expect(validateProfile(stored).rules.map((rule) => rule.then)).toEqual(edited.map((rule) => rule.then));
  });

  test("a current custom table is left as saved", () => {
    const stored = { ...cloneProfileAsCustom(buildStarterProfile("starter-balanced")), rules: V5_LEVEL_RULES };
    expect(validateProfile(stored).rules.map((rule) => rule.then)).toEqual(V5_LEVEL_RULES.map((rule) => rule.then));
  });
});

import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  buildStarterRules,
  cloneProfileAsCustom,
  validateProfile,
} from "@/lib/providers/auto-routing-profile";

/** The starter table a version 4 profile carried, with a stored skill rule. */
const V4_STARTER_RULES = [
  { id: "delegate-default", when: { role: "delegate" }, then: { providerId: "any-eligible", effort: "medium" }, reason: "", enabled: true },
  { id: "skill-ship", when: { skill: ["ship"] }, then: { providerId: "any-eligible", tier: "light" }, reason: "", enabled: true },
  { id: "plan", when: { taskClass: "plan" }, then: { providerId: "any-eligible", tier: "frontier", effort: "medium" }, reason: "", enabled: true },
  { id: "standard", when: { complexity: "medium" }, then: { providerId: "any-eligible", tier: "balanced", effort: "high" }, reason: "", enabled: true },
];

describe("auto routing profile version 5 upgrade", () => {
  test("a starter profile saved before version 5 takes the current table", () => {
    const stored = {
      ...buildStarterProfile("starter-cost-saver"),
      version: 4,
      rules: V4_STARTER_RULES,
      eligibleModelsByProvider: { codex: ["gpt-6.1-sol", "gpt-6-luna"] },
      signals: { classifier: false, skillRouting: true, budgetGuard: true, safetyEscalation: true, providerSwitch: true },
    };
    const upgraded = validateProfile(stored);
    expect(upgraded.version).toBe(5);
    expect(upgraded.rules).toEqual(buildStarterRules());
    expect(upgraded.stance).toBe("cost-saver");
    expect(upgraded.eligibleModelsByProvider).toEqual({ codex: ["gpt-6.1-sol", "gpt-6-luna"] });
    expect(upgraded.signals).toMatchObject({ classifier: false, providerSwitch: true });
    // Idempotent: a second pass keeps the table.
    expect(validateProfile(upgraded)).toEqual(upgraded);
  });

  test("a custom table saved before version 5 is kept", () => {
    const custom = { ...cloneProfileAsCustom(buildStarterProfile("starter-balanced")), version: 4, rules: V4_STARTER_RULES };
    expect(validateProfile(custom).rules.map((rule) => rule.id)).toEqual(V4_STARTER_RULES.map((rule) => rule.id));
  });

  test("a version 5 starter keeps its saved rules", () => {
    const starter = buildStarterProfile("starter-balanced");
    const edited = { ...starter, rules: starter.rules.slice(1) };
    expect(validateProfile(edited).rules).toEqual(starter.rules.slice(1));
  });
});

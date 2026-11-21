import { describe, expect, test } from "bun:test";
import {
  buildStarterProfile,
  resolveRoute,
  resolveRouteTierForModel,
} from "@/lib/providers/auto-routing-profile";
import { getStrengthPreset, writeProviderStrengths } from "@/lib/providers/provider-strength-presets";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { RouteIntentResult } from "@/lib/providers/route-intent";
import { computeRouterSignals, resolveAutoRoutingDecision } from "@/lib/routing/auto-routing";

const AVAILABILITY: Record<ProviderId, boolean> = {
  "claude-code": true, codex: true, cursor: false, kiro: false, opencode: false,
};

const classification = (overrides: Partial<RouteIntentResult> = {}): RouteIntentResult => ({
  version: 2, intent: "implement", complexity: "low", risk: "normal", continuity: "new",
  evidenceCodes: ["bounded_edit"], ...overrides,
});

describe("Codex route selection", () => {
  test("a classified bounded edit reaches the Confident-only quick-edit rule on Codex", () => {
    const preset = getStrengthPreset("confident")!;
    const profile = writeProviderStrengths(buildStarterProfile("starter-balanced"), { map: preset.map, enabled: true });
    const signalsFor = (classifier: RouteIntentResult) => computeRouterSignals({
      prompt: "Fix this typo", fileContextCount: 0, history: [], currentProviderId: "claude-code",
      currentModel: "claude-opus-5-5", profile, providerAvailability: AVAILABILITY, classifier,
    }).signals;
    const quick = signalsFor(classification());
    expect(quick.taskClass).toBe("quick-edit");
    expect(resolveRoute({ profile, role: "primary", signals: quick }).providerId).toBe("codex");
    // Low-complexity work without bounded-edit evidence stays implementation.
    expect(signalsFor(classification({ evidenceCodes: [] })).taskClass).toBe("implement");
    expect(signalsFor(classification({ complexity: "medium" })).taskClass).toBe("implement");
  });

  test("a gateway id keeps its model's explicit rung", () => {
    expect(resolveRouteTierForModel("gpt-6.2-astra")).toBe("frontier");
    expect(resolveRouteTierForModel("openai/gpt-6.2-astra")).toBe("frontier");
    expect(resolveRouteTierForModel("anthropic/claude-fable-5-2")).toBe(resolveRouteTierForModel("claude-fable-5-2"));
  });

  test("a delegated decision routes by the delegate rule", async () => {
    const decide = (role?: "delegate") => resolveAutoRoutingDecision({
      ...(role ? { role } : {}),
      settings: { autoRoutingEnabled: true, autoRoutingProfile: buildStarterProfile("starter-balanced") },
      runtimeOverrides: { autoRouting: true }, currentProviderId: "codex", currentModel: "gpt-6.2-sol",
      prompt: "Fix this typo", history: [], providerAvailability: { ...AVAILABILITY, "claude-code": false },
      classifyRoute: async () => ({ ok: true, classification: classification({ evidenceCodes: [] }) }),
    } as Parameters<typeof resolveAutoRoutingDecision>[0]);
    const delegated = await decide("delegate");
    expect(delegated?.ruleId).toBe("delegate-default");
    expect(delegated?.role).toBe("delegate");
    expect(resolveRouteTierForModel(delegated!.model)).toBe("flagship");
    const primary = await decide();
    expect(primary?.ruleId).not.toBe("delegate-default");
  });
});

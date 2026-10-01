import { describe, expect, test } from "bun:test";
import { describeAssignRouteModel, resolveAssignRoute } from "@/lib/agents/assign-route";
import { AgentConfigSchema } from "@/lib/agents/schema";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildStarterProfile, DEFAULT_AUTO_ROUTING_PROFILE_ID } from "@/lib/providers/auto-routing-profile";

const profile = buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID);

describe("resolveAssignRoute", () => {
  test("a fixed agent model wins over everything, Stave Auto included, with its effort", () => {
    const agent = AgentConfigSchema.parse({
      ...getBuiltinAgent("implementer")!,
      model: { mode: "fixed", providerId: "codex", model: "gpt-6-sol", effort: "xhigh" },
    });
    for (const autoRoutingEnabled of [false, true]) {
      expect(
        resolveAssignRoute({ agent, profile, preferredProviderId: "claude-code", choice: "kiro", autoRoutingEnabled }),
      ).toMatchObject({ providerId: "codex", model: "gpt-6-sol", effort: "xhigh", source: "agent" });
    }
  });

  test("an explicit provider pick runs the user's model for it and is never routed", () => {
    for (const autoRoutingEnabled of [false, true]) {
      const route = resolveAssignRoute({
        agent: getBuiltinAgent("implementer")!,
        profile,
        preferredProviderId: "claude-code",
        choice: "codex",
        autoRoutingEnabled,
      });
      expect(route).toEqual({ providerId: "codex", model: null, reason: "Runs your default model for this provider.", source: "picked" });
    }
  });

  test("with Stave Auto on, an auto agent pins nothing: every turn is routed when it is sent", () => {
    const route = resolveAssignRoute({
      agent: getBuiltinAgent("implementer")!,
      profile,
      preferredProviderId: "claude-code",
      choice: "auto",
      autoRoutingEnabled: true,
    });
    expect(route).toMatchObject({ providerId: "claude-code", model: null, source: "stave-auto" });
    expect(route.effort).toBeUndefined();
    expect(route.reason).toContain("Implement");
    expect(describeAssignRouteModel(route)).toBe("Stave Auto, each turn");
  });

  test("with Stave Auto off, the user's rules route the agent's task class once, with the rule's effort", () => {
    const route = resolveAssignRoute({
      agent: getBuiltinAgent("implementer")!,
      profile,
      preferredProviderId: "claude-code",
      choice: "auto",
      autoRoutingEnabled: false,
    });
    expect(route.source).toBe("auto-routing");
    expect(route.model).toBeTruthy();
    expect(route.effort).toBeTruthy();
    expect(route.reason).toContain("Stave Auto is off");
    expect(describeAssignRouteModel(route)).toBe(`${route.model} · ${route.effort}`);
  });

  test("without a profile the preferred provider's default runs", () => {
    const route = resolveAssignRoute({ agent: getBuiltinAgent("planner")!, profile: null, preferredProviderId: "kiro", choice: "auto" });
    expect(route).toMatchObject({ providerId: "kiro", model: null, source: "fallback" });
  });
});

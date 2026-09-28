import { describe, expect, test } from "bun:test";
import { resolveAssignRoute } from "@/lib/agents/assign-route";
import { AgentConfigSchema } from "@/lib/agents/schema";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildStarterProfile, DEFAULT_AUTO_ROUTING_PROFILE_ID } from "@/lib/providers/auto-routing-profile";

const profile = buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID);

describe("resolveAssignRoute", () => {
  test("a fixed agent model wins over everything", () => {
    const agent = AgentConfigSchema.parse({
      ...getBuiltinAgent("implementer")!,
      model: { mode: "fixed", providerId: "codex", model: "gpt-6-sol" },
    });
    expect(resolveAssignRoute({ agent, profile, preferredProviderId: "claude-code", choice: "kiro" })).toMatchObject({
      providerId: "codex",
      model: "gpt-6-sol",
      source: "agent",
    });
  });

  test("an explicit provider pick runs with its default model", () => {
    const route = resolveAssignRoute({ agent: getBuiltinAgent("implementer")!, profile, preferredProviderId: "claude-code", choice: "codex" });
    expect(route).toEqual({ providerId: "codex", model: null, reason: "Provider default model.", source: "picked" });
  });

  test("auto follows the user's routing rules and names a real model", () => {
    const route = resolveAssignRoute({ agent: getBuiltinAgent("implementer")!, profile, preferredProviderId: "claude-code", choice: "auto" });
    expect(route.source).toBe("auto-routing");
    expect(route.model).toBeTruthy();
    expect(route.reason.length).toBeGreaterThan(0);
  });

  test("without a profile the preferred provider's default runs", () => {
    const route = resolveAssignRoute({ agent: getBuiltinAgent("planner")!, profile: null, preferredProviderId: "kiro", choice: "auto" });
    expect(route).toMatchObject({ providerId: "kiro", model: null, source: "fallback" });
  });
});

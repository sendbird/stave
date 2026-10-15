import { describe, test, expect } from "bun:test";
import { createConstrainedHostRouter } from "../electron/host-service/supervision/constrained-route-host";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { buildAgentRouteSettings } from "../src/store/agent-route-settings-sync";
import { defaultSettings } from "../src/store/app-settings";
import { previewRouteLevels, resolveRoute } from "../src/lib/providers/auto-routing-profile";
import type { AgentAssignment } from "../src/lib/agents/assign";
import { withConstrainedRoutingCancellation } from "../electron/providers/constrained-routing-cancellation";
import { cancelUtilityRouteClassification } from "../electron/providers/utility-inference";

const id = "44444444-4444-4444-8444-444444444444";
const config = { mode: "gateway" as const, connectionId: id, model: "typesafe-ai/jev" };
const classification = { version: 2, intent: "implement", complexity: "low", risk: "normal", continuity: "new", domain: "logic", evidenceCodes: [] };
const profiles = [{ id, providerId: "codex" as const, kind: "managed" as const, label: "Fixture", gateway: { baseUrl: "https://ai-gateway.vercel.sh/v1", secretId: id, models: ["moonshotai/kimi-k3"] } }];
const settings = buildAgentRouteSettings({ ...defaultSettings, autoRoutingEnabled: true, routingDecision: config });
const input = { workspaceId: "ws", taskId: "child", providerId: "codex" as const, prompt: "Fix a typo", accounts: { codexAccountProfileId: id } };
const assignment = { workspaceId: "ws", role: "delegate", agent: { ...getBuiltinAgent("reviewer")!, model: { mode: "auto" as const, decision: config } } } as AgentAssignment;

describe("constrained host Decision routing", () => {
  test("private admission cancellation reaches classification and handles cancel-before-start", async () => {
    const requestId = crypto.randomUUID();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = withConstrainedRoutingCancellation(requestId, async (signal) => { entered(); await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })); signal.throwIfAborted(); });
    await started; cancelUtilityRouteClassification(requestId);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(withConstrainedRoutingCancellation(requestId, async () => { throw new Error("No late inference"); })).rejects.toMatchObject({ name: "AbortError" });
  });
  test("an omitted Gateway child model selects a registered model and its Agent Decision override", async () => {
    let chosen: unknown;
    const router = createConstrainedHostRouter({ assignment: () => assignment, settings: () => settings, profiles: () => profiles,
      cwd: async () => "/tmp/workspace", history: () => [], classify: async (request) => { chosen = request.routingDecision; return { ok: true, classification }; } });
    const route = await router(input);
    expect(route.fingerprint).toEqual({ providerId: "codex", model: "moonshotai/kimi-k3" });
    expect(route.allowedModels).toEqual(["moonshotai/kimi-k3"]);
    expect(chosen).toEqual(config);
    await expect(router({ ...input, model: "gpt-6-astra", modelPinned: true })).rejects.toThrow("pinned");
    await expect(router({ ...input, workspaceId: "other" })).rejects.toThrow("another workspace");
  });
  test("pins bypass Decision, and a parent frozen catalog wins over widened settings", async () => {
    let calls = 0;
    let complexity = "extreme";
    const router = createConstrainedHostRouter({ assignment: () => null, settings: () => settings, profiles: () => [],
      parentModels: () => ["gpt-6-luna"], cwd: async () => "/tmp/workspace", history: () => [],
      classify: async () => { calls++; return { ok: true, classification: { ...classification, complexity } }; } });
    const base = { ...input, accounts: {}, parentTaskId: "parent" };
    expect((await router({ ...base, model: "gpt-6-luna", modelPinned: true, effort: "high", effortPinned: true })).runtimeOptions.codexReasoningEffort).toBe("high");
    expect(calls).toBe(0);
    await expect(router(base)).rejects.toThrow("allowed model");
    complexity = "low";
    expect((await router(base)).fingerprint.model).toBe("gpt-6-luna");
    await expect(router({ ...base, model: "gpt-6-astra", modelPinned: true })).rejects.toThrow("frozen");
  });
  test("classification failure keeps local routing inside the same provider/catalog and cancellation rejects a late result", async () => {
    const router = createConstrainedHostRouter({ assignment: () => assignment, settings: () => settings, profiles: () => profiles,
      cwd: async () => "/tmp/workspace", history: () => [], classify: async () => ({ ok: false }) });
    expect((await router(input)).fingerprint.model).toBe("moonshotai/kimi-k3");
    const controller = new AbortController(); controller.abort();
    await expect(router(input, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  test("a run's frozen composer pin wins over the Agent's fixed model, on its provider or another", async () => {
    const fixedAgent = { ...assignment, role: "primary", agent: { ...getBuiltinAgent("implementer")!,
      model: { mode: "fixed" as const, providerId: "codex" as const, model: "gpt-6.1-sol" } } } as AgentAssignment;
    const router = createConstrainedHostRouter({ assignment: () => fixedAgent, settings: () => settings, profiles: () => [],
      cwd: async () => "/tmp/workspace", history: () => [], classify: async () => ({ ok: false }) });
    const run = { workspaceId: "ws", taskId: "lead", prompt: "Fix a typo", accounts: {}, modelPinned: true };
    expect((await router({ ...run, providerId: "codex", model: "gpt-6-astra", allowedModels: ["gpt-6-astra"] })).fingerprint)
      .toEqual({ providerId: "codex", model: "gpt-6-astra" });
    expect((await router({ ...run, providerId: "claude-code", model: "claude-opus-5-5", allowedModels: ["claude-opus-5-5"] })).fingerprint)
      .toEqual({ providerId: "claude-code", model: "claude-opus-5-5" });
    // Without a frozen pin the fixed model still applies, and its provider cannot change.
    expect((await router({ ...run, providerId: "codex", modelPinned: false })).fingerprint.model).toBe("gpt-6.1-sol");
    await expect(router({ ...run, providerId: "claude-code", modelPinned: false })).rejects.toThrow("fixed Agent provider");
  });
  test("Settings previews use the same exclusive models as execution, including empty intersections", () => {
    const profile = defaultSettings.autoRoutingProfile;
    const pins = ["moonshotai/kimi-k3"];
    const preview = previewRouteLevels({ profile, providerId: "codex", runtimeModels: pins, exclusiveModels: pins });
    expect(preview.some((entry) => entry.route?.model === pins[0])).toBe(true);
    expect(preview.every((entry) => entry.route === null || entry.route.model === pins[0])).toBe(true);
    expect(previewRouteLevels({ profile, providerId: "codex", exclusiveModels: [] }).every((entry) => entry.route === null)).toBe(true);
    expect(resolveRoute({ profile, role: "primary", exclusiveModelsByProvider: { codex: pins },
      signals: { taskClass: "implement", complexity: "low", sensitive: false, fileContextCount: 0, currentProviderId: "codex", providerAvailability: { codex: true, "claude-code": false, cursor: false, kiro: false } } }).model).toBe(pins[0]!);
  });
});

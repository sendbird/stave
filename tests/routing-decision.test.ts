import { describe, expect, test } from "bun:test";
import { RoutingDecisionConfigSchema, normalizeRoutingDecision } from "../src/lib/providers/routing-decision";
import { filterApiConnectionCatalog } from "../src/lib/providers/api-connection-catalog";
import { classifyGatewayRoute } from "../electron/providers/gateway-route-classification";
import { runRoutingDecisionClassification } from "../electron/providers/routing-decision-classification";
import { classifyUtilityRoute, type UtilityInferenceRunners } from "../electron/providers/utility-inference";
import type { UtilityInferenceMetadata } from "../src/lib/providers/utility-inference";
import { buildStarterProfile, DEFAULT_AUTO_ROUTING_PROFILE_ID, listEligibleRouteModels, resolveRouteTierForModel } from "../src/lib/providers/auto-routing-profile";
import { resolveAutoRoutingDecision } from "../src/lib/routing/auto-routing";
import { resolveApiConnectionModel } from "../electron/provider-accounts/gateway-runtime";
import { AgentRouteSettingsSchema, routeAgentRunTurn } from "../src/lib/routing/agent-run-route";
import { defaultSettings } from "../src/store/app-settings";
import { buildAgentRouteSettings } from "../src/store/agent-route-settings-sync";
import { createAgentRunRouter } from "../electron/host-service/supervision/agent-run-route-host";
import { listAgents } from "../src/lib/agents/library";
import { ClassifyRouteArgsSchema } from "../electron/main/ipc/provider-route-classification-schema";

const connectionId = "44444444-4444-4444-8444-444444444444";
const gateway = { mode: "gateway" as const, connectionId, model: "typesafe-ai/jev" };
const classification = { version: 2 as const, intent: "implement" as const, complexity: "medium" as const, risk: "normal" as const, continuity: "new" as const, domain: "logic" as const, evidenceCodes: [] };
const metadata = (providerId: "codex" | "claude-code", ok: boolean): UtilityInferenceMetadata => ({ providerId: ok ? providerId : null, model: null, selectionReason: "explicit", degraded: !ok, attempts: [{ providerId, model: "fixture", ok }] });
const answers = Object.fromEntries(["intent", "complexity", "risk", "continuity", "domain"].map((key) => [key, { type: "choice", choice: classification[key as keyof typeof classification] }]));

describe("Routing decision selection and transport", () => {
  test("default is automatic and gateway requires an explicit connection", () => {
    expect(normalizeRoutingDecision(undefined)).toEqual({ mode: "automatic" });
    expect(RoutingDecisionConfigSchema.safeParse({ mode: "gateway", model: "typesafe-ai/jev" }).success).toBe(false);
    expect(normalizeRoutingDecision(gateway)).toEqual(gateway);
    expect(ClassifyRouteArgsSchema.safeParse({ prompt: "Implement", routingDecision: gateway }).success).toBe(true);
    expect(ClassifyRouteArgsSchema.safeParse({ prompt: "Implement", routingDecision: { ...gateway, token: "fixture-secret" } }).success).toBe(false);
  });
  test("discovery separates decision and coding capabilities, including renamed types", () => {
    const payload = { data: [{ id: "typesafe-ai/jev", type: "evaluation" }, { id: "fixture/decision", type: "decision" }, { id: "fixture/coder", type: "language", tags: ["tool-use"] }] };
    expect(filterApiConnectionCatalog(payload).map((entry) => entry.id)).toEqual(["fixture/coder"]);
    expect(filterApiConnectionCatalog(payload, Date.now(), "decision").map((entry) => entry.id)).toEqual(["fixture/decision", "typesafe-ai/jev"]);
  });
  test("Decision HTTP sends bounded state and typed questions, then validates the response", async () => {
    let body: Record<string, unknown> | undefined;
    const result = await classifyGatewayRoute({ model: gateway.model, token: "fixture-key", input: { prompt: "x".repeat(6000), history: Array.from({ length: 12 }, () => ({ role: "user" as const, content: "history" })) }, signal: new AbortController().signal,
      request: (async (url, options) => {
        expect(url).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
        expect(options?.redirect).toBe("error");
        expect(options?.headers).toMatchObject({ Authorization: "Bearer fixture-key" });
        body = JSON.parse(String(options?.body));
        return new Response(JSON.stringify({ model: gateway.model, answers }));
      }) as typeof fetch });
    expect(result).toEqual(classification);
    expect((body?.state as { prompt: string; history: unknown[] }).prompt).toHaveLength(4000);
    expect((body?.state as { history: unknown[] }).history).toHaveLength(6);
    expect(JSON.stringify(body)).not.toContain("fixture-key");
  });
  test("invalid and unauthorized Decision responses cannot choose a route", async () => {
    for (const response of [new Response("refused", { status: 401 }), new Response("quota", { status: 402 }), new Response("limited", { status: 429 }), new Response(JSON.stringify({ answers: { ...answers, intent: { choice: "execute-everything" } } })), new Response("x".repeat(65_000))]) {
      expect(await classifyGatewayRoute({ model: gateway.model, token: "fixture-key", input: { prompt: "Do work" }, signal: new AbortController().signal, request: (async () => response) as typeof fetch })).toBeNull();
    }
  });
  test("Jev success does not invoke native inference or expose the key in metadata", async () => {
    const result = await runRoutingDecisionClassification({ request: { prompt: "Implement", routingDecision: gateway }, signal: new AbortController().signal,
      credentials: async () => ({ type: "gateway-credential-response", id: "fixture", decisionToken: "fixture-key" }),
      gateway: async () => classification,
      native: async () => { throw new Error("Native inference must not run"); } });
    expect(result.value).toEqual(classification);
    expect(result.utility.gateway).toEqual({ connectionId, model: gateway.model, ok: true });
    expect(JSON.stringify(result)).not.toContain("fixture-key");
  });
  test("Gateway records reported cost and safe failure categories without raw backend text", async () => {
    let observation: unknown;
    await classifyGatewayRoute({ model: gateway.model, token: "fixture-key", input: { prompt: "Implement" }, signal: new AbortController().signal,
      observe: (value) => { observation = value; }, request: (async () => new Response(JSON.stringify({ model: gateway.model, answers, providerMetadata: { gateway: { cost: "0.00001155" } } }))) as typeof fetch });
    expect(observation).toMatchObject({ reportedCostUsd: 0.00001155, model: gateway.model });
    await classifyGatewayRoute({ model: gateway.model, token: "fixture-key", input: { prompt: "Implement" }, signal: new AbortController().signal,
      observe: (value) => { observation = value; }, request: (async () => new Response("fixture-key sensitive body", { status: 402 })) as typeof fetch });
    expect(observation).toEqual({ failure: "budget" });
    expect(JSON.stringify(observation)).not.toContain("fixture-key");
  });
  test("Jev failure falls through Luna to Haiku; missing key does the same", async () => {
    for (const token of [undefined, "fixture-key"]) {
      const calls: string[] = [];
      const result = await runRoutingDecisionClassification({ request: { prompt: "Implement", routingDecision: gateway }, signal: new AbortController().signal,
        credentials: async () => ({ type: "gateway-credential-response", id: "fixture", decisionToken: token }), gateway: async () => null,
        native: async (providerId, model) => { calls.push(`${providerId}:${model}`); return { value: providerId === "claude-code" ? classification : null, utility: metadata(providerId, providerId === "claude-code") }; } });
      expect(calls).toEqual(["codex:gpt-6-luna", "claude-code:claude-haiku-5-5"]);
      expect(result.value).toEqual(classification);
      expect(result.utility.degraded).toBe(true);
    }
  });
  test("automatic skips unavailable Luna and uses Haiku; both unavailable means local fallback", async () => {
    for (const haikuReady of [true, false]) {
      const ran: string[] = [];
      const run = async (args: { model: string }) => { ran.push(args.model); return { ok: true, text: JSON.stringify(classification) }; };
      const runners: UtilityInferenceRunners = { codex: run, "claude-code": run, cursor: run, kiro: run };
      const result = await classifyUtilityRoute({ prompt: "Implement", routingDecision: { mode: "automatic" } }, runners, async ({ providerId }) => ({ ready: providerId === "claude-code" && haikuReady }));
      expect(result.ok).toBe(haikuReady);
      expect(ran).toEqual(haikuReady ? ["claude-haiku-5-5"] : []);
    }
  });
  test("automatic prefers Luna regardless of active task provider or Background AI utility model", async () => {
    const ran: string[] = [];
    const run = async (args: { model: string }) => { ran.push(args.model); return { ok: true, text: JSON.stringify(classification) }; };
    const runners: UtilityInferenceRunners = { codex: run, "claude-code": run, cursor: run, kiro: run };
    const result = await classifyUtilityRoute({ prompt: "Implement", activeProviderId: "claude-code", utilityModel: "claude-opus-5-5", routingDecision: { mode: "automatic" } }, runners, async () => ({ ready: true }));
    expect(result.ok).toBe(true); expect(ran).toEqual(["gpt-6-luna"]);
  });
  test("host cancellation reaches native classification and does not start Haiku", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    let reached!: () => void;
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    const run: UtilityInferenceRunners["codex"] = async ({ signal, model }) => {
      calls.push(model); reached();
      return new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ ok: false, aborted: true }), { once: true }));
    };
    const result = classifyUtilityRoute({ prompt: "Implement", routingDecision: { mode: "automatic" } }, { codex: run, "claude-code": run, cursor: run, kiro: run }, async () => ({ ready: true }), controller.signal);
    await ready; controller.abort();
    expect((await result).ok).toBe(false);
    expect(calls).toEqual(["gpt-6-luna"]);
  });
  test("cancellation during Jev prevents any fallback, including a late successful result", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const result = runRoutingDecisionClassification({ request: { prompt: "Implement", routingDecision: gateway }, signal: controller.signal,
      credentials: async () => ({ type: "gateway-credential-response", id: "fixture", decisionToken: "fixture-key" }),
      gateway: async ({ signal }) => { controller.abort(); expect(signal.aborted).toBe(true); await new Promise<void>((resolve) => { release = resolve; }); return classification; },
      native: async () => { throw new Error("Cancelled calls cannot fall back"); } });
    expect((await result).value).toBeNull(); release();
  });
  test("global Decision settings survive host schema serialization and Agent overrides win", async () => {
    const routeSettings = AgentRouteSettingsSchema.parse(JSON.parse(JSON.stringify(buildAgentRouteSettings({ ...defaultSettings, autoRoutingEnabled: true, routingDecision: gateway }))));
    expect(routeSettings.classifier?.codex?.routingDecision).toEqual(gateway);
    let requested: unknown;
    const router = createAgentRunRouter({ readTask: async () => ({ providerId: "codex", model: "gpt-6-luna" }), readDraft: () => ({ autoRouting: true }), readMessages: () => [], readSettings: () => routeSettings, resolveWorkspacePath: async () => "/tmp/workspace",
      classify: async (request) => { requested = request.routingDecision; return { ok: true, classification }; } });
    const agent = { ...listAgents({ custom: [] })[0]!, model: { mode: "auto" as const, decision: { mode: "native" as const, providerId: "claude-code" as const } } };
    await router({ agentRun: { workspaceId: "workspace", leadTaskId: "task" } as never, prompt: "Implement", agent });
    expect(requested).toEqual(agent.model.decision);
  });
  test("saved host contexts without Decision settings resume with the automatic default", async () => {
    const routeSettings = buildAgentRouteSettings({ ...defaultSettings, autoRoutingEnabled: true,
      auxiliaryInferencePolicy: { ...defaultSettings.auxiliaryInferencePolicy, utility: { ...defaultSettings.auxiliaryInferencePolicy.utility, enabled: false } } });
    expect(routeSettings.classifier?.codex).toBeDefined();
    const restored = AgentRouteSettingsSchema.parse(JSON.parse(JSON.stringify({ ...routeSettings,
      classifier: { codex: { utilityProviderId: "claude-code", utilityModel: "claude-opus-5-5" } } })));
    let requested: unknown;
    const router = createAgentRunRouter({ readTask: async () => ({ providerId: "codex", model: "gpt-6-luna" }),
      readDraft: () => ({ autoRouting: true }), readMessages: () => [], readSettings: () => restored,
      resolveWorkspacePath: async () => "/tmp/workspace",
      classify: async (request) => { requested = request.routingDecision; return { ok: true, classification }; } });
    await router({ agentRun: { workspaceId: "workspace", leadTaskId: "task" } as never, prompt: "Implement", agent: null });
    expect(requested).toEqual({ mode: "automatic" });
  });
});

describe("Gateway execution candidates", () => {
  test("qualified native models retain their routing tiers and native aliases", () => {
    expect(resolveRouteTierForModel("openai/gpt-6-luna")).toBe(resolveRouteTierForModel("gpt-6-luna"));
    expect(resolveRouteTierForModel("anthropic/claude-haiku-5.5")).toBe(resolveRouteTierForModel("claude-haiku-5-5"));
    expect(resolveApiConnectionModel({ runtime: "claude-code", models: ["anthropic/claude-haiku-5.5"], model: "claude-haiku-5-5" })).toBe("anthropic/claude-haiku-5.5");
  });
  test("Auto and Agent Auto select only pinned models, then runtime resolution succeeds", async () => {
    const profile = buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID); profile.signals.classifier = false;
    const pinned = ["moonshotai/kimi-k3"];
    const exclusiveModelsByProvider = { codex: pinned };
    const decision = await resolveAutoRoutingDecision({ settings: { autoRoutingEnabled: true, autoRoutingProfile: profile }, runtimeOverrides: { autoRouting: true }, currentProviderId: "codex", currentModel: pinned[0]!, prompt: "Fix a typo in README.md", history: [], exclusiveModelsByProvider });
    expect(decision.model).toBe(pinned[0]!);
    expect(resolveApiConnectionModel({ runtime: "codex", models: pinned, model: decision.model })).toBe(pinned[0]!);
    const agentRoute = await routeAgentRunTurn({ agent: { model: { mode: "auto" } }, draft: { autoRouting: true }, current: { providerId: "codex", model: pinned[0]! }, settings: { routing: { autoRoutingEnabled: true, autoRoutingProfile: profile }, classifier: null }, prompt: "Fix a typo", history: [], exclusiveModelsByProvider });
    expect(agentRoute.model).toBe(pinned[0]!);
  });
  test("connection restrictions intersect user allowlists instead of reintroducing native defaults", () => {
    const profile = buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID);
    profile.eligibleModelsByProvider.codex = ["gpt-6-luna"];
    expect(listEligibleRouteModels({ profile, providerId: "codex", exclusiveModels: ["moonshotai/kimi-k3"] })).toEqual([]);
    expect(listEligibleRouteModels({ profile, providerId: "codex", exclusiveModels: ["openai/gpt-6-luna"] })).toEqual(["openai/gpt-6-luna"]);
  });
});

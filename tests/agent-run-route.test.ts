import { describe, expect, test } from "bun:test";
import { buildStarterProfile, DEFAULT_AUTO_ROUTING_PROFILE_ID } from "../src/lib/providers/auto-routing-profile";
import { getDefaultModelForProvider } from "../src/lib/providers/model-catalog";
import { ROUTE_INTENT_VERSION } from "../src/lib/providers/route-intent";
import { resolveAutoRoutingDecision } from "../src/lib/routing/auto-routing";
import {
  AgentRouteSettingsSchema,
  createAgentRouteClassifier,
  routeAgentRunTurn,
  toRoutingHistory,
  type AgentRouteSettings,
} from "../src/lib/routing/agent-run-route";
import { createAgentRunRouter } from "../electron/host-service/supervision/agent-run-route-host";
import type { Mission } from "../src/lib/missions/domain";

function settings(overrides: Partial<AgentRouteSettings["routing"]> = {}, classifier: AgentRouteSettings["classifier"] = null) {
  return AgentRouteSettingsSchema.parse({
    routing: {
      autoRoutingEnabled: true,
      autoRoutingUseClassifier: false,
      autoRoutingObjective: 50,
      autoRoutingSafetyEscalation: true,
      autoRoutingAllowProviderSwitch: false,
      autoRoutingEligibleClaudeModels: [],
      autoRoutingEligibleCodexModels: [],
      autoRoutingProfile: buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID),
      ...overrides,
    },
    classifier,
  });
}

const CURRENT = { providerId: "claude-code" as const, model: "sonnet" };
const AUTO_AGENT = { model: { mode: "auto" as const, taskClass: "review" as const } };
const FIXED_AGENT = { model: { mode: "fixed" as const, providerId: "codex" as const, model: "gpt-5.5", effort: "high" as const } };
const BASE = { current: CURRENT, prompt: "Look over the export change.", history: [] };

describe("agent run routing: precedence", () => {
  test("a pin in the draft wins over the agent's fixed model and Stave Auto", async () => {
    const route = await routeAgentRunTurn({
      ...BASE,
      agent: FIXED_AGENT,
      draft: { autoRouting: false, model: "opus", modelProviderId: "claude-code", claudeEffort: "max" },
      settings: settings(),
    });
    expect(route).toMatchObject({ providerId: "claude-code", model: "opus", route: "pinned", runtimeOptions: { claudeEffort: "max" } });
  });

  test("the agent's fixed model wins over Stave Auto", async () => {
    const route = await routeAgentRunTurn({ ...BASE, agent: FIXED_AGENT, draft: { autoRouting: true }, settings: settings() });
    expect(route).toMatchObject({ providerId: "codex", model: "gpt-5.5", route: "agent-fixed" });
    expect(route.runtimeOptions.codexReasoningEffort).toBe("high");
    // The same model in the draft is still the agent's own, not a pin.
    const drafted = await routeAgentRunTurn({
      ...BASE,
      agent: FIXED_AGENT,
      draft: { model: "gpt-5.5", modelProviderId: "codex" },
      settings: settings(),
    });
    expect(drafted.route).toBe("agent-fixed");
  });

  test("a provider-only agent's own model is its provider's default; another model of that provider is a pin", async () => {
    const providerOnly = { model: { mode: "fixed" as const, providerId: "claude-code" as const } };
    const defaultModel = getDefaultModelForProvider({ providerId: "claude-code" });
    const own = await routeAgentRunTurn({
      ...BASE,
      agent: providerOnly,
      draft: { model: defaultModel, modelProviderId: "claude-code" },
      settings: settings(),
    });
    expect(own).toMatchObject({ model: defaultModel, route: "agent-fixed", rationale: "The agent's fixed model." });
    const pinned = await routeAgentRunTurn({
      ...BASE,
      agent: providerOnly,
      draft: { model: "claude-sonnet-5", modelProviderId: "claude-code" },
      settings: settings(),
    });
    expect(pinned).toMatchObject({ model: "claude-sonnet-5", route: "pinned", rationale: "Pinned in the composer." });
  });

  test("Stave Auto routes with the agent's task class", async () => {
    const route = await routeAgentRunTurn({ ...BASE, agent: AUTO_AGENT, draft: { autoRouting: true }, settings: settings() });
    const expected = await resolveAutoRoutingDecision({
      settings: settings().routing,
      runtimeOverrides: { autoRouting: true },
      currentProviderId: CURRENT.providerId,
      currentModel: CURRENT.model,
      prompt: BASE.prompt,
      history: [],
      phase: "execute",
      taskClassHint: "review",
    });
    expect(route).toMatchObject({ route: "auto", providerId: expected.providerId, model: expected.model });
    expect(route.rationale).toContain("routed as the agent's review work");
  });

  test("Stave Auto asks the classifier on every routed turn", async () => {
    const requests: string[] = [];
    const classifierOn = settings({ autoRoutingProfile: { ...buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID) } });
    classifierOn.routing.autoRoutingProfile!.signals.classifier = true;
    for (const prompt of ["First turn.", "Second turn."]) {
      await routeAgentRunTurn({
        ...BASE,
        prompt,
        agent: AUTO_AGENT,
        draft: { autoRouting: true },
        settings: classifierOn,
        classifyRoute: async (request) => {
          requests.push(request.prompt);
          return null;
        },
      });
    }
    expect(requests).toEqual(["First turn.", "Second turn."]);
  });

  test("nothing routes when Stave Auto is off, the settings never synced, or the task is not on Auto", async () => {
    for (const args of [
      { settings: settings({ autoRoutingEnabled: false }), draft: { autoRouting: true } },
      { settings: null, draft: { autoRouting: true } },
      { settings: settings(), draft: {} },
    ]) {
      const route = await routeAgentRunTurn({ ...BASE, agent: AUTO_AGENT, ...args });
      expect(route).toMatchObject({ providerId: "claude-code", model: "sonnet", route: "task-model", runtimeOptions: {} });
    }
  });
});

describe("agent run routing: host ports", () => {
  const RESULT = {
    version: ROUTE_INTENT_VERSION,
    intent: "review",
    complexity: "medium",
    risk: "normal",
    continuity: "continuing",
    evidenceCodes: [],
  };

  test("the classifier port passes the synced context and the bounded request", async () => {
    const seen: unknown[] = [];
    const classify = createAgentRouteClassifier({
      context: { utilityProviderId: "codex", cwd: "/tmp/ws", activeProviderId: "claude-code" },
      classify: async (request) => {
        seen.push(request);
        return { ok: true, classification: RESULT };
      },
    });
    const answer = await classify({ prompt: "Review it.", history: [], fileContextCount: 0 });
    expect(answer?.intent).toBe(RESULT.intent);
    expect(seen[0]).toMatchObject({ utilityProviderId: "codex", cwd: "/tmp/ws", activeProviderId: "claude-code", prompt: "Review it." });
  });

  test("a failed, malformed or thrown classification is no answer", async () => {
    for (const classify of [
      async () => ({ ok: false }),
      async () => ({ ok: true, classification: { intent: "nope" } }),
      async () => {
        throw new Error("down");
      },
    ]) {
      const port = createAgentRouteClassifier({ context: {}, classify });
      expect(await port({ prompt: "x", history: [], fileContextCount: 0 })).toBeNull();
    }
  });

  test("routing history keeps readable user and assistant messages", () => {
    expect(
      toRoutingHistory([
        { role: "user", content: "Add export." },
        { role: "assistant", content: "Done.", providerId: "codex", model: "gpt-5.5" },
        { role: "system", content: "skip" },
        null,
        { role: "assistant", content: 3 },
      ]),
    ).toEqual([
      { role: "user", content: "Add export." },
      { role: "assistant", content: "Done.", providerId: "codex", model: "gpt-5.5" },
    ]);
  });

  test("the host router reads the task's draft and runtime and returns a mission route", async () => {
    const route = createAgentRunRouter({
      readTask: async () => ({ providerId: "claude-code", model: "sonnet" }),
      readDraft: () => ({ model: "opus", modelProviderId: "claude-code" }),
      readMessages: () => [],
      readSettings: () => settings(),
      resolveWorkspacePath: async () => "/tmp/ws",
      classify: async () => ({ ok: false }),
    });
    const mission = { workspaceId: "ws-1", leadTaskId: "task-1" } as Mission;
    expect(await route({ mission, prompt: "x", agent: null })).toMatchObject({
      fingerprint: { providerId: "claude-code", model: "opus" },
      route: "pinned",
    });
    const cursorTask = createAgentRunRouter({
      readTask: async () => ({ providerId: "cursor", model: "auto" }),
      readDraft: () => null,
      readMessages: () => [],
      readSettings: () => null,
      resolveWorkspacePath: async () => null,
      classify: async () => ({ ok: false }),
    });
    expect(await cursorTask({ mission, prompt: "x", agent: null })).toBeNull();
  });
});

import type { AgentAssignment } from "../../../src/lib/agents/assign";
import { ConstrainedRouteInputSchema, type ConstrainedRouteInput, type ConstrainedRouteResult } from "../../../src/lib/routing/constrained-route";
import { createAgentRouteClassifier, toRoutingHistory, type AgentRouteSettings } from "../../../src/lib/routing/agent-run-route";
import { resolveAutoRoutingDecision, routeEffortOverrides, resolveAutoRoutingProfile } from "../../../src/lib/routing/auto-routing";
import { getSdkModelOptions } from "../../../src/lib/providers/model-catalog";
import { listEligibleRouteModels } from "../../../src/lib/providers/auto-routing-profile";
import { buildDelegatedTaskRuntimeOptions } from "../../../src/lib/runs/delegated-task-runtime";
import { DEFAULT_ROUTING_DECISION } from "../../../src/lib/providers/routing-decision";
import type { RouteClassificationRequest, UtilityInferenceMetadata } from "../../../src/lib/providers/utility-inference";
import { exclusiveGatewayModels } from "../../../src/lib/providers/api-connection-routing";
import type { ProviderAccountProfile } from "../../../src/lib/providers/provider-accounts";
import { supportsAdaptiveEffort } from "../../../src/lib/agent-runs/resources";
import { resolveApiConnectionModel } from "../../provider-accounts/gateway-runtime";
import { withProviderAccountScope } from "../../provider-accounts/runtime-scope";

export function createConstrainedHostRouter(deps: {
  assignment: (taskId: string) => AgentAssignment | null;
  settings: () => AgentRouteSettings | null;
  profiles: () => ProviderAccountProfile[];
  parentModels?: (taskId: string, providerId: "codex" | "claude-code") => string[] | undefined;
  history: (input: ConstrainedRouteInput) => readonly unknown[];
  cwd: (workspaceId: string) => Promise<string | null>;
  classify: (input: RouteClassificationRequest, signal?: AbortSignal) => Promise<{ ok: boolean; classification?: unknown; utility?: UtilityInferenceMetadata }>;
}) {
  return async (raw: ConstrainedRouteInput, signal?: AbortSignal): Promise<ConstrainedRouteResult> => {
    const input = ConstrainedRouteInputSchema.parse(raw);
    signal?.throwIfAborted();
    const assignment = deps.assignment(input.taskId);
    if (assignment && assignment.workspaceId !== input.workspaceId) throw new Error("The routing task belongs to another workspace.");
    const agent = assignment?.agent;
    const providerId = input.providerId;
    // A route the caller already froze to a pinned model (a run's team limits) keeps
    // that model: the Agent's fixed model, or the composer pin that overrode it.
    const frozenPin = Boolean(input.modelPinned && input.allowedModels && input.model);
    // A fixed Agent compiles for its own provider only, whatever model a pin chose.
    if (agent?.model.mode === "fixed" && agent.model.providerId !== providerId) throw new Error("The fixed Agent provider cannot change.");
    const fixed = agent?.model.mode === "fixed" && !frozenPin ? agent.model : null;
    return withProviderAccountScope(input.accounts, async () => {
      const pins = exclusiveGatewayModels(deps.profiles(), input.accounts)[providerId];
      const requested = fixed ? fixed.model ?? input.model : input.model;
      let model = pins ? resolveApiConnectionModel({ runtime: providerId, models: pins, model: requested })
        : requested ?? buildDelegatedTaskRuntimeOptions({ providerId }).model!;
      if (!model) throw new Error("Choose a model pinned on this API connection before starting.");
      const settings = deps.settings();
      const profile = resolveAutoRoutingProfile(settings?.routing ?? { autoRoutingEnabled: false });
      const frozen = input.allowedModels ?? (input.parentTaskId ? deps.parentModels?.(input.parentTaskId, providerId) : undefined);
      const pool = (frozen ?? pins ?? getSdkModelOptions({ providerId })).filter((id) => !pins || Boolean(resolveApiConnectionModel({ runtime: providerId, models: pins, model: id })));
      let allowedModels = settings?.routing.autoRoutingEnabled ? listEligibleRouteModels({ profile, providerId, exclusiveModels: pool }) : [...pool];
      const locked = input.modelPinned || agent?.model.mode === "fixed";
      const effort = fixed ? fixed.effort ?? input.effort : input.effort;
      const effortLocked = input.effortPinned || Boolean(fixed?.effort);
      if (!locked && effortLocked && effort) allowedModels = allowedModels.filter((id) => supportsAdaptiveEffort(providerId, id, effort));
      if (locked && frozen && !frozen.includes(model)) throw new Error("The model is outside the frozen routing catalog.");
      if (!locked && frozen && !allowedModels.includes(model)) { model = allowedModels[0]; if (!model) throw new Error("No model remains in the frozen routing catalog."); }
      if (locked || !settings?.routing.autoRoutingEnabled) return { fingerprint: { providerId, model },
        runtimeOptions: routeEffortOverrides({ providerId, model, effort }), route: locked ? "pinned" : "task-model",
        rationale: locked ? "Pinned delegation route." : "Auto is disabled.", allowedModels: [model], selection: null };
      const context = settings.classifier?.[providerId];
      const decisionConfig = agent?.model.mode === "auto" ? agent.model.decision ?? context?.routingDecision ?? DEFAULT_ROUTING_DECISION : context?.routingDecision ?? DEFAULT_ROUTING_DECISION;
      const cwd = context ? await deps.cwd(input.workspaceId) : null;
      let utility: UtilityInferenceMetadata | undefined;
      const classifyRoute = context ? createAgentRouteClassifier({ context: { ...context, routingDecision: decisionConfig, ...(cwd ? { cwd } : {}) },
        classify: async (request, token) => { const result = await deps.classify({ ...request, ...(input.requestId ? { requestId: input.requestId } : {}) }, token); utility = result.utility; return result; } }) : undefined;
      const decision = await resolveAutoRoutingDecision({ settings: { ...settings.routing, autoRoutingProfile: { ...profile, signals: { ...profile.signals, providerSwitch: false } } },
        runtimeOverrides: { autoRouting: true }, currentProviderId: providerId, currentModel: allowedModels.includes(model) ? model : allowedModels[0] ?? model, prompt: input.prompt,
        history: toRoutingHistory(deps.history(input)), signal, classifyRoute,
        taskClassHint: agent?.model.mode === "auto" ? agent.model.taskClass : undefined,
        providerAvailability: { codex: providerId === "codex", "claude-code": providerId === "claude-code", cursor: false, kiro: false },
        exclusiveModelsByProvider: { [providerId]: allowedModels } });
      const options = effortLocked ? routeEffortOverrides({ providerId, model: decision.model, effort })
        : { ...(decision.claudeEffort ? { claudeEffort: decision.claudeEffort } : {}), ...(decision.codexReasoningEffort ? { codexReasoningEffort: decision.codexReasoningEffort } : {}) };
      return { fingerprint: { providerId, model: decision.model }, runtimeOptions: options, allowedModels, decisionConfig,
        route: "auto", rationale: decision.rationale, selection: null, ...(utility ? { decision: utility } : {}) };
    });
  };
}

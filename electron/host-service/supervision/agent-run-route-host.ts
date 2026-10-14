/**
 * Routes the turns the host starts for an agent run, with the host's real
 * reads: the task's runtime and prompt draft, its recent messages, the synced
 * Stave Auto settings, and utility inference in process as the classifier.
 *
 * Used by: `electron/host-service/supervision/agent-run-host.ts`.
 */
import type { AgentConfig } from "../../../src/lib/agents/schema";
import { DEFAULT_ROUTING_DECISION } from "../../../src/lib/providers/routing-decision";
import type { AgentRun } from "../../../src/lib/agent-runs/domain";
import {
  createAgentRouteClassifier,
  routeAgentRunTurn,
  toRoutingHistory,
  type AgentRouteSettings,
} from "../../../src/lib/routing/agent-run-route";
import type { RouteClassificationRequest } from "../../../src/lib/providers/utility-inference";
import type { ProviderId } from "../../../src/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "../../../src/types/chat";
import type { AgentRunTurnRoute } from "./agent-run-runtime";

/** Enough history for the classifier's continuity read; it keeps the last six. */
const ROUTE_HISTORY_LIMIT = 12;

export interface AgentRunRouteHostDeps {
  readTask: (args: { workspaceId: string; taskId: string }) => Promise<{ providerId: ProviderId | null; model: string | null }>;
  readDraft: (args: { workspaceId: string; taskId: string }) => PromptDraftRuntimeOverrides | null | undefined;
  readMessages: (args: { workspaceId: string; taskId: string; limit: number }) => readonly unknown[];
  readSettings: () => AgentRouteSettings | null;
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  classify: (request: RouteClassificationRequest, signal?: AbortSignal) => Promise<{ ok: boolean; classification?: unknown }>;
  exclusiveModels?: () => Partial<Record<ProviderId, readonly string[]>>;
}

export function createAgentRunRouter(deps: AgentRunRouteHostDeps) {
  return async (args: { agentRun: AgentRun; prompt: string; agent: AgentConfig | null; signal?: AbortSignal; draftOverride?: PromptDraftRuntimeOverrides }): Promise<AgentRunTurnRoute | null> => {
    const ids = { workspaceId: args.agentRun.workspaceId, taskId: args.agentRun.leadTaskId };
    const task = await deps.readTask(ids);
    if ((task.providerId !== "claude-code" && task.providerId !== "codex") || !task.model) return null;
    const providerId = task.providerId;
    const settings = deps.readSettings();
    const context = settings?.classifier?.[providerId];
    const cwd = context ? await deps.resolveWorkspacePath(ids.workspaceId) : null;
    let decision: import("../../../src/lib/providers/utility-inference").UtilityInferenceMetadata | undefined;
    const route = await routeAgentRunTurn({
      agent: args.agent,
      signal: args.signal,
      draft: args.draftOverride ?? deps.readDraft(ids),
      current: { providerId, model: task.model },
      settings,
      exclusiveModelsByProvider: deps.exclusiveModels?.(),
      prompt: args.prompt,
      history: toRoutingHistory(deps.readMessages({ ...ids, limit: ROUTE_HISTORY_LIMIT })),
      ...(context
        ? {
            classifyRoute: createAgentRouteClassifier({
              context: { ...context, routingDecision: (args.agent?.model.mode === "auto" ? args.agent.model.decision : undefined) ?? context.routingDecision ?? DEFAULT_ROUTING_DECISION, activeProviderId: providerId, ...(cwd ? { cwd } : {}) },
              classify: async (request, signal) => { const result = await deps.classify(request, signal); decision = (result as { utility?: typeof decision }).utility; return result; },
            }),
          }
        : {}),
    });
    // Agent runs run on Claude and Codex; any other route keeps the task's own runtime.
    if (route.providerId !== "claude-code" && route.providerId !== "codex") return null;
    return {
      ...(decision ? { decision } : {}),
      fingerprint: { providerId: route.providerId, model: route.model },
      runtimeOptions: route.runtimeOptions,
      route: route.route,
      rationale: route.rationale,
      selection: route.selection,
    };
  };
}

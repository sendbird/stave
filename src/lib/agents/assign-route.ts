import {
  buildRoleSignals,
  resolveRoute,
  TASK_CLASS_LABELS,
  type AutoRoutingProfile,
} from "@/lib/providers/auto-routing-profile";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AgentConfig } from "./schema";

/**
 * Where an assignment runs.
 *
 * - A fixed agent model wins, with its effort.
 * - An explicit provider pick on the assign surface runs the user's model for
 *   that provider and is never re-routed.
 * - An auto agent with Stave Auto on routes like any Auto task: the first turn
 *   and every later one are routed when they are sent, with the classifier,
 *   usage and the agent's task class. Nothing is pinned up front.
 * - An auto agent with Stave Auto off gets one route from the user's rules for
 *   the agent's task class, pinned for the task; when routing fails the
 *   preferred provider runs with its default model.
 */
export interface AssignRoute {
  providerId: ProviderId;
  /** Null for the user's model for the provider, and for Stave Auto (chosen per turn). */
  model: string | null;
  /** The effort the route or the agent asks for; absent for the user's setting. */
  effort?: string;
  /** Shown under the provider picker: why this provider and model. */
  reason: string;
  source: "agent" | "stave-auto" | "auto-routing" | "picked" | "fallback";
}

export function resolveAssignRoute(args: {
  agent: AgentConfig;
  profile: AutoRoutingProfile | null;
  preferredProviderId: ProviderId;
  choice: "auto" | ProviderId;
  /** Settings → Stave Auto. On, an auto agent routes every turn. */
  autoRoutingEnabled?: boolean;
  runtimeModelsByProvider?: Partial<Record<ProviderId, readonly string[]>>;
}): AssignRoute {
  const { agent } = args;
  if (agent.model.mode === "fixed") {
    return {
      providerId: agent.model.providerId,
      model: agent.model.model ?? null,
      ...(agent.model.effort ? { effort: agent.model.effort } : {}),
      reason: "Set by the agent.",
      source: "agent",
    };
  }
  if (args.choice !== "auto") {
    return { providerId: args.choice, model: null, reason: "Runs your default model for this provider.", source: "picked" };
  }
  const taskClass = agent.model.taskClass;
  if (args.autoRoutingEnabled) {
    return {
      providerId: args.preferredProviderId,
      model: null,
      reason: taskClass
        ? `Stave Auto picks the model for each turn, routed as ${TASK_CLASS_LABELS[taskClass]} work.`
        : "Stave Auto picks the model for each turn.",
      source: "stave-auto",
    };
  }
  if (args.profile) {
    try {
      const route = resolveRoute({
        profile: args.profile,
        role: "primary",
        signals: {
          ...buildRoleSignals({ currentProviderId: args.preferredProviderId, taskClass }),
          newTask: true,
        },
        runtimeModelsByProvider: args.runtimeModelsByProvider,
      });
      return {
        providerId: route.providerId,
        model: route.model,
        ...(route.effort ? { effort: route.effort } : {}),
        reason: `Stave Auto is off, so your routing rules chose this once for the task. ${route.reason}`.trim(),
        source: "auto-routing",
      };
    } catch (error) {
      console.warn("[agents] auto-routing failed for an assignment", error);
    }
  }
  return {
    providerId: args.preferredProviderId,
    model: null,
    reason: "Auto-routing is unavailable; your default model for this provider runs.",
    source: "fallback",
  };
}

/** The model part of "Agent settings: Claude · … · …" on the assign surfaces. */
export function describeAssignRouteModel(route: AssignRoute): string {
  if (route.source === "stave-auto") return "Stave Auto, each turn";
  const model = route.model ?? "your default model";
  return route.effort ? `${model} · ${route.effort}` : model;
}

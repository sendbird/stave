import {
  buildRoleSignals,
  resolveRoute,
  type AutoRoutingProfile,
} from "@/lib/providers/auto-routing-profile";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AgentConfig } from "./schema";

/**
 * Where an assignment runs. A fixed agent model wins. An auto agent follows
 * the user's auto-routing rules as a primary route for the agent's task class,
 * starting from the provider the user prefers; when routing fails the
 * preferred provider runs with its default model.
 *
 * `choice` is "auto" unless the user picked a provider on the assign panel,
 * which then runs with its default model: an explicit pick is never re-routed.
 */
export interface AssignRoute {
  providerId: ProviderId;
  model: string | null;
  /** Shown under the provider picker: why this provider and model. */
  reason: string;
  source: "agent" | "auto-routing" | "picked" | "fallback";
}

export function resolveAssignRoute(args: {
  agent: AgentConfig;
  profile: AutoRoutingProfile | null;
  preferredProviderId: ProviderId;
  choice: "auto" | ProviderId;
  runtimeModelsByProvider?: Partial<Record<ProviderId, readonly string[]>>;
}): AssignRoute {
  const { agent } = args;
  if (agent.model.mode === "fixed") {
    return {
      providerId: agent.model.providerId,
      model: agent.model.model ?? null,
      reason: "Set by the agent.",
      source: "agent",
    };
  }
  if (args.choice !== "auto") {
    return { providerId: args.choice, model: null, reason: "Provider default model.", source: "picked" };
  }
  if (args.profile) {
    try {
      const route = resolveRoute({
        profile: args.profile,
        role: "primary",
        signals: {
          ...buildRoleSignals({ currentProviderId: args.preferredProviderId, taskClass: agent.model.taskClass }),
          newTask: true,
        },
        runtimeModelsByProvider: args.runtimeModelsByProvider,
      });
      return { providerId: route.providerId, model: route.model, reason: route.reason, source: "auto-routing" };
    } catch (error) {
      console.warn("[agents] auto-routing failed for an assignment", error);
    }
  }
  return {
    providerId: args.preferredProviderId,
    model: null,
    reason: "Auto-routing is unavailable; provider default model.",
    source: "fallback",
  };
}

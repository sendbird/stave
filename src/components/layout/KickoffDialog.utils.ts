import type { ProviderId } from "@/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";
import { listAgents } from "@/lib/agents/library";
import { isUsableAs, type AgentConfig } from "@/lib/agents/schema";
import { resolveAssignRoute, type AssignRoute } from "@/lib/agents/assign-route";
import type { AutoRoutingProfile } from "@/lib/providers/auto-routing-profile";

/** Who does the work: the user, or a saved agent as the task's main agent. */
export type KickoffWho = "me" | "agent";

/**
 * Agents Kickoff can hand work to: usable as a main agent and not archived.
 * Custom agents come first, then built-ins (the library already orders them).
 */
export function selectableKickoffAgents(custom: readonly AgentConfig[]): AgentConfig[] {
  return listAgents({ custom, activeOnly: true }).filter((agent) => isUsableAs(agent, "primary"));
}

/**
 * The provider and model an agent's first task runs with, and whether the
 * Runs-on override is fixed by the agent. `choice` is "auto" unless the user
 * picked a provider on the override, which then runs with its default model.
 */
export function resolveKickoffAgentRoute(args: {
  agent: AgentConfig;
  profile: AutoRoutingProfile | null;
  preferredProviderId: ProviderId;
  choice: "auto" | ProviderId;
}): AssignRoute {
  return resolveAssignRoute({
    agent: args.agent,
    profile: args.profile,
    preferredProviderId: args.preferredProviderId,
    choice: args.choice,
  });
}


export function canApplyKickoffDialogOpenChange(args: {
  open: boolean;
  busy: boolean;
}) {
  return args.open || !args.busy;
}

/**
 * Seed for the first-task model control.
 *
 * Kickoff can only start Claude or Codex. A Cursor or Kiro draft was still
 * paired with the Codex model, so an ineligible draft keeps that model and
 * takes the Codex provider. Leaving the draft provider in place showed a
 * Codex name with the draft provider's icon, and created the task on that
 * provider.
 */
export function resolveKickoffFirstTaskSelection(args: {
  draftProvider: ProviderId;
  eligibleProviderIds: readonly ProviderId[];
  modelClaude: string;
  modelCodex: string;
}): { providerId: ProviderId; model: string } {
  const providerId = args.eligibleProviderIds.includes(args.draftProvider)
    ? args.draftProvider
    : args.eligibleProviderIds.includes("codex")
      ? "codex"
      : (args.eligibleProviderIds[0] ?? "claude-code");
  return {
    providerId,
    model: providerId === "claude-code" ? args.modelClaude : args.modelCodex,
  };
}

/**
 * Why the first-task control is not the draft provider.
 * Eligible drafts need no explanation. An ineligible one (Cursor, Kiro) is
 * replaced before the dialog opens, so the hint names both sides.
 */
export function describeKickoffProviderFallback(args: {
  draftProvider: ProviderId;
  eligibleProviderIds: readonly ProviderId[];
  draftLabel: string;
  fallbackLabel: string;
}): string | null {
  if (args.eligibleProviderIds.includes(args.draftProvider)) {
    return null;
  }
  return `${args.draftLabel} can't start the first task, so this opens on your ${args.fallbackLabel} model.`;
}

export function buildKickoffFirstTaskRuntimeOverrides(args: {
  providerId: ProviderId;
  model: string;
  effort: NonNullable<
    | PromptDraftRuntimeOverrides["claudeEffort"]
    | PromptDraftRuntimeOverrides["codexReasoningEffort"]
  >;
  codexFastMode: boolean;
}): PromptDraftRuntimeOverrides {
  return {
    autoRouting: false,
    model: args.model,
    ...(args.providerId === "claude-code"
      ? {
          claudeEffort: args.effort as NonNullable<
            PromptDraftRuntimeOverrides["claudeEffort"]
          >,
        }
      : {
          codexReasoningEffort: args.effort as NonNullable<
            PromptDraftRuntimeOverrides["codexReasoningEffort"]
          >,
          codexFastMode: args.codexFastMode,
        }),
  };
}

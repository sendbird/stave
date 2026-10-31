import { helperKeepsParentProvider, type AdaptiveRunPolicy, type AgentResourceSnapshot } from "../../../src/lib/agent-runs/resources";
import type { ProviderUsageSummary, TeamProviderId } from "./provider-usage-context";

/** What a run's turn reads about its team limits, beside the stage context. Model-facing, so not localized. */
export function teamLimitsContextPart(policy: AdaptiveRunPolicy, budget: AgentResourceSnapshot | null, turnKey: string,
  providerUsage?: Record<TeamProviderId, ProviderUsageSummary>) {
  const limits = budget ? { teamTurns: budget.teamTurns, spent: budget.spent, reservedForHelpers: budget.reserved, remaining: budget.remaining,
    helpersWorking: budget.activeHelpers, helpersStarted: budget.helpersLaunched } : { teamTurns: policy.teamTurns };
  const helpersCrossProviders = !helperKeepsParentProvider(policy);
  return { type: "retrieved_context" as const, sourceId: "stave:team-limits", title: "Run team limits",
    content: JSON.stringify({ limits, helperLimits: { atOnce: policy.concurrentHelpers, total: policy.totalHelpers },
      provider: policy.providerId, modelPinned: policy.modelLocked, effortPinned: policy.effortLocked, allowedModels: policy.allowedModels,
      ...(providerUsage ? { providerUsage } : {}),
      currentTurnKey: turnKey,
      instruction: "Complete and verify this stage within the shared turn budget. A supervised saved-Agent helper holds its first turns and draws later turns from it as it works, up to its own max turns, always leaving one turn for the parent run to integrate; one-turn and detached helpers and the user's replies in the parent run do not draw on it, while replies to a helper do. "
        + (helpersCrossProviders ? "A helper Agent may run on its own provider. " : "Helpers stay on this run's provider. ")
        + (providerUsage
          ? "providerUsage is each provider's account usage at Stave's last reading; the user's other tasks share these accounts. Unknown means no recent reading, not headroom. "
            + (helpersCrossProviders
              ? "Start no new helper work on an exhausted provider or model. While a provider is low, send new parallel work to the other one; at critical, leave the rest to the user's other tasks and only finish work already running there unless no other provider can do it. "
              : "")
          : "")
        + "Read stave_get_agent_run for linked stage turn ids. If another same-provider model or effort is justified by these turns, propose it with stave_request_agent_resources for the next turn. When the user explicitly asks for a model or effort, propose it at once with reason user-request, citing the turn where they asked. Permissions and pinned settings do not change. Environment/permission failures are blockers, not capability escalation evidence." }) };
}

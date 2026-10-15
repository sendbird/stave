import { clampTeamLimit } from "@/lib/agent-runs/resources";
import { getDefaultModelForProvider } from "@/lib/providers/model-catalog";
import type {
  AgentRouteClassifierContext,
  AgentRouteSettingsInput,
} from "@/lib/routing/agent-run-route";
import type { AppSettings } from "@/store/app-settings";
import { buildUtilityInferenceContext } from "@/store/provider-runtime-options";

const CLASSIFIED_PROVIDERS = ["claude-code", "codex"] as const;

/**
 * The host's copy of the user's Stave Auto settings, for the turns it starts
 * for an agent run (`src/lib/routing/agent-run-route.ts`). Synced with the
 * agents by `useAgentSync`. The classifier context is what the composer's
 * classifier would use on each provider, minus the workspace folder, and is
 * null whenever the composer would not classify either. The helper limits are
 * what a starting Agent run freezes as its team limits.
 */
export function buildAgentRouteSettings(settings: AppSettings): AgentRouteSettingsInput {
  const classifies =
    settings.autoRoutingEnabled &&
    settings.autoRoutingProfile.signals.classifier;
  const contextFor = (providerId: (typeof CLASSIFIED_PROVIDERS)[number]): AgentRouteClassifierContext => {
    const context = buildUtilityInferenceContext({
      provider: providerId,
      model: getDefaultModelForProvider({ providerId }),
      settings,
    });
    const options = context.runtimeOptions;
    return {
      routingDecision: settings.routingDecision,
      ...(context.utilityProviderId ? { utilityProviderId: context.utilityProviderId } : {}),
      ...(context.utilityModel ? { utilityModel: context.utilityModel } : {}),
      ...(context.utilityMaxProviderAttempts ? { utilityMaxProviderAttempts: context.utilityMaxProviderAttempts } : {}),
      // Only installation paths cross into classification, as in the composer.
      runtimeOptions: {
        ...(options?.claudeBinaryPath ? { claudeBinaryPath: options.claudeBinaryPath } : {}),
        ...(options?.codexBinaryPath ? { codexBinaryPath: options.codexBinaryPath } : {}),
      },
    };
  };
  return {
    routing: {
      autoRoutingEnabled: settings.autoRoutingEnabled,
      autoRoutingProfile: settings.autoRoutingProfile,
    },
    classifier: classifies ? { "claude-code": contextFor("claude-code"), codex: contextFor("codex") } : null,
    teamLimits: {
      concurrentHelpers: clampTeamLimit("concurrentHelpers", settings.agentRunConcurrentHelpers),
      totalHelpers: clampTeamLimit("totalHelpers", settings.agentRunTotalHelpers),
    },
  };
}

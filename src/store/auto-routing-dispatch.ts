import { resolveAdvisorAutoTarget } from "@/lib/providers/advisor";
import type {
  AutoRoutingModelResolution,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  resolveRoutedWorkerModel,
  WORKER_AUTO_VALUE,
} from "@/lib/providers/worker-mode";
import type { AppState } from "@/store/app-store.types";
import {
  computeRouterSignals,
  resolveAutoRoutingDecision,
  resolveBudgetUsedPercentByProvider,
  type AutoRoutingDecision,
} from "@/store/auto-routing";
import { buildUtilityInferenceContext } from "@/store/provider-runtime-options";
import { createUtilityRouteClassifier } from "@/store/utility-inference-runtime";
import type { ChatMessage, PromptDraft } from "@/types/chat";

type RoutingState = Pick<
  AppState,
  "settings" | "rateLimitsSnapshot" | "providerAvailability"
>;

export function isAutoRoutingUnavailableForSend(args: {
  promptDraft: PromptDraft;
  autoRoutingEnabled: boolean;
  steeringActiveTurn: boolean;
}) {
  return (
    args.promptDraft.runtimeOverrides?.autoRouting === true &&
    !args.autoRoutingEnabled &&
    !args.steeringActiveTurn
  );
}

/**
 * The composer's Auto decision for one send. Pure apart from the optional
 * classifier call; the store applies the returned provider/model and records
 * the decision itself.
 */
export async function resolveAutoRoutingForSend(args: {
  state: RoutingState;
  promptDraft: PromptDraft;
  provider: ProviderId;
  activeModel: string;
  prompt: string;
  history: readonly ChatMessage[];
  fileContextCount: number;
  workspaceCwd: string | undefined;
}): Promise<AutoRoutingDecision | null> {
  const { state, promptDraft } = args;
  if (
    !state.settings.autoRoutingEnabled ||
    promptDraft.runtimeOverrides?.autoRouting !== true
  ) {
    return null;
  }
  const classifyRoute = state.settings.autoRoutingUseClassifier
    ? createUtilityRouteClassifier({
        context: buildUtilityInferenceContext({
          cwd: args.workspaceCwd,
          provider: args.provider,
          model: args.activeModel,
          settings: state.settings,
        }),
      })
    : undefined;
  return resolveAutoRoutingDecision({
    settings: {
      autoRoutingEnabled: state.settings.autoRoutingEnabled,
      autoRoutingUseClassifier: state.settings.autoRoutingUseClassifier,
      autoRoutingObjective: state.settings.autoRoutingObjective,
      autoRoutingSafetyEscalation: state.settings.autoRoutingSafetyEscalation,
      autoRoutingAllowProviderSwitch:
        state.settings.autoRoutingAllowProviderSwitch,
      autoRoutingEligibleClaudeModels:
        state.settings.autoRoutingEligibleClaudeModels,
      autoRoutingEligibleCodexModels:
        state.settings.autoRoutingEligibleCodexModels,
      autoRoutingProfile: state.settings.autoRoutingProfile,
    },
    runtimeOverrides: promptDraft.runtimeOverrides,
    currentProviderId: args.provider,
    currentModel: args.activeModel,
    prompt: args.prompt,
    history: args.history.map((message) => ({
      role: message.role,
      content: message.content,
      providerId:
        message.providerId === "claude-code" || message.providerId === "codex"
          ? message.providerId
          : undefined,
      model: message.model,
    })),
    fileContextCount: args.fileContextCount,
    phase:
      promptDraft.runtimeOverrides?.autoRoutingPlanMode === true
        ? "plan"
        : "execute",
    rateLimitsSnapshot: state.rateLimitsSnapshot,
    providerAvailability: state.providerAvailability,
    classifyRoute,
  });
}

/**
 * Advisor and Worker picks left on `auto` resolve through the same role table
 * before the runtime options are built, so the runtime only ever sees concrete
 * models. Returns the draft overrides unchanged when nothing was routed.
 */
export function resolveDelegatedRuntimeOverrides(args: {
  state: RoutingState;
  overrides: PromptDraft["runtimeOverrides"];
  provider: ProviderId;
  activeModel: string;
  prompt: string;
  fileContextCount: number;
}): PromptDraft["runtimeOverrides"] {
  const { state, overrides, provider } = args;
  const budgetUsedPercentByProvider = resolveBudgetUsedPercentByProvider(
    state.rateLimitsSnapshot,
  );
  const advisorTarget = resolveAdvisorAutoTarget({
    target: overrides?.advisorTarget ?? state.settings.advisorTarget,
    profile: state.settings.autoRoutingProfile,
    primaryProviderId: provider,
    primaryModel: args.activeModel,
    budgetUsedPercent: budgetUsedPercentByProvider[provider],
    providerAvailability: state.providerAvailability,
    signals: computeRouterSignals({
      prompt: args.prompt,
      fileContextCount: args.fileContextCount,
      history: [],
      currentProviderId: provider,
      currentModel: args.activeModel,
      profile: state.settings.autoRoutingProfile,
      phase:
        overrides?.claudePermissionMode === "plan" || overrides?.codexPlanMode
          ? "plan"
          : "execute",
      rateLimitsSnapshot: state.rateLimitsSnapshot,
      providerAvailability: state.providerAvailability,
    }).signals,
  });
  const workerConfig =
    overrides?.workerConfigByProvider?.[provider] ??
    state.settings.workerConfigByProvider?.[provider];
  const routedWorker =
    (workerConfig?.model ?? WORKER_AUTO_VALUE) === WORKER_AUTO_VALUE
      ? resolveRoutedWorkerModel({
          profile: state.settings.autoRoutingProfile,
          providerId: provider,
          primaryModel: args.activeModel,
          budgetUsedPercent: budgetUsedPercentByProvider[provider],
        })
      : null;
  const needsAdvisor =
    advisorTarget !== null &&
    advisorTarget !== (overrides?.advisorTarget ?? state.settings.advisorTarget);
  if (!needsAdvisor && !routedWorker) {
    return overrides;
  }
  return {
    ...(overrides ?? {}),
    ...(needsAdvisor ? { advisorTarget } : {}),
    ...(routedWorker
      ? {
          workerConfigByProvider: {
            ...(overrides?.workerConfigByProvider ?? {}),
            [provider]: {
              ...(workerConfig ?? {}),
              model: routedWorker.model,
              ...(routedWorker.effort &&
              (workerConfig?.effort ?? WORKER_AUTO_VALUE) === WORKER_AUTO_VALUE
                ? { effort: routedWorker.effort }
                : {}),
            },
          },
        }
      : {}),
  };
}

/** The `model_resolved` payload a routed (non-manual) decision records on the turn. */
export function buildAutoRoutingModelResolution(args: {
  decision: AutoRoutingDecision;
  provider: ProviderId;
  model: string;
}): AutoRoutingModelResolution | null {
  const { decision } = args;
  if (decision.source === "disabled" || decision.source === "manual") {
    return null;
  }
  return {
    selectedProviderId: args.provider,
    selectedModel: args.model,
    source: decision.source,
    rationale: decision.rationale,
    confidence: decision.confidence,
    taskType: decision.taskType,
    ...(decision.ruleId ? { ruleId: decision.ruleId } : {}),
    ...(decision.ruleReason ? { ruleReason: decision.ruleReason } : {}),
    taskClass: decision.taskClass,
    stance: decision.stance,
  };
}

import { resolveAdvisorAutoTarget } from "@/lib/providers/advisor";
import {
  formatResolvedRouteLabel,
  type TaskClass,
} from "@/lib/providers/auto-routing-profile";
import type {
  AutoRoutingModelResolution,
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  resolveRoutedWorkerModel,
  WORKER_AUTO_VALUE,
} from "@/lib/providers/worker-mode";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import type { AppState } from "@/store/app-store.types";
import {
  computeRouterSignals,
  resolveAutoRoutingDecision,
  resolveBudgetUsedPercentByProvider,
  resolveRoutingProviderAvailability,
  type AutoRoutingDecision,
} from "@/store/auto-routing";
import { buildOutgoingUserMessage } from "@/store/chat-state-helpers";
import {
  beginPendingAutoRoute,
  endPendingAutoRoute,
  updatePendingAutoRoute,
} from "@/store/pending-auto-routing-store";
import { buildUtilityInferenceContext } from "@/store/provider-runtime-options";
import { createUtilityRouteClassifier } from "@/store/utility-inference-runtime";
import type { ChatMessage, PromptDraft } from "@/types/chat";

type RoutingState = Pick<
  AppState,
  "settings" | "rateLimitsSnapshot" | "providerAvailability"
>;

interface PendingAutoRouteControl {
  /** Cancels the whole send; the draft goes back to the composer. */
  send: AbortController;
  /** Ends only the classifier wait; the send continues on local rules. */
  classifier: AbortController;
}

const pendingAutoRoutes = new Map<string, PendingAutoRouteControl>();

export function cancelPendingAutoRouting(taskId: string): boolean {
  const pending = pendingAutoRoutes.get(taskId);
  if (!pending) return false;
  pending.send.abort();
  return true;
}

/**
 * Stops waiting on the classifier for a pending send and lets it start on the
 * local rules. Returns false when nothing is waiting, or the wait already ended.
 */
export function skipPendingAutoRoutingClassifier(taskId: string): boolean {
  const pending = pendingAutoRoutes.get(taskId);
  if (
    !pending ||
    pending.send.signal.aborted ||
    pending.classifier.signal.aborted
  ) {
    return false;
  }
  pending.classifier.abort();
  return true;
}

/**
 * True when this send will wait on the utility classifier before its turn can
 * start, which is the only Auto path slow enough to need a pending state.
 */
export function shouldClassifyAutoRoute(args: {
  settings: RoutingState["settings"];
  promptDraft: PromptDraft;
}): boolean {
  const overrides = args.promptDraft.runtimeOverrides;
  return (
    args.settings.autoRoutingEnabled &&
    overrides?.autoRouting === true &&
    !overrides.model?.trim() &&
    args.settings.autoRoutingProfile.signals.classifier &&
    args.settings.auxiliaryInferencePolicy.utility.enabled
  );
}

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
  taskId?: string;
  /**
   * Draws this send's prompt as a pending transcript row while the classifier
   * runs (see `PendingAutoRoute`). A cancelled or failed route ends the row
   * here; a resolved one hands it to the caller, which ends it with
   * `endPendingAutoRoute({ taskId, id: turnId })` when the turn's own row
   * lands or the send gives up.
   */
  pendingRow?: {
    turnId: string;
    message: Omit<Parameters<typeof buildOutgoingUserMessage>[0], "id">;
  };
  /**
   * The task class to route as. Defaults to that of the agent the task runs
   * as (when it names one); a task about to be created passes its agent's.
   */
  taskClassHint?: TaskClass;
}): Promise<AutoRoutingDecision | null> {
  const { state, promptDraft } = args;
  const taskClassHint =
    args.taskClassHint ??
    (args.taskId ? useAgentAssignmentsStore.getState().byTaskId[args.taskId]?.agentTaskClass : null) ??
    undefined;
  if (
    !state.settings.autoRoutingEnabled ||
    promptDraft.runtimeOverrides?.autoRouting !== true
  ) {
    return null;
  }
  const classifyRoute = shouldClassifyAutoRoute({ settings: state.settings, promptDraft })
    ? createUtilityRouteClassifier({
        cacheScope: `${args.workspaceCwd ?? ""}:${args.taskId ?? ""}`,
        context: buildUtilityInferenceContext({
          cwd: args.workspaceCwd,
          provider: args.provider,
          model: args.activeModel,
          settings: state.settings,
        }),
      })
    : undefined;
  const controller = new AbortController();
  const classifierController = new AbortController();
  if (args.taskId) {
    if (pendingAutoRoutes.has(args.taskId)) throw new DOMException("Auto routing is already pending", "AbortError");
    pendingAutoRoutes.set(args.taskId, {
      send: controller,
      classifier: classifierController,
    });
  }
  // Only a classifier wait is slow enough to need the row.
  const pendingRow =
    classifyRoute && args.taskId && args.pendingRow
      ? { taskId: args.taskId, id: args.pendingRow.turnId }
      : null;
  const ownsPendingRow =
    pendingRow !== null &&
    args.pendingRow !== undefined &&
    beginPendingAutoRoute({
      ...pendingRow,
      startedAt: Date.now(),
      userMessage: buildOutgoingUserMessage({
        ...args.pendingRow.message,
        id: `pending-auto-route:${pendingRow.id}`,
      }),
    });
  const classifierStartedAt = Date.now();
  try {
    const decision = await resolveAutoRoutingDecision({
      signal: controller.signal,
      classifierSignal: classifierController.signal,
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
      ...(taskClassHint ? { taskClassHint } : {}),
    });
    if (controller.signal.aborted) throw new DOMException("Auto routing cancelled", "AbortError");
    if (ownsPendingRow) {
      updatePendingAutoRoute({
        ...pendingRow,
        patch: {
          phase: "starting",
          routedLabel: formatResolvedRouteLabel({
            model: decision.model,
            effort: decision.claudeEffort ?? decision.codexReasoningEffort,
          }),
        },
      });
    }
    // A fallback is reported on the turn's route line rather than as a
    // notification, next to the model it produced.
    return classifyRoute &&
      (decision.source === "classifier" ||
        decision.source === "classifier_fallback")
      ? { ...decision, classifierElapsedMs: Date.now() - classifierStartedAt }
      : decision;
  } catch (error) {
    if (ownsPendingRow) endPendingAutoRoute(pendingRow);
    throw error;
  } finally {
    if (args.taskId && pendingAutoRoutes.get(args.taskId)?.send === controller) pendingAutoRoutes.delete(args.taskId);
  }
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
  // An advisor consult runs a real turn, so it has to respect the same
  // usage-exhaustion failover the primary route uses.
  const routingAvailability =
    resolveRoutingProviderAvailability({
      profile: state.settings.autoRoutingProfile,
      providerAvailability: state.providerAvailability,
      rateLimitsSnapshot: state.rateLimitsSnapshot,
    }) ?? state.providerAvailability;
  const advisorTarget = resolveAdvisorAutoTarget({
    target: overrides?.advisorTarget ?? state.settings.advisorTarget,
    profile: state.settings.autoRoutingProfile,
    primaryProviderId: provider,
    primaryModel: args.activeModel,
    budgetUsedPercent: budgetUsedPercentByProvider[provider],
    providerAvailability: routingAvailability,
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

/** The `model_resolved` event a routed send records first on its turn; null when nothing was routed. */
export function buildAutoRoutingModelResolvedEvent(args: {
  decision: AutoRoutingDecision | null;
  provider: ProviderId;
  model: string;
}): Extract<NormalizedProviderEvent, { type: "model_resolved" }> | null {
  if (!args.decision || args.decision.source === "disabled") {
    return null;
  }
  const modelResolution = buildAutoRoutingModelResolution({
    decision: args.decision,
    provider: args.provider,
    model: args.model,
  });
  return {
    type: "model_resolved",
    resolvedProviderId: args.provider,
    resolvedModel: args.model,
    ...(modelResolution ? { modelResolution } : {}),
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
    ...(decision.classifierElapsedMs !== undefined
      ? {
          classifierElapsedMs: Math.min(
            600_000,
            Math.max(0, Math.round(decision.classifierElapsedMs)),
          ),
        }
      : {}),
  };
}

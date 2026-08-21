import type {
  ClaudePermissionMode,
  ClaudePermissionModeBeforePlan,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";
import { inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { WorkerProviderConfig } from "@/lib/providers/worker-mode";

export interface ResolvedPromptDraftRuntimeState {
  claudePermissionMode: ClaudePermissionMode;
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  claudeEffort?: PromptDraftRuntimeOverrides["claudeEffort"];
  codexPlanMode: boolean;
  codexReasoningEffort?: PromptDraftRuntimeOverrides["codexReasoningEffort"];
  boundSecretIds?: string[];
}

export function resolvePromptDraftRuntimeState(args: {
  promptDraft?: { runtimeOverrides?: PromptDraftRuntimeOverrides } | null;
  fallback: ResolvedPromptDraftRuntimeState;
}): ResolvedPromptDraftRuntimeState {
  const runtimeOverrides = args.promptDraft?.runtimeOverrides;
  return {
    claudePermissionMode:
      runtimeOverrides?.claudePermissionMode ??
      args.fallback.claudePermissionMode,
    claudePermissionModeBeforePlan:
      runtimeOverrides?.claudePermissionModeBeforePlan ??
      args.fallback.claudePermissionModeBeforePlan,
    claudeEffort: runtimeOverrides?.claudeEffort ?? args.fallback.claudeEffort,
    codexPlanMode:
      runtimeOverrides?.codexPlanMode ?? args.fallback.codexPlanMode,
    codexReasoningEffort:
      runtimeOverrides?.codexReasoningEffort ??
      args.fallback.codexReasoningEffort,
    boundSecretIds:
      runtimeOverrides?.boundSecretIds ?? args.fallback.boundSecretIds,
  };
}

export function resolvePromptDraftModelForProvider(args: {
  providerId: ProviderId;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  fallbackModel: string;
}) {
  const overrideModel = args.runtimeOverrides?.model?.trim();
  if (!overrideModel) {
    return args.fallbackModel;
  }

  const overrideProviderId = inferProviderIdFromModel({ model: overrideModel });
  return overrideProviderId === args.providerId
    ? overrideModel
    : args.fallbackModel;
}

/**
 * Resolve the model a turn should run on. A queued turn's stored model (its
 * queue-time selection) wins over the composer's current override; both go
 * through the same provider-mismatch guard, so a model that does not belong
 * to `providerId` falls back to that provider's settings model instead of
 * being sent cross-provider.
 */
export function resolveTurnModelForSend(args: {
  providerId: ProviderId;
  queuedTurnModel?: string;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  settings: { modelClaude: string; modelCodex: string };
}) {
  return resolvePromptDraftModelForProvider({
    providerId: args.providerId,
    runtimeOverrides: args.queuedTurnModel
      ? { model: args.queuedTurnModel }
      : args.runtimeOverrides,
    fallbackModel:
      args.providerId === "claude-code"
        ? args.settings.modelClaude
        : args.settings.modelCodex,
  });
}

export function transitionClaudePromptDraftPermissionMode(args: {
  nextMode: ClaudePermissionMode;
  currentMode: ClaudePermissionMode;
  beforePlan: ClaudePermissionModeBeforePlan;
}): PromptDraftRuntimeOverrides {
  const { nextMode, currentMode, beforePlan } = args;

  if (nextMode === currentMode) {
    return {
      claudePermissionMode: currentMode,
      claudePermissionModeBeforePlan: beforePlan,
    };
  }

  if (nextMode === "plan") {
    return {
      claudePermissionMode: "plan",
      claudePermissionModeBeforePlan:
        currentMode !== "plan" ? currentMode : beforePlan,
    };
  }

  if (currentMode === "plan") {
    return {
      claudePermissionMode: nextMode,
      claudePermissionModeBeforePlan: null,
    };
  }

  return {
    claudePermissionMode: nextMode,
    claudePermissionModeBeforePlan: beforePlan,
  };
}

export function resolvePromptDraftPlanModeChange(args: {
  providerId: ProviderId;
  enabled: boolean;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  claudePermissionMode: ClaudePermissionMode;
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  codexPlanMode: boolean;
  isTurnActive?: boolean;
  hasPlanResponse?: boolean;
}) {
  if (args.providerId === "codex") {
    const disablingCodexPlanMode = args.codexPlanMode && !args.enabled;
    return {
      runtimeOverrides: {
        ...args.runtimeOverrides,
        codexPlanMode: args.enabled,
      } satisfies PromptDraftRuntimeOverrides,
      shouldClearCodexSession: disablingCodexPlanMode,
      shouldAbortActiveTurn:
        disablingCodexPlanMode &&
        args.isTurnActive === true &&
        args.hasPlanResponse === true,
    };
  }

  if (args.providerId === "claude-code") {
    const nextMode: ClaudePermissionMode = args.enabled
      ? "plan"
      : (args.claudePermissionModeBeforePlan ?? "auto");
    return {
      runtimeOverrides: {
        ...args.runtimeOverrides,
        ...transitionClaudePromptDraftPermissionMode({
          nextMode,
          currentMode: args.claudePermissionMode,
          beforePlan: args.claudePermissionModeBeforePlan,
        }),
      },
      shouldClearCodexSession: false,
      shouldAbortActiveTurn: false,
    };
  }

  return {
    runtimeOverrides: args.runtimeOverrides,
    shouldClearCodexSession: false,
    shouldAbortActiveTurn: false,
  };
}

/**
 * Every field of the target must be compared. `updatePromptDraft` drops writes
 * this reports as unchanged, so an omitted field turns its composer control
 * into one that intermittently does nothing.
 */
function areAdvisorTargetsEqual(
  left?: PromptDraftRuntimeOverrides["advisorTarget"],
  right?: PromptDraftRuntimeOverrides["advisorTarget"],
) {
  return (
    left?.providerId === right?.providerId &&
    left?.model === right?.model &&
    left?.effort === right?.effort
  );
}

/**
 * Compared per provider for the same reason as the worker map: the composer
 * edits one provider's remembered pick at a time, and a reference check would
 * report that edit as unchanged, so the write would be dropped.
 */
function areAdvisorTargetsByProviderEqual(
  left?: PromptDraftRuntimeOverrides["advisorTargetByProvider"],
  right?: PromptDraftRuntimeOverrides["advisorTargetByProvider"],
) {
  if (left === right) {
    return true;
  }
  return (["claude-code", "codex"] as const).every(
    (providerId) =>
      left?.[providerId]?.model === right?.[providerId]?.model &&
      left?.[providerId]?.effort === right?.[providerId]?.effort,
  );
}

function areStringArraysEqual(left?: string[], right?: string[]) {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return (left?.length ?? 0) === 0 && (right?.length ?? 0) === 0;
  }
  return left.every((value, index) => value === right[index]);
}

function areWorkerProviderConfigsEqual(
  left?: WorkerProviderConfig,
  right?: WorkerProviderConfig,
) {
  return (
    left?.presetId === right?.presetId &&
    left?.model === right?.model &&
    left?.effort === right?.effort &&
    left?.description === right?.description &&
    left?.instructions === right?.instructions &&
    left?.maxTurns === right?.maxTurns &&
    areStringArraysEqual(left?.tools, right?.tools)
  );
}

/**
 * Compared per provider rather than by reference: the composer edits one
 * provider's entry at a time, and a reference check would report every such
 * edit as unchanged, making the Worker control silently do nothing.
 */
function areWorkerConfigsByProviderEqual(
  left?: PromptDraftRuntimeOverrides["workerConfigByProvider"],
  right?: PromptDraftRuntimeOverrides["workerConfigByProvider"],
) {
  if (left === right) {
    return true;
  }
  return (["claude-code", "codex"] as const).every((providerId) =>
    areWorkerProviderConfigsEqual(left?.[providerId], right?.[providerId]),
  );
}

export function arePromptDraftRuntimeOverridesEqual(
  left?: PromptDraftRuntimeOverrides,
  right?: PromptDraftRuntimeOverrides,
) {
  return (
    left?.model === right?.model &&
    left?.claudePermissionMode === right?.claudePermissionMode &&
    left?.claudePermissionModeBeforePlan ===
      right?.claudePermissionModeBeforePlan &&
    left?.claudeEffort === right?.claudeEffort &&
    left?.codexPlanMode === right?.codexPlanMode &&
    left?.codexReasoningEffort === right?.codexReasoningEffort &&
    left?.autoRouting === right?.autoRouting &&
    left?.advisorEnabled === right?.advisorEnabled &&
    areAdvisorTargetsEqual(left?.advisorTarget, right?.advisorTarget) &&
    areAdvisorTargetsByProviderEqual(
      left?.advisorTargetByProvider,
      right?.advisorTargetByProvider,
    ) &&
    left?.workerEnabled === right?.workerEnabled &&
    areWorkerConfigsByProviderEqual(
      left?.workerConfigByProvider,
      right?.workerConfigByProvider,
    ) &&
    areStringArraysEqual(left?.boundSecretIds, right?.boundSecretIds)
  );
}

import type {
  ClaudePermissionMode,
  ClaudePermissionModeBeforePlan,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";
import { inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface ResolvedPromptDraftRuntimeState {
  claudePermissionMode: ClaudePermissionMode;
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  codexPlanMode: boolean;
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
    codexPlanMode:
      runtimeOverrides?.codexPlanMode ?? args.fallback.codexPlanMode,
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

  if (args.providerId === "claude-code" || args.providerId === "stave") {
    const nextMode: ClaudePermissionMode = args.enabled
      ? "plan"
      : (args.claudePermissionModeBeforePlan ?? "auto");
    return {
      runtimeOverrides: transitionClaudePromptDraftPermissionMode({
        nextMode,
        currentMode: args.claudePermissionMode,
        beforePlan: args.claudePermissionModeBeforePlan,
      }),
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

export function arePromptDraftRuntimeOverridesEqual(
  left?: PromptDraftRuntimeOverrides,
  right?: PromptDraftRuntimeOverrides,
) {
  return (
    left?.model === right?.model &&
    left?.claudePermissionMode === right?.claudePermissionMode &&
    left?.claudePermissionModeBeforePlan ===
      right?.claudePermissionModeBeforePlan &&
    left?.codexPlanMode === right?.codexPlanMode
  );
}

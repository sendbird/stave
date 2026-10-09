import type {
  ClaudePermissionMode,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";
import { inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface ResolvedPromptDraftRuntimeState {
  claudeAccountProfileId?: string;
  codexAccountProfileId?: string;
  claudePermissionMode: ClaudePermissionMode;
  claudeEffort?: PromptDraftRuntimeOverrides["claudeEffort"];
  codexReasoningEffort?: PromptDraftRuntimeOverrides["codexReasoningEffort"];
  codexFastMode?: boolean;
  cursorMode: "agent" | "ask";
  cursorEffort?: PromptDraftRuntimeOverrides["cursorEffort"];
  cursorFastMode?: boolean;
  kiroEffort?: PromptDraftRuntimeOverrides["kiroEffort"];
  boundSecretIds?: string[];
}

export function resolvePromptDraftRuntimeState(args: {
  promptDraft?: { runtimeOverrides?: PromptDraftRuntimeOverrides } | null;
  fallback: Omit<ResolvedPromptDraftRuntimeState, "cursorMode"> & {
    cursorMode?: ResolvedPromptDraftRuntimeState["cursorMode"];
  };
}): ResolvedPromptDraftRuntimeState {
  const runtimeOverrides = args.promptDraft?.runtimeOverrides;
  return {
    claudeAccountProfileId: runtimeOverrides?.claudeAccountProfileId ?? args.fallback.claudeAccountProfileId,
    codexAccountProfileId: runtimeOverrides?.codexAccountProfileId ?? args.fallback.codexAccountProfileId,
    claudePermissionMode:
      runtimeOverrides?.claudePermissionMode ??
      args.fallback.claudePermissionMode,
    claudeEffort: runtimeOverrides?.claudeEffort ?? args.fallback.claudeEffort,
    codexReasoningEffort:
      runtimeOverrides?.codexReasoningEffort ??
      args.fallback.codexReasoningEffort,
    codexFastMode:
      runtimeOverrides?.codexFastMode ?? args.fallback.codexFastMode,
    cursorMode:
      runtimeOverrides?.cursorMode ?? args.fallback.cursorMode ?? "agent",
    cursorEffort: runtimeOverrides?.cursorEffort ?? args.fallback.cursorEffort,
    cursorFastMode:
      runtimeOverrides?.cursorFastMode ?? args.fallback.cursorFastMode,
    kiroEffort: runtimeOverrides?.kiroEffort ?? args.fallback.kiroEffort,
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

  const overrideProviderId =
    args.runtimeOverrides?.modelProviderId ??
    ((args.providerId === "cursor" || args.providerId === "kiro") &&
    overrideModel.toLowerCase() === "auto"
      ? args.providerId
      : inferProviderIdFromModel({ model: overrideModel }));
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
  settings: {
    modelClaude: string;
    modelCodex: string;
    modelCursor: string;
    modelKiro: string;
  };
}) {
  return resolvePromptDraftModelForProvider({
    providerId: args.providerId,
    runtimeOverrides: args.queuedTurnModel
      ? { model: args.queuedTurnModel, modelProviderId: args.providerId }
      : args.runtimeOverrides,
    fallbackModel: getConfiguredModelForProvider(args.providerId, args.settings),
  });
}

export function getConfiguredModelForProvider(
  providerId: ProviderId,
  settings: {
    modelClaude: string;
    modelCodex: string;
    modelCursor: string;
    modelKiro: string;
  },
) {
  return providerId === "claude-code"
    ? settings.modelClaude
    : providerId === "codex"
      ? settings.modelCodex
      : providerId === "cursor"
        ? settings.modelCursor
        : settings.modelKiro;
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

export function arePromptDraftRuntimeOverridesEqual(
  left?: PromptDraftRuntimeOverrides,
  right?: PromptDraftRuntimeOverrides,
) {
  return (
    left?.claudeAccountProfileId === right?.claudeAccountProfileId &&
    left?.codexAccountProfileId === right?.codexAccountProfileId &&
    left?.model === right?.model &&
    left?.modelProviderId === right?.modelProviderId &&
    left?.claudePermissionMode === right?.claudePermissionMode &&
    left?.claudeEffort === right?.claudeEffort &&
    left?.codexReasoningEffort === right?.codexReasoningEffort &&
    left?.codexFastMode === right?.codexFastMode &&
    left?.cursorMode === right?.cursorMode &&
    left?.cursorEffort === right?.cursorEffort &&
    left?.cursorFastMode === right?.cursorFastMode &&
    left?.kiroEffort === right?.kiroEffort &&
    left?.autoRouting === right?.autoRouting &&
    left?.agentRunAdaptive === right?.agentRunAdaptive &&
    areStringArraysEqual(left?.boundSecretIds, right?.boundSecretIds)
  );
}

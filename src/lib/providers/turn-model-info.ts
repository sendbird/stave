import { resolveCodexAppServerReasoningEffort } from "@/lib/providers/codex-runtime-options";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type { ChatMessage, TurnModelInfo } from "@/types/chat";

export function resolveTurnModelInfo(args: {
  providerId: ProviderId;
  runtimeOptions: ProviderRuntimeOptions;
}): TurnModelInfo | undefined {
  const requestedEffort =
    args.providerId === "claude-code"
      ? args.runtimeOptions.claudeEffort
      : args.runtimeOptions.codexReasoningEffort;
  const effort =
    args.providerId === "codex"
      ? resolveCodexAppServerReasoningEffort({
          reasoningEffort: requestedEffort,
        })
      : requestedEffort;

  if (!effort) {
    return undefined;
  }

  return {
    effort,
    fastMode:
      args.providerId === "claude-code"
        ? args.runtimeOptions.claudeFastMode === true
        : args.runtimeOptions.codexFastMode === true,
  };
}

export function getTurnModelInfoLabel(
  message: Pick<ChatMessage, "model" | "providerId" | "modelInfo">,
) {
  const labels = [toHumanModelName({ model: message.model })];
  if (!message.modelInfo || message.providerId === "user") {
    return labels[0] ?? message.model;
  }

  const effortOptions =
    message.providerId === "claude-code"
      ? CLAUDE_EFFORT_OPTIONS
      : CODEX_EFFORT_OPTIONS;
  labels.push(findOptionLabel(effortOptions, message.modelInfo.effort));
  if (message.modelInfo.fastMode) {
    labels.push("Fast");
  }

  return labels.join(" · ");
}

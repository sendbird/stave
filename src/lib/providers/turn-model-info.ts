import { resolveCodexAppServerReasoningEffort } from "@/lib/providers/codex-runtime-options";
import { describeCursorModel } from "@/lib/providers/cursor-model-id";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  KIRO_EFFORT_OPTIONS,
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
      : args.providerId === "codex"
        ? args.runtimeOptions.codexReasoningEffort
        : args.providerId === "kiro"
          ? args.runtimeOptions.kiroEffort
          : undefined;
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
        : args.providerId === "codex"
          ? args.runtimeOptions.codexFastMode === true
          : false,
  };
}

export interface TurnModelInfoParts {
  /** Model name on its own, with no configuration suffix. */
  name: string;
  /** Configuration this turn ran with, one short label per value. */
  details: string[];
}

/**
 * Splits a turn's model notation into a name plus its configuration labels.
 *
 * Cursor is the reason this is structured rather than a single string: it
 * carries effort, context, thinking, and fast inside the model id, so the only
 * way to avoid printing `auto-smart[optimize_for=balanced]` verbatim is to parse
 * the id and render the pieces separately. Every other provider reports
 * configuration through `modelInfo`, which was already separate.
 */
export function getTurnModelInfoParts(
  message: Pick<ChatMessage, "model" | "providerId" | "modelInfo">,
): TurnModelInfoParts {
  if (message.providerId === "cursor") {
    return describeCursorModel(message.model);
  }

  const name = toHumanModelName({ model: message.model });
  if (!message.modelInfo || message.providerId === "user") {
    return { name: name || message.model, details: [] };
  }

  const effortOptions =
    message.providerId === "claude-code"
      ? CLAUDE_EFFORT_OPTIONS
      : message.providerId === "kiro"
        ? KIRO_EFFORT_OPTIONS
        : CODEX_EFFORT_OPTIONS;
  const details = [findOptionLabel(effortOptions, message.modelInfo.effort)];
  if (message.modelInfo.fastMode) {
    details.push("Fast");
  }

  return { name, details };
}

/**
 * Flattened form of {@link getTurnModelInfoParts}, used for accessible names and
 * tooltips where a single string is required.
 */
export function getTurnModelInfoLabel(
  message: Pick<ChatMessage, "model" | "providerId" | "modelInfo">,
) {
  const { name, details } = getTurnModelInfoParts(message);
  return [name, ...details].join(" · ");
}

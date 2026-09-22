import type { ProviderId } from "@/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

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

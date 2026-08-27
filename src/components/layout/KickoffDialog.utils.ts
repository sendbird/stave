import type { ProviderId } from "@/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

export function canApplyKickoffDialogOpenChange(args: {
  open: boolean;
  busy: boolean;
}) {
  return args.open || !args.busy;
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
          claudeEffort:
            args.effort as NonNullable<
              PromptDraftRuntimeOverrides["claudeEffort"]
            >,
        }
      : {
          codexReasoningEffort:
            args.effort as NonNullable<
              PromptDraftRuntimeOverrides["codexReasoningEffort"]
            >,
          codexFastMode: args.codexFastMode,
        }),
  };
}

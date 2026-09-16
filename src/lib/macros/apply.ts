import { buildModelEffortRuntimeOverrides } from "@/lib/providers/model-effort";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";
import type { MacroRuntime } from "./types";

export function buildMacroRuntimeOverrides(args: {
  current?: PromptDraftRuntimeOverrides;
  runtime: MacroRuntime;
}): PromptDraftRuntimeOverrides {
  const current = args.current ?? {};
  const effortOverrides = buildModelEffortRuntimeOverrides({
    providerId: args.runtime.providerId,
    model: args.runtime.model,
    effort: args.runtime.effort,
  });

  return {
    ...current,
    autoRouting: false,
    model: args.runtime.model,
    modelProviderId: args.runtime.providerId,
    claudeEffort: undefined,
    codexReasoningEffort: undefined,
    cursorEffort: undefined,
    kiroEffort: undefined,
    // Fast is remembered per provider+model. A pinned macro must not carry
    // the composer's current Fast onto a different provider for this turn.
    codexFastMode: undefined,
    cursorFastMode: undefined,
    ...effortOverrides,
  };
}

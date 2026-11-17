import {
  DEFAULT_AUX_INFERENCE_DEFAULT,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  resolveAuxLaneRuntime,
} from "../src/lib/providers/auxiliary-inference-policy";
import { getDefaultModelForProvider, getUtilityInferenceCapability } from "../src/lib/providers/model-catalog";
import type { SuiteName } from "./cases";

export type EvalProviderName = "claude" | "codex";
export type EvalModelSource = "option" | "planner-default" | "utility-default";

export function evalProviderId(provider: EvalProviderName) {
  return provider === "claude" ? "claude-code" as const : "codex" as const;
}

/** The Background AI lane whose model produces each suite's output in the app. */
const SUITE_LANE = {
  titles: "taskName",
  "pr-body": "prDescription",
  delegation: "utility",
} as const;

/**
 * Picks the model the app itself would use, so an evaluation measures (and
 * costs) what production runs. The planner uses the conversation model, whose
 * default is the provider's default model. Every other suite uses the app's
 * default utility model for its lane. Settings saved in the desktop app are not
 * readable from this script; pass `--model` to evaluate a configured model.
 */
export function resolveEvalModel(args: { suite: SuiteName; provider: EvalProviderName; model?: string | undefined }): { model: string; source: EvalModelSource } {
  const explicit = args.model?.trim();
  if (explicit) return { model: explicit, source: "option" };
  const providerId = evalProviderId(args.provider);
  if (args.suite === "planner") return { model: getDefaultModelForProvider({ providerId }), source: "planner-default" };
  const lane = resolveAuxLaneRuntime({
    lane: SUITE_LANE[args.suite],
    policy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
    shared: DEFAULT_AUX_INFERENCE_DEFAULT,
    activeProviderId: providerId,
  });
  return { model: lane.model ?? getUtilityInferenceCapability({ providerId }).defaultModel, source: "utility-default" };
}

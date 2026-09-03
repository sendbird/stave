import {
  clampCodexEffortToModel,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "@/lib/providers/model-catalog";
import {
  applyModelRuntimePreference,
  type ModelRuntimePreferenceSettings,
} from "@/lib/providers/model-runtime-preferences";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  listCodexEffortOptionsForModel,
} from "@/lib/providers/runtime-option-contract";

/**
 * Provider-agnostic model effort helpers.
 *
 * Surfaces that launch a one-off run (local change review, compare candidates,
 * compare judge, workspace kickoff) all need the same three things: the effort
 * values a provider/model pair accepts, a sane default derived from settings,
 * and the runtime-override shape the provider runtime expects. Keeping that in
 * one module stops each surface from re-deriving provider branches.
 */

export type ClaudeModelEffort = NonNullable<
  ProviderRuntimeOptions["claudeEffort"]
>;
export type CodexModelEffort = NonNullable<
  ProviderRuntimeOptions["codexReasoningEffort"]
>;
export type ModelEffort = ClaudeModelEffort | CodexModelEffort;

export interface ModelEffortOption {
  value: ModelEffort;
  label: string;
}

const CLAUDE_EFFORT_VALUES = new Set<string>(
  CLAUDE_EFFORT_OPTIONS.map((option) => option.value),
);
// "minimal" is a valid runtime value that the selector list intentionally
// hides, so the guard has to accept it even though it is not offered.
const CODEX_EFFORT_VALUES = new Set<string>([
  "minimal",
  ...CODEX_EFFORT_OPTIONS.map((option) => option.value),
]);

export function isClaudeModelEffort(
  value: string | undefined,
): value is ClaudeModelEffort {
  return value != null && CLAUDE_EFFORT_VALUES.has(value);
}

export function isCodexModelEffort(
  value: string | undefined,
): value is CodexModelEffort {
  return value != null && CODEX_EFFORT_VALUES.has(value);
}

export function isModelEffort(value: string | undefined): value is ModelEffort {
  return isClaudeModelEffort(value) || isCodexModelEffort(value);
}

/** The effort the provider itself recommends for this model. */
export function resolveDefaultModelEffort(args: {
  providerId: ProviderId;
  model: string;
}): ModelEffort {
  return args.providerId === "claude-code"
    ? resolveDefaultClaudeEffortForModel({ model: args.model })
    : resolveDefaultCodexEffortForModel({ model: args.model });
}

/**
 * Claude Haiku rejects an explicit `effort` with a 400, so the field must be
 * omitted rather than clamped for that family.
 */
export function modelAcceptsExplicitEffort(args: {
  providerId: ProviderId;
  model: string;
}) {
  return !(
    args.providerId === "claude-code" &&
    /^claude-haiku-/.test(args.model.trim())
  );
}

/** Effort values the given provider/model pair actually accepts. */
export function listModelEffortOptions(args: {
  providerId: ProviderId;
  model: string;
}): readonly ModelEffortOption[] {
  if (!modelAcceptsExplicitEffort(args)) {
    return [];
  }
  return args.providerId === "claude-code"
    ? CLAUDE_EFFORT_OPTIONS
    : listCodexEffortOptionsForModel({ model: args.model });
}

/** The effort a task would run at today, honoring per-model preferences. */
export function resolveModelEffortFromSettings<
  TSettings extends ModelRuntimePreferenceSettings,
>(args: {
  settings: TSettings;
  providerId: ProviderId;
  model: string;
}): ModelEffort {
  const runtimeSettings = applyModelRuntimePreference(args);
  return args.providerId === "claude-code"
    ? runtimeSettings.claudeEffort
    : runtimeSettings.codexReasoningEffort;
}

/**
 * Keeps a carried-over effort valid after a model or provider switch: prefer
 * the requested value, step down to the nearest supported Codex tier, then the
 * caller's default, and finally the model's own recommended effort. The last
 * step never escalates to the most expensive tier just because a
 * cross-provider value (e.g. Codex "ultra" on Claude) could not be honored.
 */
export function clampModelEffort(args: {
  providerId: ProviderId;
  model: string;
  effort: ModelEffort | undefined;
  fallback: ModelEffort;
}): ModelEffort {
  const options = listModelEffortOptions({
    providerId: args.providerId,
    model: args.model,
  });
  const supports = (value: ModelEffort | undefined) =>
    value != null && options.some((option) => option.value === value);

  if (supports(args.effort)) {
    return args.effort as ModelEffort;
  }
  if (args.providerId === "codex" && isCodexModelEffort(args.effort)) {
    return clampCodexEffortToModel({ model: args.model, effort: args.effort });
  }
  if (supports(args.fallback)) {
    return args.fallback;
  }
  const providerDefault = resolveDefaultModelEffort(args);
  return supports(providerDefault)
    ? providerDefault
    : (options[0]?.value ?? providerDefault);
}

/** Runtime override patch for the provider that owns this effort value. */
export function buildModelEffortRuntimeOverrides(args: {
  providerId: ProviderId;
  model: string;
  effort: ModelEffort | undefined;
}): Pick<ProviderRuntimeOptions, "claudeEffort" | "codexReasoningEffort"> {
  if (!args.effort) {
    return {};
  }
  if (args.providerId === "claude-code") {
    return isClaudeModelEffort(args.effort)
      ? { claudeEffort: args.effort }
      : {};
  }
  return isCodexModelEffort(args.effort)
    ? {
        codexReasoningEffort: clampCodexEffortToModel({
          model: args.model,
          effort: args.effort,
        }),
      }
    : {};
}

export function getModelEffortLabel(args: {
  providerId: ProviderId;
  model: string;
  effort: ModelEffort | undefined;
}): string | undefined {
  return listModelEffortOptions(args).find(
    (option) => option.value === args.effort,
  )?.label;
}

import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

const CLAUDE_COLOR_ICON_URL = `${import.meta.env.BASE_URL}claude-color.svg`;
const CODEX_COLOR_ICON_URL = `${import.meta.env.BASE_URL}codex-color.svg`;
export const STAVE_LOGO_URL = `${import.meta.env.BASE_URL}stave-logo.svg`;
export const DEFAULT_CLAUDE_OPUS_MODEL = "claude-opus-5";
export const DEFAULT_CLAUDE_OPUS_1M_MODEL = "claude-opus-5[1m]";
export const DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL = "claude-opus-4-8";
export const DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL = "claude-opus-4-8[1m]";
export const CLAUDE_FABLE_MODEL = "claude-fable-5";
// Claude Sonnet 5 surfaced in the Claude CLI picker from 2.1.197, but the
// model ID is passed straight through to the Anthropic API, which decides
// availability — so no CLI-version gating is needed on our side.
export const DEFAULT_CLAUDE_SONNET_MODEL = "claude-sonnet-5";
export const DEFAULT_CLAUDE_SONNET_1M_MODEL = "claude-sonnet-5[1m]";
// Settings-scoped model IDs that should silently upgrade to the current
// catalog default of the same family. Historical chat/turn records keep their
// original IDs and render via the legacy display names below.
const LEGACY_AUTOMATIC_CLAUDE_MODELS: Record<string, string> = {
  [DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL]: DEFAULT_CLAUDE_OPUS_MODEL,
  [DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL]: DEFAULT_CLAUDE_OPUS_1M_MODEL,
  "claude-opus-4-7": DEFAULT_CLAUDE_OPUS_MODEL,
  "claude-opus-4-7[1m]": DEFAULT_CLAUDE_OPUS_1M_MODEL,
  "claude-opus-4-6": DEFAULT_CLAUDE_OPUS_MODEL,
  "claude-opus-4-6[1m]": DEFAULT_CLAUDE_OPUS_1M_MODEL,
  "claude-sonnet-4-6": DEFAULT_CLAUDE_SONNET_MODEL,
  "claude-sonnet-4-6[1m]": DEFAULT_CLAUDE_SONNET_1M_MODEL,
};

// Source: https://platform.claude.com/docs/en/about-claude/models/overview
// Latest models comparison (as of 2026-07-25)
// The [1m] suffix activates the 1M-token context window; the Claude SDK
// parses it and auto-injects the `context-1m-2025-08-07` beta header.
export const CLAUDE_SDK_MODEL_OPTIONS = [
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  DEFAULT_CLAUDE_SONNET_1M_MODEL,
] as const;

// Source:
// - local `codex app-server` / CLI baseline support
// - https://developers.openai.com/codex/models (GPT-5.6 family, 2026-07-09)
// - verified against codex-cli 0.144.1 `model/list` (2026-07-10): the server
//   catalog now ships gpt-5.6-sol/terra/luna (default effort xhigh; sol/terra
//   support up to "ultra", luna up to "max") alongside legacy models.
// GPT-5.6 ships as Sol (flagship), Terra (balanced), and Luna (fast/cheap).
// Previous-generation variants remain recognizable in historical records but
// are intentionally absent from the primary picker.
export const CODEX_MODEL_OPTIONS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  shortLabel: string;
  iconUrl: string;
  fallbackLabel: string;
  models: readonly string[];
  defaultModel: string;
  sessionLabel: string;
  capabilities: {
    nativeCommandCatalog: boolean;
    supportsMidTurnSteering: boolean;
    utilityInference: {
      supported: boolean;
      defaultModel: string;
    };
  };
}

export const PROVIDER_DESCRIPTORS = [
  {
    id: "claude-code",
    label: "Claude Code",
    shortLabel: "Claude",
    iconUrl: CLAUDE_COLOR_ICON_URL,
    fallbackLabel: "C",
    models: CLAUDE_SDK_MODEL_OPTIONS,
    defaultModel: DEFAULT_CLAUDE_SONNET_MODEL,
    sessionLabel: "Claude session ID",
    capabilities: {
      nativeCommandCatalog: true,
      supportsMidTurnSteering: true,
      utilityInference: {
        supported: true,
        defaultModel: "claude-haiku-4-5",
      },
    },
  },
  {
    id: "codex",
    label: "Codex",
    shortLabel: "Codex",
    iconUrl: CODEX_COLOR_ICON_URL,
    fallbackLabel: "O",
    models: CODEX_MODEL_OPTIONS,
    defaultModel: "gpt-5.6-terra",
    sessionLabel: "Codex thread ID",
    capabilities: {
      nativeCommandCatalog: true,
      supportsMidTurnSteering: true,
      utilityInference: {
        supported: true,
        defaultModel: "gpt-5.6-luna",
      },
    },
  },
] as const satisfies readonly ProviderDescriptor[];

export function listProviderDescriptors() {
  return [...PROVIDER_DESCRIPTORS];
}

export function listProviderIds(): ProviderId[] {
  return PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.id);
}

export function getProviderDescriptor(args: { providerId: ProviderId }) {
  const descriptor = PROVIDER_DESCRIPTORS.find(
    (candidate) => candidate.id === args.providerId,
  );
  if (!descriptor) {
    throw new Error(`Unknown provider descriptor: ${args.providerId}`);
  }
  return descriptor;
}

export function getProviderLabel(args: {
  providerId: ProviderId;
  variant?: "short" | "full";
}) {
  const descriptor = getProviderDescriptor(args);
  return args.variant === "full" ? descriptor.label : descriptor.shortLabel;
}

export function getProviderIconUrl(args: {
  providerId: ProviderId;
  model?: string;
  isDarkMode?: boolean;
}) {
  return getProviderDescriptor({ providerId: args.providerId }).iconUrl;
}

export function inferProviderIdFromModel(args: { model: string }): ProviderId {
  const normalizedModel = args.model.trim().toLowerCase();
  if (normalizedModel.includes("codex") || normalizedModel.startsWith("gpt-")) {
    return "codex";
  }
  return "claude-code";
}

export function resolveProviderDisplayId(args: {
  providerId: ProviderId;
  model?: string;
}) {
  return args.providerId;
}

export function getProviderWaveToneClass(args: {
  providerId: ProviderId;
  model?: string;
}) {
  const displayProviderId = resolveProviderDisplayId(args);

  if (displayProviderId === "claude-code") {
    return "text-provider-claude";
  }
  if (displayProviderId === "codex") {
    return "text-provider-codex";
  }
  return "text-primary";
}

export function getProviderFallbackLabel(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).fallbackLabel;
}

export function getProviderSessionLabel(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).sessionLabel;
}

export function providerSupportsNativeCommandCatalog(args: {
  providerId: ProviderId;
}) {
  return getProviderDescriptor(args).capabilities.nativeCommandCatalog;
}

export function providerSupportsMidTurnSteering(args: {
  providerId: ProviderId;
}) {
  return getProviderDescriptor(args).capabilities.supportsMidTurnSteering;
}

export function getUtilityInferenceCapability(args: {
  providerId: ProviderId;
}) {
  return getProviderDescriptor(args).capabilities.utilityInference;
}

export function getDefaultModelForProvider(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).defaultModel;
}

export function getNextProviderId(args: { providerId: ProviderId }) {
  const providerIds = listProviderIds();
  const currentIndex = providerIds.indexOf(args.providerId);
  if (currentIndex < 0) {
    return providerIds[0] ?? args.providerId;
  }
  return (
    providerIds[(currentIndex + 1) % providerIds.length] ?? args.providerId
  );
}

export function getSdkModelOptions(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).models;
}

export type ModelTier = "light" | "standard" | "heavy" | "frontier";
export type TaskType =
  | "quick_edit"
  | "plan"
  | "implementation"
  | "debug"
  | "review"
  | "general"
  | "safety";

export interface ModelCapability {
  providerId: ProviderId;
  model: string;
  tier: ModelTier;
  taskTypes: readonly TaskType[];
  defaultClaudeEffort?: NonNullable<ProviderRuntimeOptions["claudeEffort"]>;
  defaultCodexReasoningEffort?: NonNullable<
    ProviderRuntimeOptions["codexReasoningEffort"]
  >;
  /**
   * Reasoning-effort values the model actually accepts, per the Codex
   * `model/list` catalog. Omitted for models where every effort level is
   * accepted (or the constraint is unknown) — callers should treat a missing
   * value as "no restriction" rather than "nothing supported".
   */
  supportedCodexReasoningEfforts?: readonly NonNullable<
    ProviderRuntimeOptions["codexReasoningEffort"]
  >[];
}

/**
 * Full selectable Codex reasoning-effort scale, in low-to-high order. Kept
 * local to this module (rather than imported from
 * `runtime-option-contract.ts`) so model-catalog has no dependency on the UI
 * option-label layer. "minimal" is intentionally excluded — it was dropped
 * from the Codex CLI effort scale with GPT-5.6 (see
 * `runtime-option-contract.ts`).
 */
export const ALL_CODEX_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly NonNullable<
  ProviderRuntimeOptions["codexReasoningEffort"]
>[];

export const MODEL_TIER_ORDER = [
  "light",
  "standard",
  "heavy",
  "frontier",
] as const satisfies readonly ModelTier[];

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  [CLAUDE_FABLE_MODEL]: {
    providerId: "claude-code",
    model: CLAUDE_FABLE_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "xhigh",
  },
  [DEFAULT_CLAUDE_OPUS_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_OPUS_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "xhigh",
  },
  [DEFAULT_CLAUDE_OPUS_1M_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_OPUS_1M_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "xhigh",
  },
  opusplan: {
    providerId: "claude-code",
    model: "opusplan",
    tier: "frontier",
    taskTypes: ["plan", "review", "safety"],
    defaultClaudeEffort: "xhigh",
  },
  [DEFAULT_CLAUDE_SONNET_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_SONNET_MODEL,
    tier: "heavy",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "high",
  },
  [DEFAULT_CLAUDE_SONNET_1M_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_SONNET_1M_MODEL,
    tier: "heavy",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "high",
  },
  "claude-haiku-4-5": {
    providerId: "claude-code",
    model: "claude-haiku-4-5",
    tier: "light",
    taskTypes: ["quick_edit", "general"],
    defaultClaudeEffort: "medium",
  },
  // Codex default efforts and supported-effort scales mirror
  // `defaultReasoningEffort` / `supportedReasoningEfforts` reported by the
  // codex-cli 0.144.1 App Server `model/list` catalog. Notably Luna does not
  // accept "ultra" and GPT-5.5 caps out at "xhigh" (no "max"/"ultra").
  "gpt-5.6-sol": {
    providerId: "codex",
    model: "gpt-5.6-sol",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "xhigh",
    supportedCodexReasoningEfforts: [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ],
  },
  "gpt-5.6-terra": {
    providerId: "codex",
    model: "gpt-5.6-terra",
    tier: "heavy",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "xhigh",
    supportedCodexReasoningEfforts: [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ],
  },
  "gpt-5.6-luna": {
    providerId: "codex",
    model: "gpt-5.6-luna",
    tier: "light",
    taskTypes: ["quick_edit", "general"],
    defaultCodexReasoningEffort: "xhigh",
    // Luna is the one GPT-5.6 variant that does not accept "ultra".
    supportedCodexReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  "gpt-5.5": {
    providerId: "codex",
    model: "gpt-5.5",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "xhigh",
    supportedCodexReasoningEfforts: ["low", "medium", "high", "xhigh"],
  },
};

function getTierIndex(tier: ModelTier) {
  return MODEL_TIER_ORDER.indexOf(tier);
}

export function getModelCapability(args: {
  model: string;
}): ModelCapability | null {
  return MODEL_CAPABILITIES[args.model.trim()] ?? null;
}

export function listModelCapabilities(args?: {
  providerId?: ProviderId;
}): ModelCapability[] {
  return Object.values(MODEL_CAPABILITIES).filter(
    (capability) =>
      args?.providerId === undefined ||
      capability.providerId === args.providerId,
  );
}

export function resolveTierModel(args: {
  tier: ModelTier;
  providerId: ProviderId;
  eligibleModels?: readonly string[];
}) {
  const candidateModels =
    args.eligibleModels && args.eligibleModels.length > 0
      ? args.eligibleModels
      : listModelCapabilities({ providerId: args.providerId }).map(
          (capability) => capability.model,
        );
  const candidates = candidateModels
    .map((model) => getModelCapability({ model }))
    .filter(
      (capability): capability is ModelCapability =>
        capability !== null && capability.providerId === args.providerId,
    );

  if (candidates.length === 0) {
    return null;
  }

  const exact = candidates.find((capability) => capability.tier === args.tier);
  if (exact) {
    return exact.model;
  }

  const requestedIndex = getTierIndex(args.tier);
  const [nearest] = [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(getTierIndex(left.tier) - requestedIndex);
    const rightDistance = Math.abs(getTierIndex(right.tier) - requestedIndex);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return getTierIndex(right.tier) - getTierIndex(left.tier);
  });

  return nearest?.model ?? null;
}

export function normalizeModelSelection(args: {
  value: string;
  fallback: string;
}) {
  const trimmed = args.value.trim();
  if (trimmed.length === 0) {
    return args.fallback;
  }
  return trimmed;
}

export function upgradeSettingsScopedClaudeModel(args: { model: string }) {
  const normalizedModel = args.model.trim().toLowerCase();
  const upgraded = LEGACY_AUTOMATIC_CLAUDE_MODELS[normalizedModel];
  if (upgraded) {
    return upgraded;
  }
  return args.model;
}

export function resolveDefaultClaudeFallbackModel(args: {
  model: string;
}): string | undefined {
  const normalizedModel = args.model.trim().toLowerCase();
  if (normalizedModel === DEFAULT_CLAUDE_OPUS_MODEL) {
    return DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL;
  }
  if (normalizedModel === DEFAULT_CLAUDE_OPUS_1M_MODEL) {
    return DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL;
  }
  return undefined;
}

export function resolveDefaultClaudeEffortForModel(args: {
  model: string;
}): NonNullable<ProviderRuntimeOptions["claudeEffort"]> {
  const normalizedModel = args.model.trim().toLowerCase();
  if (normalizedModel.includes("fable") || normalizedModel.includes("opus")) {
    return "xhigh";
  }
  // TODO(fable): return "xhigh" for claude-fable-5 once the model is available.
  if (normalizedModel.includes("sonnet")) {
    return "high";
  }
  return "medium";
}

export function resolveDefaultCodexEffortForModel(args: {
  model: string;
}): NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]> {
  // 1. Codex's own recommendation for the model, whether it comes from the
  // live App Server catalog (`model/list.defaultReasoningEffort`, registered
  // via registerDynamicDefaultReasoningEffort) or our static, verified
  // MODEL_CAPABILITIES entry. The dynamic value wins when present since it
  // reflects the installed Codex binary's current recommendation.
  const dynamicDefault = dynamicDefaultReasoningEfforts.get(
    args.model.trim(),
  );
  if (dynamicDefault) {
    return dynamicDefault;
  }

  const capability = getModelCapability({ model: args.model });
  if (
    capability?.providerId === "codex" &&
    capability.defaultCodexReasoningEffort
  ) {
    return capability.defaultCodexReasoningEffort;
  }

  // 2. No known Codex recommendation (e.g. a legacy or unrecognized model
  // id) — fall back to the same "medium" baseline Stave has always used.
  return "medium";
}

export function resolveClaudeEffortForModelSwitch(args: {
  previousModel: string;
  nextModel: string;
  currentEffort: NonNullable<ProviderRuntimeOptions["claudeEffort"]>;
}): NonNullable<ProviderRuntimeOptions["claudeEffort"]> {
  const previousDefaultEffort = resolveDefaultClaudeEffortForModel({
    model: args.previousModel,
  });
  if (args.currentEffort !== previousDefaultEffort) {
    return args.currentEffort;
  }
  return resolveDefaultClaudeEffortForModel({ model: args.nextModel });
}

/**
 * Dynamic display-name registry populated at runtime by the Codex model
 * catalog (`model/list`). Entries here take priority over the static `known`
 * map so that newly-added server-side models get correct names immediately
 * without a Stave code change.
 */
const dynamicDisplayNames = new Map<string, string>();

/**
 * Merge server-provided display names into the runtime registry.
 * Called from `useCodexModelCatalog` after a successful `model/list` fetch.
 */
export function registerDynamicDisplayNames(names: Map<string, string>) {
  for (const [model, displayName] of names) {
    dynamicDisplayNames.set(model, displayName);
  }
}

/**
 * Read-only access to the current dynamic display-name registry.
 * Useful for tests and diagnostics.
 */
export function getDynamicDisplayNames(): ReadonlyMap<string, string> {
  return dynamicDisplayNames;
}

/**
 * Dynamic per-model default-reasoning-effort registry populated at runtime
 * from the Codex model catalog (`model/list.defaultReasoningEffort`). Read by
 * `resolveDefaultCodexEffortForModel` so Stave always prefers Codex's own
 * recommendation over the static fallback once the App Server catalog has
 * been fetched.
 */
const dynamicDefaultReasoningEfforts = new Map<
  string,
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>
>();

const VALID_CODEX_REASONING_EFFORTS = new Set<
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>
>(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

function isValidCodexReasoningEffort(
  value: string,
): value is NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]> {
  return VALID_CODEX_REASONING_EFFORTS.has(
    value as NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>,
  );
}

/**
 * Merge server-provided default reasoning efforts into the runtime registry.
 * Called from `useCodexModelCatalog` after a successful `model/list` fetch.
 * Unrecognized effort strings are ignored so a malformed server response
 * cannot poison the registry.
 */
export function registerDynamicDefaultReasoningEfforts(
  defaults: Map<string, string>,
) {
  for (const [model, effort] of defaults) {
    if (isValidCodexReasoningEffort(effort)) {
      dynamicDefaultReasoningEfforts.set(model, effort);
    }
  }
}

/**
 * Read-only access to the current dynamic default-reasoning-effort registry.
 * Useful for tests and diagnostics.
 */
export function getDynamicDefaultReasoningEfforts(): ReadonlyMap<
  string,
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>
> {
  return dynamicDefaultReasoningEfforts;
}

/**
 * Dynamic per-model supported-reasoning-effort registry populated at runtime
 * from the Codex model catalog (`model/list.supportedReasoningEfforts`). Read
 * by `listCodexReasoningEffortsForModel` so effort pickers never offer a
 * value the currently installed Codex binary would reject for that model
 * (e.g. GPT-5.6 Luna does not accept "ultra").
 */
const dynamicSupportedReasoningEfforts = new Map<
  string,
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>[]
>();

/**
 * Merge server-provided supported-effort lists into the runtime registry.
 * Called from `useCodexModelCatalog` after a successful `model/list` fetch.
 * Unrecognized effort strings are dropped so a malformed server response
 * cannot poison the registry; an entry with no recognizable values is
 * ignored entirely (falls through to the static catalog / unrestricted).
 */
export function registerDynamicSupportedReasoningEfforts(
  supported: Map<string, readonly string[]>,
) {
  for (const [model, efforts] of supported) {
    const valid = efforts.filter(isValidCodexReasoningEffort);
    if (valid.length > 0) {
      dynamicSupportedReasoningEfforts.set(model, valid);
    }
  }
}

/**
 * Read-only access to the current dynamic supported-reasoning-effort
 * registry. Useful for tests and diagnostics.
 */
export function getDynamicSupportedReasoningEfforts(): ReadonlyMap<
  string,
  readonly NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>[]
> {
  return dynamicSupportedReasoningEfforts;
}

/**
 * Reasoning-effort values selectable for a given Codex model, in
 * low-to-high order. Prefers the live App Server catalog (registered via
 * `registerDynamicSupportedReasoningEfforts`) since it reflects the
 * installed Codex binary; falls back to the verified static catalog entry;
 * and finally returns the full scale when nothing is known about the model
 * (never blocks a legacy/unrecognized model from being used).
 */
export function listCodexReasoningEffortsForModel(args: {
  model: string;
}): readonly NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>[] {
  const trimmedModel = args.model.trim();
  const dynamic = dynamicSupportedReasoningEfforts.get(trimmedModel);
  if (dynamic && dynamic.length > 0) {
    return dynamic;
  }

  const capability = getModelCapability({ model: trimmedModel });
  if (
    capability?.providerId === "codex" &&
    capability.supportedCodexReasoningEfforts &&
    capability.supportedCodexReasoningEfforts.length > 0
  ) {
    return capability.supportedCodexReasoningEfforts;
  }

  return ALL_CODEX_REASONING_EFFORTS;
}

/**
 * Clamps a reasoning-effort value to one the target model actually accepts.
 * Used when switching models (or loading a persisted preset) so a value like
 * "ultra" carried over from GPT-5.6 Sol doesn't get silently sent to Luna,
 * which would reject it. Steps down to the nearest lower supported value
 * first (so "ultra" -> "max" rather than jumping straight to the model's
 * default), falling back to the model's default effort if the current value
 * is below every supported level (should not happen in practice).
 */
export function clampCodexEffortToModel(args: {
  model: string;
  effort: NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>;
}): NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]> {
  const supported = listCodexReasoningEffortsForModel({ model: args.model });
  if ((supported as readonly string[]).includes(args.effort)) {
    return args.effort;
  }

  const requestedIndex = ALL_CODEX_REASONING_EFFORTS.indexOf(
    args.effort as (typeof ALL_CODEX_REASONING_EFFORTS)[number],
  );
  const nextLower = [...supported]
    .filter(
      (candidate) =>
        ALL_CODEX_REASONING_EFFORTS.indexOf(
          candidate as (typeof ALL_CODEX_REASONING_EFFORTS)[number],
        ) <= requestedIndex,
    )
    .sort(
      (left, right) =>
        ALL_CODEX_REASONING_EFFORTS.indexOf(
          right as (typeof ALL_CODEX_REASONING_EFFORTS)[number],
        ) -
        ALL_CODEX_REASONING_EFFORTS.indexOf(
          left as (typeof ALL_CODEX_REASONING_EFFORTS)[number],
        ),
    )[0];

  return nextLower ?? resolveDefaultCodexEffortForModel({ model: args.model });
}

export function toHumanModelName(args: { model: string }) {
  // 1. Check dynamic registry first (server-provided names)
  const dynamic = dynamicDisplayNames.get(args.model);
  if (dynamic) {
    return dynamic;
  }

  // 2. Static known names
  const known: Record<string, string> = {
    [CLAUDE_FABLE_MODEL]: "Claude Fable 5",
    [DEFAULT_CLAUDE_OPUS_MODEL]: "Claude Opus 5",
    [DEFAULT_CLAUDE_OPUS_1M_MODEL]: "Claude Opus 5 (1M)",
    // Legacy labels kept so historical chat/turn records still render a
    // recognizable name after the preset options migrated.
    [DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL]: "Claude Opus 4.8",
    [DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL]: "Claude Opus 4.8 (1M)",
    "claude-opus-4-7": "Claude Opus 4.7",
    "claude-opus-4-7[1m]": "Claude Opus 4.7 (1M)",
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-opus-4-6[1m]": "Claude Opus 4.6 (1M)",
    opusplan: "Claude Opus Plan",
    [DEFAULT_CLAUDE_SONNET_MODEL]: "Claude Sonnet 5",
    [DEFAULT_CLAUDE_SONNET_1M_MODEL]: "Claude Sonnet 5 (1M)",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-sonnet-4-6[1m]": "Claude Sonnet 4.6 (1M)",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.5": "GPT-5.5",
    // Legacy Codex labels kept so historical chat/turn records still render
    // recognizable names after the picker lineup moved to GPT-5.6.
    "gpt-5.4": "GPT-5.4",
    "gpt-5.4-mini": "GPT-5.4 Mini",
    "gpt-5-codex": "GPT-5-Codex",
    "gpt-5.3-codex": "GPT-5.3-Codex",
    "gpt-5.3-codex-spark": "GPT-5.3-Codex Spark",
  };
  const exact = known[args.model];
  if (exact) {
    return exact;
  }

  // 3. Best-effort formatting from the raw model ID
  return args.model
    .split("-")
    .map((chunk) => {
      if (/^\d+(\.\d+)?$/.test(chunk)) {
        return chunk;
      }
      if (chunk.length <= 3) {
        return chunk.toUpperCase();
      }
      return `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`;
    })
    .join(" ");
}

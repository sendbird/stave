import { i18n } from "@/i18n/runtime";
import type {
  ManagedExecutionProviderId,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

const CLAUDE_COLOR_ICON_URL = `${import.meta.env.BASE_URL}claude-color.svg`;
const CODEX_COLOR_ICON_URL = `${import.meta.env.BASE_URL}codex-color.svg`;
const CURSOR_COLOR_ICON_URL = `${import.meta.env.BASE_URL}cursor-color.svg`;
const KIRO_COLOR_ICON_URL = `${import.meta.env.BASE_URL}kiro-color.svg`;
export const STAVE_LOGO_URL = `${import.meta.env.BASE_URL}stave-logo.svg`;
export const DEFAULT_CLAUDE_OPUS_MODEL = "claude-opus-5-5";
export const DEFAULT_CLAUDE_OPUS_1M_MODEL = "claude-opus-5-5[1m]";
export const DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL = "claude-opus-4-8";
export const DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL = "claude-opus-4-8[1m]";
export const CLAUDE_FABLE_MODEL = "claude-fable-5-1";
// Claude Sonnet 5.5 is the current balanced-tier Sonnet. The id is passed
// through to the Anthropic API, which decides availability. Claude Code
// 2.1.284 or newer resolves the `sonnet` alias to this id; the selector
// states that floor. 1M context is native on the base id. The [1m] suffix
// stays as the explicit context variant, matching Opus 5.5.
export const DEFAULT_CLAUDE_SONNET_MODEL = "claude-sonnet-5-5";
export const DEFAULT_CLAUDE_SONNET_1M_MODEL = "claude-sonnet-5-5[1m]";
export const DEFAULT_CLAUDE_HAIKU_MODEL = "claude-haiku-4-5";
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
  "claude-fable-5": CLAUDE_FABLE_MODEL,
};

// Source: https://platform.claude.com/docs/en/about-claude/models/overview
// Latest models comparison (as of 2026-09-23)
// The [1m] suffix activates the 1M-token context window; the Claude SDK
// parses it and auto-injects the `context-1m-2025-08-07` beta header.
export const CLAUDE_SDK_MODEL_OPTIONS = [
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  DEFAULT_CLAUDE_SONNET_1M_MODEL,
  // Light-tier default for Background AI, utility inference, and workers.
  // Leaving it out of the picker hid the model those lanes actually run.
  DEFAULT_CLAUDE_HAIKU_MODEL,
] as const;

// GPT-6.1 Sol is the flagship default. GPT-6 Sol stays resolvable for history
// and is the automatic fallback when 6.1 is unavailable on the installed
// runtime. Verified against the Codex CLI 0.159.1 bundled catalog on
// 2026-09-30. Terra remains the balanced tier.
export const DEFAULT_CODEX_MODEL = "gpt-6.1-sol";
export const DEFAULT_CODEX_SOL_FALLBACK_MODEL = "gpt-6-sol";
export const CODEX_MODEL_OPTIONS = [
  "gpt-6-astra",
  DEFAULT_CODEX_MODEL,
  "gpt-5.6-terra",
  "gpt-6-luna",
] as const;

const CODEX_PICKER_MODEL_SET: ReadonlySet<string> = new Set(
  CODEX_MODEL_OPTIONS,
);

/**
 * True only for the primary models Stave surfaces in model pickers. A runtime
 * `model/list` response still ships previous- and next-generation entries; we
 * keep them resolvable for historical records and manual overrides, but they
 * must never widen the picker beyond this catalog.
 */
export function isCodexPickerModel(model: string) {
  return CODEX_PICKER_MODEL_SET.has(model.trim().toLowerCase());
}

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  shortLabel: string;
  iconUrl: string | null;
  fallbackLabel: string;
  models: readonly string[];
  modelCatalogSource: "static" | "runtime";
  defaultModel: string;
  sessionLabel: string;
  capabilities: {
    primaryTurns: boolean;
    advisor: boolean;
    worker: boolean;
    secondaryRuns: boolean;
    unattendedRuns: boolean;
    prePrReview: boolean;
    nativeCommandCatalog: boolean;
    supportsMidTurnSteering: boolean;
    threadActions: {
      forkFromTurn: ProviderThreadActionCapability;
      rollbackToTurn: ProviderThreadActionCapability;
      renameNativeSession: ProviderThreadActionCapability;
    };
    utilityInference: {
      supported: boolean;
      defaultModel: string;
    };
  };
}

export type ProviderThreadActionCapability =
  { supported: true } | { supported: false; reason: string };

export const PROVIDER_DESCRIPTORS = [
  {
    id: "claude-code",
    label: "Claude Code",
    shortLabel: "Claude",
    iconUrl: CLAUDE_COLOR_ICON_URL,
    fallbackLabel: "C",
    models: CLAUDE_SDK_MODEL_OPTIONS,
    modelCatalogSource: "static",
    defaultModel: DEFAULT_CLAUDE_OPUS_MODEL,
    get sessionLabel() { return i18n.t("providers:modelCatalog.claudeSessionID"); },
    capabilities: {
      primaryTurns: true,
      advisor: true,
      worker: true,
      secondaryRuns: true,
      unattendedRuns: true,
      prePrReview: true,
      nativeCommandCatalog: true,
      supportsMidTurnSteering: true,
      threadActions: {
        forkFromTurn: { supported: true },
        rollbackToTurn: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.claudeCodeDoesNotExposeIn"); },
        },
        renameNativeSession: { supported: true },
      },
      utilityInference: {
        supported: true,
        defaultModel: DEFAULT_CLAUDE_HAIKU_MODEL,
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
    modelCatalogSource: "runtime",
    defaultModel: DEFAULT_CODEX_MODEL,
    get sessionLabel() { return i18n.t("providers:modelCatalog.codexThreadID"); },
    capabilities: {
      primaryTurns: true,
      advisor: true,
      worker: true,
      secondaryRuns: true,
      unattendedRuns: true,
      prePrReview: true,
      nativeCommandCatalog: true,
      supportsMidTurnSteering: true,
      threadActions: {
        forkFromTurn: { supported: true },
        rollbackToTurn: { supported: true },
        renameNativeSession: { supported: true },
      },
      utilityInference: {
        supported: true,
        defaultModel: "gpt-6-luna",
      },
    },
  },
  {
    id: "cursor",
    get label() { return i18n.t("settings:taskPresetEditor.cursorAgent"); },
    shortLabel: "Cursor",
    iconUrl: CURSOR_COLOR_ICON_URL,
    // i18n-ignore: provider icon initials
    fallbackLabel: "Cu",
    models: ["auto"],
    modelCatalogSource: "runtime",
    defaultModel: "auto",
    get sessionLabel() { return i18n.t("providers:modelCatalog.cursorSessionID"); },
    capabilities: {
      primaryTurns: true,
      advisor: false,
      worker: true,
      secondaryRuns: false,
      unattendedRuns: false,
      prePrReview: false,
      nativeCommandCatalog: false,
      supportsMidTurnSteering: false,
      threadActions: {
        forkFromTurn: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.cursorAgentDoesNotExposePoint"); },
        },
        rollbackToTurn: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.cursorAgentDoesNotExposeIn"); },
        },
        renameNativeSession: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.cursorAgentSessionRenameIsNot"); },
        },
      },
      utilityInference: {
        supported: true,
        defaultModel: "auto",
      },
    },
  },
  {
    id: "kiro",
    label: "Kiro CLI",
    shortLabel: "Kiro",
    iconUrl: KIRO_COLOR_ICON_URL,
    // i18n-ignore: provider icon initials
    fallbackLabel: "Ki",
    models: ["auto"],
    modelCatalogSource: "runtime",
    defaultModel: "auto",
    get sessionLabel() { return i18n.t("providers:modelCatalog.kiroSessionID"); },
    capabilities: {
      primaryTurns: true,
      advisor: false,
      worker: true,
      secondaryRuns: false,
      unattendedRuns: false,
      prePrReview: false,
      nativeCommandCatalog: false,
      supportsMidTurnSteering: true,
      threadActions: {
        forkFromTurn: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.kiroDoesNotExposePointIn"); },
        },
        rollbackToTurn: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.kiroDoesNotExposeInPlace"); },
        },
        renameNativeSession: {
          supported: false,
          get reason() { return i18n.t("providers:modelCatalog.kiroSessionRenameIsNotWired"); },
        },
      },
      utilityInference: {
        supported: true,
        defaultModel: "auto",
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

export type ProviderEligibilityCapability =
  | "primaryTurns"
  | "advisor"
  | "worker"
  | "secondaryRuns"
  | "unattendedRuns"
  | "prePrReview";

export function listProviderIdsForCapability(args: {
  capability: ProviderEligibilityCapability;
}): ProviderId[] {
  return PROVIDER_DESCRIPTORS.filter(
    (descriptor) => descriptor.capabilities[args.capability],
  ).map((descriptor) => descriptor.id);
}

export function listManagedExecutionProviderIds(): ManagedExecutionProviderId[] {
  return listProviderIdsForCapability({ capability: "secondaryRuns" }).filter(
    (providerId): providerId is ManagedExecutionProviderId =>
      providerId === "claude-code" || providerId === "codex",
  );
}

export function isManagedExecutionProviderId(
  providerId: ProviderId,
): providerId is ManagedExecutionProviderId {
  return providerId === "claude-code" || providerId === "codex";
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

/**
 * Marks are vendor-level and theme-independent: both ship their own brand
 * colors and are legible on light and dark surfaces, so neither the model nor
 * the active theme changes the resolved URL. Previously this accepted both and
 * ignored them, which made `ModelIcon` subscribe to `isDarkMode` for a value
 * that could not affect the result.
 */
export function getProviderIconUrl(args: { providerId: ProviderId }) {
  return getProviderDescriptor(args).iconUrl;
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

/**
 * Semantic provider-wave tone. A presentation value, not a color: the consuming
 * component maps it to a StyleX style using the themed provider CSS variables
 * (`--provider-claude` / `--provider-codex` / `--provider-cursor` /
 * `--provider-kiro`) or the ADS accent token. `"accent"` is only for a
 * presentation that is not a known provider (for example a user-authored row).
 */
export type ProviderWaveTone =
  | "claude"
  | "codex"
  | "cursor"
  | "kiro"
  | "accent";

const PROVIDER_WAVE_COLOR: Record<ProviderWaveTone, string> = {
  claude: "var(--provider-claude)",
  codex: "var(--provider-codex)",
  cursor: "var(--provider-cursor)",
  kiro: "var(--provider-kiro)",
  accent: "var(--primary)",
};

export function getProviderWaveTone(args: {
  providerId: ProviderId;
  model?: string;
}): ProviderWaveTone {
  const displayProviderId = resolveProviderDisplayId(args);

  if (displayProviderId === "claude-code") {
    return "claude";
  }
  if (displayProviderId === "codex") {
    return "codex";
  }
  if (displayProviderId === "cursor") {
    return "cursor";
  }
  if (displayProviderId === "kiro") {
    return "kiro";
  }
  return "accent";
}

export function getProviderAccentColor(args: {
  providerId: ProviderId;
  model?: string;
}) {
  return PROVIDER_WAVE_COLOR[getProviderWaveTone(args)];
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

export function getProviderThreadActionCapabilities(args: {
  providerId: ProviderId;
}): ProviderDescriptor["capabilities"]["threadActions"] {
  return getProviderDescriptor(args).capabilities.threadActions;
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
  // Default effort follows each vendor's own recommendation for the model:
  //
  //   frontier (Fable, Astra)                    medium
  //   flagship (Opus 5.5)                        medium
  //   flagship (Sol 6.1, Sol 6)                  high
  //   balanced (Sonnet 5.5, Sonnet 5)           high
  //   balanced (Terra)                           xhigh
  //   light    (Luna)                             xhigh
  //
  // Sonnet 5.5, GPT-6.1 Sol, and GPT-6 Sol list at half of Opus 5.5 per
  // token, so their composer default is high. GPT-6.1 Sol keeps that same
  // default as GPT-6 Sol. Terra is the same price band and sits at xhigh.
  // Luna lists far below that and sits at xhigh. GPT-6.1 Sol, GPT-6 Sol,
  // Terra, and Luna defaults are Stave's: a fetched App Server catalog does
  // not replace them. Astra follows the catalog, with the static value above
  // used until it arrives. max stays off Luna. xhigh and max stay off Sonnet
  // and Sol routes.
  //
  // A frontier model pinned to "xhigh" mostly buys latency (codex-cli 0.153.2
  // reports `defaultReasoningEffort: "medium"` for Astra). Frontier stays at
  // medium. Luna's long context still collapses (MRCR 8-needle 41%) at a
  // higher effort. xhigh is the Stave default because the model is cheap, and
  // max stays off it.
  //
  // Haiku is absent from the ladder on purpose: the Claude API rejects
  // `effort` outright for Haiku-class models (see `modelsRejectingEffort` in
  // worker-mode), so its value here is never sent.
  [CLAUDE_FABLE_MODEL]: {
    providerId: "claude-code",
    model: CLAUDE_FABLE_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "medium",
  },
  [DEFAULT_CLAUDE_OPUS_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_OPUS_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "medium",
  },
  [DEFAULT_CLAUDE_OPUS_1M_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_OPUS_1M_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "medium",
  },
  "claude-opus-5": {
    providerId: "claude-code",
    model: "claude-opus-5",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "high",
  },
  "claude-opus-5[1m]": {
    providerId: "claude-code",
    model: "claude-opus-5[1m]",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "high",
  },
  opusplan: {
    providerId: "claude-code",
    model: "opusplan",
    tier: "frontier",
    taskTypes: ["plan", "review", "safety"],
    defaultClaudeEffort: "high",
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
  // Previous balanced Sonnet. Kept resolvable for historical turns and for a
  // pin the one-time migration did not rewrite. Its effort default stays high.
  "claude-sonnet-5": {
    providerId: "claude-code",
    model: "claude-sonnet-5",
    tier: "heavy",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "high",
  },
  "claude-sonnet-5[1m]": {
    providerId: "claude-code",
    model: "claude-sonnet-5[1m]",
    tier: "heavy",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultClaudeEffort: "high",
  },
  [DEFAULT_CLAUDE_HAIKU_MODEL]: {
    providerId: "claude-code",
    model: DEFAULT_CLAUDE_HAIKU_MODEL,
    tier: "light",
    taskTypes: ["quick_edit", "general"],
    defaultClaudeEffort: "medium",
  },
  // Codex supported-effort scales mirror `supportedReasoningEfforts` reported
  // by the codex-cli 0.153.2 App Server `model/list` catalog. Notably Luna
  // does not accept "ultra" and GPT-5.5 caps out at "xhigh" (no "max"/"ultra").
  // The `defaultCodexReasoningEffort` values below are Stave's static fallback
  // for when the App Server catalog has not been fetched yet; whenever it has,
  // the CLI's own `defaultReasoningEffort` wins via the dynamic registry (see
  // `resolveDefaultCodexEffortForModel`).
  //
  // Astra is the GPT-6 frontier model and leads the Codex picker, mirroring
  // how Fable leads the Claude picker — including the "medium" default effort.
  "gpt-6-astra": {
    providerId: "codex",
    model: "gpt-6-astra",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "medium",
    supportedCodexReasoningEfforts: [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ],
  },
  // Codex CLI 0.159.1 reports `default_reasoning_level: "low"` for GPT-6.1
  // Sol. Stave keeps the same composer default as GPT-6 Sol (`high`) so a
  // model change does not change the stored effort. The scale is Low through
  // Ultra. A fetched catalog does not replace this default.
  [DEFAULT_CODEX_MODEL]: {
    providerId: "codex",
    model: DEFAULT_CODEX_MODEL,
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "high",
    supportedCodexReasoningEfforts: ALL_CODEX_REASONING_EFFORTS,
  },
  // Codex supports Ultra for Sol, while Luna caps at Max. The API's
  // reasoning scale differs; use the Codex documentation for this adapter.
  // Previous flagship. Kept resolvable for history and used when GPT-6.1 Sol
  // is unavailable.
  "gpt-6-sol": {
    providerId: "codex",
    model: "gpt-6-sol",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "high",
    supportedCodexReasoningEfforts: ALL_CODEX_REASONING_EFFORTS,
  },
  "gpt-6-luna": {
    providerId: "codex",
    model: "gpt-6-luna",
    tier: "light",
    taskTypes: ["quick_edit", "general"],
    defaultCodexReasoningEffort: "xhigh",
    supportedCodexReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  "gpt-5.6-sol": {
    providerId: "codex",
    model: "gpt-5.6-sol",
    tier: "frontier",
    taskTypes: ["plan", "implementation", "debug", "review", "safety"],
    defaultCodexReasoningEffort: "high",
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

/**
 * Whether a model id belongs to a provider's own "let the agent pick" family,
 * for example `auto` or Cursor's `auto-smart[optimize_for=balanced]`.
 *
 * Stave offers a single `auto` row for providers that default to it, so every
 * surface has to agree on which advertised ids that row stands for.
 */
export function isAutoModelId(args: { model: string }) {
  const bareModel = args.model.split("[")[0]?.trim().toLowerCase() ?? "";
  return bareModel === "auto" || bareModel.startsWith("auto-");
}

const CURRENT_SONNET_BY_PREVIOUS_ID: Readonly<Record<string, string>> = {
  "claude-sonnet-5": DEFAULT_CLAUDE_SONNET_MODEL,
  "claude-sonnet-5[1m]": DEFAULT_CLAUDE_SONNET_1M_MODEL,
};

/**
 * Moves a pinned Sonnet 5 id onto Sonnet 5.5. Kept separate from
 * `upgradeSettingsScopedClaudeModel` so an unmigrated default of Sonnet 5 can
 * still be recognized by the one-time settings migration.
 */
export function upgradePinnedSonnet5Model(model: string) {
  return CURRENT_SONNET_BY_PREVIOUS_ID[model.trim()] ?? model;
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
  if (
    normalizedModel === DEFAULT_CLAUDE_OPUS_MODEL ||
    normalizedModel === "claude-opus-5"
  ) {
    return DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL;
  }
  if (
    normalizedModel === DEFAULT_CLAUDE_OPUS_1M_MODEL ||
    normalizedModel === "claude-opus-5[1m]"
  ) {
    return DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL;
  }
  return undefined;
}

export function resolveDefaultCodexFallbackModel(args: {
  model: string;
}): string | undefined {
  return args.model.trim().toLowerCase() === DEFAULT_CODEX_MODEL
    ? DEFAULT_CODEX_SOL_FALLBACK_MODEL
    : undefined;
}

export function resolveDefaultClaudeEffortForModel(args: {
  model: string;
}): NonNullable<ProviderRuntimeOptions["claudeEffort"]> {
  const normalizedModel = args.model.trim().toLowerCase();
  // Ordered strongest-first — see the ladder note on MODEL_CAPABILITIES. Fable
  // must be tested before Opus so the shared frontier tier does not drag it up
  // a rung.
  if (normalizedModel.includes("fable")) {
    return "medium";
  }
  if (
    normalizedModel === DEFAULT_CLAUDE_OPUS_MODEL ||
    normalizedModel === DEFAULT_CLAUDE_OPUS_1M_MODEL
  ) {
    return "medium";
  }
  if (normalizedModel.includes("opus")) {
    return "high";
  }
  if (normalizedModel.includes("sonnet")) {
    return "high";
  }
  return "medium";
}

const STAVE_OWNED_CODEX_EFFORT_MODELS = new Set([
  "gpt-6.1-sol",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
]);

export function resolveDefaultCodexEffortForModel(args: {
  model: string;
}): NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]> {
  const model = args.model.trim();
  // Stave owns the composer default for Sol 6.1, Sol 6, Terra, and Luna. A
  // fetched App Server catalog must not replace those. Every other model
  // still prefers the catalog recommendation below.
  if (STAVE_OWNED_CODEX_EFFORT_MODELS.has(model)) {
    const ownedDefault = getModelCapability({ model })?.defaultCodexReasoningEffort;
    if (ownedDefault) {
      return ownedDefault;
    }
  }

  // Codex's own recommendation for the model, from the live App Server
  // catalog (`model/list.defaultReasoningEffort`, registered via
  // registerDynamicDefaultReasoningEffort). The dynamic value wins when
  // present since it reflects the installed Codex binary's current
  // recommendation. The static MODEL_CAPABILITIES entry is the fallback
  // before that catalog has been fetched.
  const dynamicDefault = dynamicDefaultReasoningEfforts.get(model);
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

  // No known Codex recommendation (e.g. a legacy or unrecognized model id).
  // Fall back to the same "medium" baseline Stave has always used.
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
 * The Codex counterpart of `resolveClaudeEffortForModelSwitch`.
 *
 * An effort the user actually tuned follows them onto the next model; only an
 * effort still parked on the previous model's default is re-derived. Adopting
 * the next model's default unconditionally is what made a Codex model switch
 * look like it "reset" the effort: switching to a model whose runtime
 * recommendation is "low" (what codex-cli reports for some models) silently
 * replaced a deliberately chosen "ultra" on every read, because the composer
 * re-derives this value continuously rather than storing it.
 *
 * Callers still clamp the result to the target model's supported scale.
 */
export function resolveCodexEffortForModelSwitch(args: {
  previousModel: string;
  nextModel: string;
  currentEffort: NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>;
}): NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]> {
  const previousDefaultEffort = resolveDefaultCodexEffortForModel({
    model: args.previousModel,
  });
  if (args.currentEffort !== previousDefaultEffort) {
    return args.currentEffort;
  }
  return resolveDefaultCodexEffortForModel({ model: args.nextModel });
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
 * `resolveDefaultCodexEffortForModel` so Stave prefers Codex's own
 * recommendation over the static fallback once the App Server catalog has
 * been fetched. Sol, Terra, and Luna keep Stave's static default.
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

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Plain URL of the published price list the numbers were read from. */
  source: string;
  /** ISO date the price list was checked. */
  asOf: string;
  /** Promotional or scope caveats, when the published page carries one. */
  note?: string;
}

const CLAUDE_PRICING_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/pricing";
const CODEX_PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";

/**
 * Standard-tier list prices in USD per million tokens. Models without a
 * published price stay undefined so the UI falls back to the tier label
 * instead of inventing a number. Runtime-catalog providers (Cursor, Kiro)
 * bill through their own plans and are intentionally absent.
 */
export const MODEL_PRICING: Partial<Record<string, ModelPrice>> = {
  [CLAUDE_FABLE_MODEL]: {
    inputPerMTok: 10,
    outputPerMTok: 50,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  [DEFAULT_CLAUDE_OPUS_MODEL]: {
    inputPerMTok: 4,
    outputPerMTok: 20,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-23",
  },
  [DEFAULT_CLAUDE_OPUS_1M_MODEL]: {
    inputPerMTok: 4,
    outputPerMTok: 20,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-23",
    get note() { return i18n.t("providers:modelCatalog.theMContextWindowBillsAt"); },
  },
  "claude-opus-5": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  "claude-opus-5[1m]": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  [DEFAULT_CLAUDE_SONNET_MODEL]: {
    inputPerMTok: 2,
    outputPerMTok: 10,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-28",
    get note() { return i18n.t("providers:modelCatalog.perTokenPriceMatchesSonnetThe"); },
  },
  [DEFAULT_CLAUDE_SONNET_1M_MODEL]: {
    inputPerMTok: 2,
    outputPerMTok: 10,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-28",
    get note() { return i18n.t("providers:modelCatalog.theMContextWindowBillsAt"); },
  },
  "claude-sonnet-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  "claude-sonnet-5[1m]": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-14",
    get note() { return i18n.t("providers:modelCatalog.theMContextWindowBillsAt"); },
  },
  [DEFAULT_CLAUDE_HAIKU_MODEL]: {
    inputPerMTok: 1,
    outputPerMTok: 5,
    source: CLAUDE_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  "gpt-6-astra": {
    inputPerMTok: 10,
    outputPerMTok: 50,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  [DEFAULT_CODEX_MODEL]: {
    inputPerMTok: 2,
    outputPerMTok: 10,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-30",
    get note() { return i18n.t("providers:modelCatalog.standardPriceBelowTheKInput"); },
  },
  "gpt-6-sol": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-23",
    get note() { return i18n.t("providers:modelCatalog.standardPriceBelowTheKInputVariantca1656d7"); },
  },
  "gpt-6-luna": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-23",
  },
  "gpt-5.6-sol": {
    inputPerMTok: 4,
    outputPerMTok: 20,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-14",
    get note() { return i18n.t("providers:modelCatalog.promotionalPricePublishedThroughAtLeast"); },
  },
  "gpt-5.6-terra": {
    inputPerMTok: 2,
    outputPerMTok: 12,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  "gpt-5.6-luna": {
    inputPerMTok: 0.2,
    outputPerMTok: 1.2,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-14",
  },
  "gpt-5.5": {
    inputPerMTok: 5,
    outputPerMTok: 30,
    source: CODEX_PRICING_SOURCE,
    asOf: "2026-09-14",
    get note() { return i18n.t("providers:modelCatalog.standardPriceBelowTheKContext"); },
  },
};

export function getModelPrice(args: { model: string }): ModelPrice | null {
  return MODEL_PRICING[args.model.trim()] ?? null;
}

function formatUsdPerMTok(value: number) {
  return Number.isInteger(value)
    ? `$${value}`
    : `$${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/** `$5 / $25` (input / output per million tokens), or null when unpriced. */
export function formatModelPrice(model: string): string | null {
  const price = getModelPrice({ model });
  if (!price) {
    return null;
  }
  return `${formatUsdPerMTok(price.inputPerMTok)} / ${formatUsdPerMTok(price.outputPerMTok)}`;
}

export function toHumanModelName(args: { model: string }) {
  // 1. Check dynamic registry first (server-provided names)
  const dynamic = dynamicDisplayNames.get(args.model);
  if (dynamic) {
    return dynamic;
  }

  // 2. Static known names
  const known: Record<string, string> = {
    [CLAUDE_FABLE_MODEL]: "Claude Fable 5.1",
    "claude-fable-5": "Claude Fable 5",
    [DEFAULT_CLAUDE_OPUS_MODEL]: "Claude Opus 5.5",
    [DEFAULT_CLAUDE_OPUS_1M_MODEL]: "Claude Opus 5.5 (1M)",
    // Legacy labels kept so historical chat/turn records still render a
    // recognizable name after the preset options migrated.
    [DEFAULT_CLAUDE_OPUS_FALLBACK_MODEL]: "Claude Opus 4.8",
    [DEFAULT_CLAUDE_OPUS_1M_FALLBACK_MODEL]: "Claude Opus 4.8 (1M)",
    "claude-opus-5": "Claude Opus 5",
    "claude-opus-5[1m]": "Claude Opus 5 (1M)",
    "claude-opus-4-7": "Claude Opus 4.7",
    "claude-opus-4-7[1m]": "Claude Opus 4.7 (1M)",
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-opus-4-6[1m]": "Claude Opus 4.6 (1M)",
    opusplan: "Claude Opus Plan",
    [DEFAULT_CLAUDE_SONNET_MODEL]: "Claude Sonnet 5.5",
    [DEFAULT_CLAUDE_SONNET_1M_MODEL]: "Claude Sonnet 5.5 (1M)",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-sonnet-5[1m]": "Claude Sonnet 5 (1M)",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-sonnet-4-6[1m]": "Claude Sonnet 4.6 (1M)",
    [DEFAULT_CLAUDE_HAIKU_MODEL]: "Claude Haiku 4.5",
    "gpt-6-astra": "GPT-6 Astra",
    [DEFAULT_CODEX_MODEL]: "GPT-6.1 Sol",
    "gpt-6-sol": "GPT-6 Sol",
    "gpt-6-luna": "GPT-6 Luna",
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

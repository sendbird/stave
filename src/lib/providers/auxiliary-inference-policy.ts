import { snapshotProviderAccounts, type ProviderAccountSelection } from "./provider-account-selection";
import { z } from "zod";
import {
  buildModelEffortRuntimeOverrides,
  isModelEffort,
  modelAcceptsExplicitEffort,
  type ModelEffort,
} from "@/lib/providers/model-effort";
import {
  inferProviderIdFromModel,
  resolveTierModel,
  upgradePinnedHaikuModel,
} from "@/lib/providers/model-catalog";
import type {
  ManagedExecutionProviderId,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

/**
 * Background ("auxiliary") inference lanes.
 *
 * Every lane here is a model call Stave makes on the user's behalf that is not
 * the user's own turn. They are individually small and collectively the largest
 * source of surprise spend, because several of them fire on the same
 * `turn.completed` event and none of them used to be visible or switchable.
 */
export const AUX_LANES = [
  "intentGuard",
  "turnSummary",
  "taskName",
  "utility",
  "prDescription",
  "prePrReview",
  "inlineCompletion",
] as const;

/**
 * Delegated delegated tasks are deliberately absent. Their runtime options are
 * assembled entirely in the main process (`delegated-task-host-port.ts`), which has
 * no mirror of renderer settings, so a lane here would render a switch that
 * cannot take effect. Add it together with a main-process settings mirror.
 */
export type AuxLane = (typeof AUX_LANES)[number];

export type AuxLaneProviderId = ManagedExecutionProviderId;

/**
 * One lane's settings. The three model fields are exceptions to the shared
 * default (`AuxInferenceDefault`): a present value is an explicit override,
 * an absent key inherits. They are never `null`.
 */
export interface AuxLaneConfig {
  /** Off means the lane never runs; its non-AI fallback (if any) still does. */
  enabled: boolean;
  /** Override: always run this lane on this provider. Absent inherits. */
  providerId?: AuxLaneProviderId;
  /** Override: always run this lane on this model. Absent inherits. */
  model?: string;
  /** Override: second attempt for lanes that keep one. Absent inherits. */
  fallbackModel?: string;
  /** `undefined` means "follow the model's own default effort". */
  effort?: ModelEffort;
  /** Task naming: stop suggesting after this many user turns. */
  maxUserTurns?: number;
  /** Utility inference: cap the provider fan-out on a parse failure. */
  maxProviderAttempts?: number;
  /** Intent guard: skip when the diff is byte-identical to the last check. */
  onlyWhenDiffChanged?: boolean;
  /** Intent guard: skip a turn that changed no files. */
  onlyAfterFileEdits?: boolean;
  /** Turn summary: skip a turn with no assistant text to summarize. */
  skipWithoutAssistantText?: boolean;
}

export type AuxiliaryInferencePolicy = Record<AuxLane, AuxLaneConfig>;

/** `auto` follows the task's own provider, and Claude when there is none. */
export type AuxInferenceDefaultProviderId = "auto" | AuxLaneProviderId;

/**
 * The shared "utility model" every Background AI lane uses unless the lane
 * overrides it. `model: null` is automatic: the resolved provider's light
 * tier, or the runtime's own default for a lane whose output quality the user
 * reads directly (pre-PR review). A set model always belongs to `providerId`.
 */
export interface AuxInferenceDefault {
  providerId: AuxInferenceDefaultProviderId;
  model: string | null;
}

export const DEFAULT_AUX_INFERENCE_DEFAULT: AuxInferenceDefault = {
  providerId: "auto",
  model: null,
};

/**
 * Lanes default to the cheapest model that can do the job. The point of the
 * defaults is that no lane silently inherits the user's expensive primary
 * model — a background summary must never cost what a real turn costs.
 *
 * `null` model means "keep the runtime's own default", used where the runtime
 * default is already the cheap choice or where the lane's quality genuinely
 * matters to the user's output (pre-PR review).
 */
export const DEFAULT_AUXILIARY_INFERENCE_POLICY: AuxiliaryInferencePolicy = {
  intentGuard: {
    enabled: true,
    onlyWhenDiffChanged: true,
    onlyAfterFileEdits: true,
  },
  turnSummary: {
    enabled: true,
    skipWithoutAssistantText: true,
  },
  taskName: { enabled: true, maxUserTurns: 1 },
  utility: { enabled: true, maxProviderAttempts: 2 },
  prDescription: { enabled: true },
  prePrReview: { enabled: true },
  // Off by default: it fires on a ~100-200 ms typing pause with up to 12K
  // characters of surrounding code and no reusable prompt prefix, so on a
  // metered plan it is the one lane that can outspend the user's own turns.
  inlineCompletion: { enabled: false },
};

/**
 * Lanes that fall back to the *other* managed provider when their own model is
 * unavailable. Without this a workspace whose provider CLI is not installed
 * would silently never produce a result, which is how the previous standalone
 * turn-summary settings behaved (one model per provider) by design.
 */
const CROSS_PROVIDER_FALLBACK_LANES = new Set<AuxLane>(["turnSummary"]);

/** Whether a lane makes a second attempt, so its override offers a fallback model. */
export function auxLaneHasFallbackModel(lane: AuxLane) {
  return CROSS_PROVIDER_FALLBACK_LANES.has(lane);
}

/** Lanes whose default model is the provider's light tier, resolved lazily. */
const LIGHT_TIER_LANES = new Set<AuxLane>([
  "intentGuard",
  "turnSummary",
  "taskName",
  "utility",
  "prDescription",
  "inlineCompletion",
]);

const AuxLaneConfigSchema = z
  .object({
    enabled: z.boolean(),
    providerId: z.enum(["claude-code", "codex"]).optional(),
    // `null` is read as "inherit" so a settings export from before the shared
    // default still imports; normalization drops it.
    model: z.string().trim().max(200).nullable().optional(),
    fallbackModel: z.string().trim().max(200).nullable().optional(),
    effort: z
      .enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
      .optional(),
    maxUserTurns: z.number().int().min(0).max(10).optional(),
    maxProviderAttempts: z.number().int().min(1).max(4).optional(),
    onlyWhenDiffChanged: z.boolean().optional(),
    onlyAfterFileEdits: z.boolean().optional(),
    skipWithoutAssistantText: z.boolean().optional(),
  })
  .strict();

export const AuxiliaryInferencePolicySchema = z.record(
  z.enum(AUX_LANES),
  AuxLaneConfigSchema,
) as z.ZodType<AuxiliaryInferencePolicy>;

export const AuxInferenceDefaultSchema = z
  .object({
    providerId: z.enum(["auto", "claude-code", "codex"]),
    model: z.string().trim().max(200).nullable(),
  })
  .strict() as z.ZodType<AuxInferenceDefault>;

/** A model override, or `undefined` for "inherit" (absent, `null`, blank, junk). */
function normalizeModelValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  // A lane pinned to Haiku 4.5 before Haiku 5.5 shipped moves onto 5.5.
  return trimmed.length > 0 ? upgradePinnedHaikuModel(trimmed) : undefined;
}

function managedProviderOfModel(model: string): AuxLaneProviderId {
  return inferProviderIdFromModel({ model }) === "codex" ? "codex" : "claude-code";
}

/**
 * Rebuild the shared default from persisted input. A model always carries
 * its own provider: a saved model with an `auto` or mismatched provider takes
 * the model's provider, so the pair never disagrees at resolution time.
 */
export function normalizeAuxInferenceDefault(raw: unknown): AuxInferenceDefault {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_AUX_INFERENCE_DEFAULT };
  }
  const candidate = raw as Record<string, unknown>;
  const model = normalizeModelValue(candidate.model) ?? null;
  const providerId: AuxInferenceDefaultProviderId =
    candidate.providerId === "claude-code" || candidate.providerId === "codex"
      ? candidate.providerId
      : "auto";
  if (model) {
    return { providerId: managedProviderOfModel(model), model };
  }
  return { providerId, model: null };
}

function normalizeLane(lane: AuxLane, raw: unknown): AuxLaneConfig {
  const fallback = DEFAULT_AUXILIARY_INFERENCE_POLICY[lane];
  if (!raw || typeof raw !== "object") {
    return { ...fallback };
  }
  const candidate = raw as Record<string, unknown>;
  const providerId =
    candidate.providerId === "claude-code" || candidate.providerId === "codex"
      ? candidate.providerId
      : undefined;
  const effort = isModelEffort(
    typeof candidate.effort === "string" ? candidate.effort : undefined,
  )
    ? (candidate.effort as ModelEffort)
    : undefined;
  const numberOrFallback = (
    value: unknown,
    fallbackValue: number | undefined,
  ) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : fallbackValue;
  const booleanOrFallback = (
    value: unknown,
    fallbackValue: boolean | undefined,
  ) => (typeof value === "boolean" ? value : fallbackValue);

  const model = normalizeModelValue(candidate.model);
  const fallbackModel = auxLaneHasFallbackModel(lane)
    ? normalizeModelValue(candidate.fallbackModel)
    : undefined;
  const next: AuxLaneConfig = {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : fallback.enabled,
    ...(providerId ? { providerId } : {}),
    ...(model ? { model } : {}),
    ...(fallbackModel ? { fallbackModel } : {}),
    ...(effort ? { effort } : {}),
  };

  const maxUserTurns = numberOrFallback(
    candidate.maxUserTurns,
    fallback.maxUserTurns,
  );
  if (maxUserTurns !== undefined) {
    next.maxUserTurns = maxUserTurns;
  }
  const maxProviderAttempts = numberOrFallback(
    candidate.maxProviderAttempts,
    fallback.maxProviderAttempts,
  );
  if (maxProviderAttempts !== undefined) {
    next.maxProviderAttempts = Math.max(1, maxProviderAttempts);
  }
  const onlyWhenDiffChanged = booleanOrFallback(
    candidate.onlyWhenDiffChanged,
    fallback.onlyWhenDiffChanged,
  );
  if (onlyWhenDiffChanged !== undefined) {
    next.onlyWhenDiffChanged = onlyWhenDiffChanged;
  }
  const onlyAfterFileEdits = booleanOrFallback(
    candidate.onlyAfterFileEdits,
    fallback.onlyAfterFileEdits,
  );
  if (onlyAfterFileEdits !== undefined) {
    next.onlyAfterFileEdits = onlyAfterFileEdits;
  }
  const skipWithoutAssistantText = booleanOrFallback(
    candidate.skipWithoutAssistantText,
    fallback.skipWithoutAssistantText,
  );
  if (skipWithoutAssistantText !== undefined) {
    next.skipWithoutAssistantText = skipWithoutAssistantText;
  }
  return next;
}

/**
 * Rebuild a complete, structurally stable policy from persisted input.
 *
 * Callers select `settings.auxiliaryInferencePolicy[lane]` directly from the
 * Zustand store, so every lane object must exist after rehydrate — a selector
 * that had to fall back to a literal would allocate a new object on every
 * render and re-render the whole subscriber tree.
 */
export function normalizeAuxiliaryInferencePolicy(
  raw: unknown,
): AuxiliaryInferencePolicy {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return AUX_LANES.reduce((accumulator, lane) => {
    accumulator[lane] = normalizeLane(lane, source[lane]);
    return accumulator;
  }, {} as AuxiliaryInferencePolicy);
}

/**
 * One-time migration of the standalone turn-summary model settings into the
 * `turnSummary` lane. Returns the lane patch, or `null` when there is nothing
 * to carry over.
 */
export function migrateLegacyTurnSummaryModels(args: {
  primaryModel?: unknown;
  fallbackModel?: unknown;
}): Pick<AuxLaneConfig, "model" | "fallbackModel"> | null {
  const model = normalizeModelValue(args.primaryModel);
  const fallbackModel = normalizeModelValue(args.fallbackModel);
  if (!model && !fallbackModel) {
    return null;
  }
  return {
    ...(model ? { model } : {}),
    ...(fallbackModel ? { fallbackModel } : {}),
  };
}

/** Whether a lane overrides any part of the shared default. */
export function auxLaneHasOverride(config: AuxLaneConfig) {
  return Boolean(config.providerId || config.model || config.fallbackModel);
}

/**
 * Claude Haiku 4.5 rejects an explicit `effort` with a 400, so the field is
 * dropped rather than clamped for it.
 */
export function supportsExplicitEffort(args: {
  providerId: ProviderId;
  model: string;
}) {
  return modelAcceptsExplicitEffort(args);
}

/**
 * Where a resolved value came from: the lane's own override, the shared
 * default, the task's provider (shared `auto`), or the built-in default.
 */
export type AuxLaneValueSource = "override" | "shared" | "task" | "automatic";

export interface AuxLaneRuntime {
  lane: AuxLane;
  config: AuxLaneConfig;
  enabled: boolean;
  providerId: AuxLaneProviderId;
  providerSource: AuxLaneValueSource;
  /** `null` means "let the runtime choose", which is a valid resolution. */
  model: string | null;
  modelSource: AuxLaneValueSource;
  fallbackModel: string | null;
  effortOverrides: Pick<
    ProviderRuntimeOptions,
    "claudeEffort" | "codexReasoningEffort"
  >;
}

function resolveLaneProvider(args: {
  config: AuxLaneConfig;
  shared: AuxInferenceDefault;
  activeProviderId?: ProviderId | null;
}): { providerId: AuxLaneProviderId; source: AuxLaneValueSource } {
  if (args.config.providerId) {
    return { providerId: args.config.providerId, source: "override" };
  }
  if (args.shared.providerId !== "auto") {
    return { providerId: args.shared.providerId, source: "shared" };
  }
  if (
    args.activeProviderId === "claude-code" ||
    args.activeProviderId === "codex"
  ) {
    return { providerId: args.activeProviderId, source: "task" };
  }
  return { providerId: "claude-code", source: "automatic" };
}

/**
 * Resolve one lane into the concrete provider, model and effort overrides a
 * call site should use. Every value is the lane's override when it has one,
 * else the shared default:
 *
 * - provider: lane override -> shared provider -> (shared `auto`) the task's
 *   managed provider -> Claude.
 * - model: lane override -> shared model, when it belongs to the resolved
 *   provider (a lane that overrides only its provider never receives the
 *   other provider's model id) -> automatic (light tier, or the runtime's own
 *   default for pre-PR review).
 */
export function resolveAuxLaneRuntime(args: {
  lane: AuxLane;
  policy: AuxiliaryInferencePolicy;
  shared: AuxInferenceDefault;
  activeProviderId?: ProviderId | null;
}): AuxLaneRuntime {
  const config =
    args.policy[args.lane] ?? DEFAULT_AUXILIARY_INFERENCE_POLICY[args.lane];
  const shared = args.shared ?? DEFAULT_AUX_INFERENCE_DEFAULT;
  const { providerId, source: providerSource } = resolveLaneProvider({
    config,
    shared,
    activeProviderId: args.activeProviderId,
  });
  const overrideModel = config.model?.trim();
  const sharedModel =
    shared.model?.trim() && shared.providerId === providerId
      ? shared.model.trim()
      : null;
  const model =
    overrideModel ||
    sharedModel ||
    (LIGHT_TIER_LANES.has(args.lane)
      ? resolveTierModel({ tier: "light", providerId })
      : null);
  const modelSource: AuxLaneValueSource = overrideModel
    ? "override"
    : sharedModel
      ? "shared"
      : "automatic";
  const fallbackModel =
    config.fallbackModel?.trim() ||
    (CROSS_PROVIDER_FALLBACK_LANES.has(args.lane)
      ? resolveTierModel({
          tier: "light",
          providerId: providerId === "codex" ? "claude-code" : "codex",
        })
      : null);
  const effortOverrides =
    model && config.effort && supportsExplicitEffort({ providerId, model })
      ? buildModelEffortRuntimeOverrides({
          providerId,
          model,
          effort: config.effort,
        })
      : {};

  return {
    lane: args.lane,
    config,
    enabled: config.enabled,
    providerId,
    providerSource,
    model,
    modelSource,
    fallbackModel,
    effortOverrides,
  };
}

/**
 * Runtime options shared by every read-only auxiliary call: no writes, no
 * network, no streaming, no reasoning summaries. Providers that ignore a field
 * simply drop it.
 */
export function buildReadOnlyAuxRuntimeOptions(args: {
  accountSelection?: ProviderAccountSelection;
  providerId: AuxLaneProviderId;
  model?: string | null;
  effortOverrides?: Pick<
    ProviderRuntimeOptions,
    "claudeEffort" | "codexReasoningEffort"
  >;
}): ProviderRuntimeOptions {
  return {
    ...(args.accountSelection ? snapshotProviderAccounts(args.accountSelection) : {}),
    ...(args.model ? { model: args.model } : {}),
    ...(args.effortOverrides ?? {}),
    chatStreamingEnabled: false,
    ...(args.providerId === "claude-code"
      ? {
          claudeAllowedTools: [],
          claudeMaxTurns: 1,
          claudePermissionMode: "dontAsk" as const,
          claudeAgentProgressSummaries: false,
          // No fast mode: it is premium-priced on the models that honor it,
          // and a background lane must never cost more per token than the
          // user's own turn.
        }
      : {
          codexApprovalPolicy: "never" as const,
          codexFileAccess: "read-only" as const,
          codexNetworkAccess: false,
          codexWebSearch: "disabled" as const,
          codexReasoningSummary: "none" as const,
          codexShowRawReasoning: false,
        }),
  };
}

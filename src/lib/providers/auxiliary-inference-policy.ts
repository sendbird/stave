import { z } from "zod";
import {
  buildModelEffortRuntimeOverrides,
  isModelEffort,
  type ModelEffort,
} from "@/lib/providers/model-effort";
import { resolveTierModel } from "@/lib/providers/model-catalog";
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
 * Delegated child tasks are deliberately absent. Their runtime options are
 * assembled entirely in the main process (`child-task-host-port.ts`), which has
 * no mirror of renderer settings, so a lane here would render a switch that
 * cannot take effect. Add it together with a main-process settings mirror.
 */
export type AuxLane = (typeof AUX_LANES)[number];

export type AuxLaneProviderId = ManagedExecutionProviderId;

export interface AuxLaneConfig {
  /** Off means the lane never runs; its non-AI fallback (if any) still does. */
  enabled: boolean;
  /** `undefined` means "follow the lane's provider fall-through". */
  providerId?: AuxLaneProviderId;
  /** `null` means "let the runtime pick its own default model". */
  model?: string | null;
  /** Second attempt for lanes that keep a fallback model. */
  fallbackModel?: string | null;
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
    model: null,
    onlyWhenDiffChanged: true,
    onlyAfterFileEdits: true,
  },
  turnSummary: {
    enabled: true,
    model: null,
    fallbackModel: null,
    skipWithoutAssistantText: true,
  },
  taskName: { enabled: true, model: null, maxUserTurns: 1 },
  utility: { enabled: true, model: null, maxProviderAttempts: 2 },
  prDescription: { enabled: true, model: null },
  prePrReview: { enabled: true, model: null },
  inlineCompletion: { enabled: true, model: null },
};

/**
 * Lanes that fall back to the *other* managed provider when their own model is
 * unavailable. Without this a workspace whose provider CLI is not installed
 * would silently never produce a result, which is how the previous standalone
 * turn-summary settings behaved (one model per provider) by design.
 */
const CROSS_PROVIDER_FALLBACK_LANES = new Set<AuxLane>(["turnSummary"]);

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

function normalizeModelValue(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const numberOrFallback = (value: unknown, fallbackValue: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : fallbackValue;
  const booleanOrFallback = (value: unknown, fallbackValue: boolean | undefined) =>
    typeof value === "boolean" ? value : fallbackValue;

  const next: AuxLaneConfig = {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : fallback.enabled,
    model: normalizeModelValue(candidate.model) ?? fallback.model ?? null,
    ...(providerId ? { providerId } : {}),
    ...(effort ? { effort } : {}),
  };

  if ("fallbackModel" in fallback || candidate.fallbackModel !== undefined) {
    next.fallbackModel =
      normalizeModelValue(candidate.fallbackModel) ??
      fallback.fallbackModel ??
      null;
  }
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
  return { model: model ?? null, fallbackModel: fallbackModel ?? null };
}

/**
 * Claude's Haiku models reject an explicit `effort` with a 400, so the field is
 * dropped rather than clamped for them.
 */
export function supportsExplicitEffort(args: {
  providerId: ProviderId;
  model: string;
}) {
  return !(
    args.providerId === "claude-code" && /^claude-haiku-/.test(args.model.trim())
  );
}

export interface AuxLaneRuntime {
  lane: AuxLane;
  config: AuxLaneConfig;
  enabled: boolean;
  providerId: AuxLaneProviderId;
  /** `null` means "let the runtime choose", which is a valid resolution. */
  model: string | null;
  fallbackModel: string | null;
  effortOverrides: Pick<
    ProviderRuntimeOptions,
    "claudeEffort" | "codexReasoningEffort"
  >;
}

function resolveLaneProviderId(args: {
  config: AuxLaneConfig;
  legacyProviderId?: string | null;
  activeProviderId?: ProviderId | null;
}): AuxLaneProviderId {
  if (args.config.providerId) {
    return args.config.providerId;
  }
  if (
    args.legacyProviderId === "claude-code" ||
    args.legacyProviderId === "codex"
  ) {
    return args.legacyProviderId;
  }
  if (
    args.activeProviderId === "claude-code" ||
    args.activeProviderId === "codex"
  ) {
    return args.activeProviderId;
  }
  return "claude-code";
}

/**
 * Resolve one lane into the concrete provider, model and effort overrides a
 * call site should use.
 *
 * Provider fall-through is lane override -> the lane's legacy setting (the
 * pre-existing `prePrReviewProvider` / `utilityInferenceProvider` choices, so an
 * upgrade keeps behaving as configured) -> the task's active managed provider ->
 * Claude.
 */
export function resolveAuxLaneRuntime(args: {
  lane: AuxLane;
  policy: AuxiliaryInferencePolicy;
  legacyProviderId?: string | null;
  activeProviderId?: ProviderId | null;
}): AuxLaneRuntime {
  const config =
    args.policy[args.lane] ?? DEFAULT_AUXILIARY_INFERENCE_POLICY[args.lane];
  const providerId = resolveLaneProviderId({
    config,
    legacyProviderId: args.legacyProviderId,
    activeProviderId: args.activeProviderId,
  });
  const model =
    config.model?.trim() ||
    (LIGHT_TIER_LANES.has(args.lane)
      ? resolveTierModel({ tier: "light", providerId })
      : null);
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
    model,
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
  providerId: AuxLaneProviderId;
  model?: string | null;
  effortOverrides?: Pick<
    ProviderRuntimeOptions,
    "claudeEffort" | "codexReasoningEffort"
  >;
}): ProviderRuntimeOptions {
  return {
    ...(args.model ? { model: args.model } : {}),
    ...(args.effortOverrides ?? {}),
    chatStreamingEnabled: false,
    ...(args.providerId === "claude-code"
      ? {
          claudeAllowedTools: [],
          claudeMaxTurns: 1,
          claudePermissionMode: "dontAsk" as const,
          claudeAgentProgressSummaries: false,
          claudeFastMode: true,
        }
      : {
          codexApprovalPolicy: "never" as const,
          codexFileAccess: "read-only" as const,
          codexNetworkAccess: false,
          codexWebSearch: "disabled" as const,
          codexReasoningSummary: "none" as const,
          codexShowRawReasoning: false,
          codexPlanMode: false,
          codexFastMode: true,
        }),
  };
}

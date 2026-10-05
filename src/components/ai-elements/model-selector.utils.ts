import { i18n } from "@/i18n/runtime";
import { getClaudeModelVersionGuidance } from "@/lib/providers/claude-model-requirements";
import {
  getSdkModelOptions,
  inferProviderIdFromModel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { DEFAULT_MODEL_SHORTCUT_KEYS } from "@/lib/providers/model-shortcuts";
import type { ProviderId, ProviderModelCatalogEntry } from "@/lib/providers/provider.types";

export interface ModelSelectorOption {
  key: string;
  providerId: ProviderId;
  model: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  isAuto?: boolean;
  available: boolean;
  defaultEffort?: string;
  supportedEfforts?: readonly string[];
  /** Sub-group under the runtime, such as an API connection's "<name> · API billing". */
  group?: string;
  /** Short tag beside the label, such as "experimental". */
  badge?: string;
}

export function shouldOpenModelSelector(args: {
  openToken?: string | number;
  disabled?: boolean;
  lastHandledOpenToken?: string | number;
}) {
  if (args.openToken === undefined || args.disabled) {
    return false;
  }
  return args.openToken !== args.lastHandledOpenToken;
}

const DEFAULT_RECOMMENDED_MODEL_SELECTOR_KEYS = [
  ...DEFAULT_MODEL_SHORTCUT_KEYS.slice(0, 4),
] as const;

function buildModelSelectorOption(args: {
  providerId: ProviderId;
  model: string;
  label?: string;
  available?: boolean;
  description?: string;
  isDefault?: boolean;
  defaultEffort?: string;
  supportedEfforts?: readonly string[];
  group?: string;
  badge?: string;
}): ModelSelectorOption {
  return {
    key: `${args.providerId}:${args.model}`,
    providerId: args.providerId,
    model: args.model,
    label: args.label ?? toHumanModelName({ model: args.model }),
    description: [
      args.description,
      args.providerId === "claude-code"
        ? getClaudeModelVersionGuidance(args.model)
        : args.providerId === "codex" && !args.description ? i18n.t("composer:modelSelectorUtils.extraCopy63") : undefined,
    ].filter(Boolean).join(" ") || undefined,
    isDefault: args.isDefault,
    defaultEffort: args.defaultEffort,
    supportedEfforts: args.supportedEfforts,
    available: args.available ?? true,
    ...(args.group ? { group: args.group } : {}),
    ...(args.badge ? { badge: args.badge } : {}),
  };
}

export function buildModelSelectorValue(args: {
  model: string;
  providerId?: ProviderId;
  label?: string;
  description?: string;
  available?: boolean;
}): ModelSelectorOption {
  const model = args.model.trim();
  return buildModelSelectorOption({
    providerId:
      args.providerId ??
      (model ? inferProviderIdFromModel({ model }) : "claude-code"),
    model: args.model,
    // An empty model is "follow the runtime default", not a Claude row. Inferring
    // a provider mark from "" made Background AI look pinned to Claude.
    label: args.label ?? (model ? undefined : i18n.t("composer:modelSelectorUtils.label")),
    available: args.available,
    description: args.description,
  });
}

export function buildAutoModelSelectorOption(args: {
  providerId: ProviderId;
  available?: boolean;
  /**
   * The route the last Auto decision for this task resolved to, so the pill
   * reads `Auto → Opus 5 · High` and its tooltip carries the rule that fired.
   * Absent before the first routed turn, when only the stance is known.
   */
  routed?: { label: string; description: string } | null;
  stanceLabel?: string;
  /** A send is waiting on the classifier; the previous route no longer applies. */
  pending?: boolean;
}): ModelSelectorOption {
  return {
    key: "auto",
    providerId: args.providerId,
    model: "",
    label: args.pending
      ? i18n.t("composer:modelSelectorUtils.label2")
      : args.routed
        ? i18n.t("composer:modelSelectorUtils.label3", { value1: args.routed.label })
        : args.stanceLabel
          ? i18n.t("composer:modelSelectorUtils.label4", { value1: args.stanceLabel })
          : i18n.t("composer:modelSelectorUtils.label5"),
    description: args.pending
      ? i18n.t("composer:modelSelectorUtils.description")
      : (args.routed?.description ??
        i18n.t("composer:modelSelectorUtils.description2")),
    isAuto: true,
    available: args.available ?? true,
  };
}

export interface ModelEnrichment {
  label?: string;
  description?: string;
  isDefault?: boolean;
  defaultEffort?: string;
  supportedEfforts?: readonly string[];
  group?: string;
  badge?: string;
}

/** Picker enrichment keyed `${providerId}:${model}` from each runtime's catalog entries. */
export function buildModelEnrichmentFromCatalogs(
  catalogs: Partial<Record<ProviderId, { entries: readonly ProviderModelCatalogEntry[] }>>,
): Map<string, ModelEnrichment> | undefined {
  const map = new Map<string, ModelEnrichment>();
  for (const [providerId, catalog] of Object.entries(catalogs)) {
    for (const entry of catalog?.entries ?? []) {
      const id = entry.model.trim();
      if (!id) continue;
      map.set(`${providerId}:${id}`, {
        label: entry.displayName || undefined,
        description: entry.description || undefined,
        isDefault: entry.isDefault || undefined,
        defaultEffort: entry.defaultEffort || undefined,
        supportedEfforts: entry.supportedEfforts,
        group: entry.group,
        badge: entry.badge,
      });
    }
  }
  return map.size > 0 ? map : undefined;
}

export function buildModelSelectorOptions(args: {
  providerIds: readonly ProviderId[];
  availabilityByProvider?: Partial<Record<ProviderId, boolean>>;
  modelsByProvider?: Partial<Record<ProviderId, readonly string[]>>;
  enrichmentByModel?: Map<string, ModelEnrichment>;
}): ModelSelectorOption[] {
  return args.providerIds.flatMap((providerId) =>
    (
      args.modelsByProvider?.[providerId] ?? getSdkModelOptions({ providerId })
    ).map((model) => {
      const enrichment =
        args.enrichmentByModel?.get(`${providerId}:${model}`) ??
        args.enrichmentByModel?.get(model);
      return buildModelSelectorOption({
        providerId,
        model,
        label: enrichment?.label,
        available: args.availabilityByProvider?.[providerId] ?? true,
        description: enrichment?.description,
        isDefault: enrichment?.isDefault,
        defaultEffort: enrichment?.defaultEffort,
        supportedEfforts: enrichment?.supportedEfforts,
        group: enrichment?.group,
        badge: enrichment?.badge,
      });
    }),
  );
}

export function buildRecommendedModelSelectorOptions(args: {
  options: readonly ModelSelectorOption[];
  recommendedKeys?: readonly string[];
}): ModelSelectorOption[] {
  const recommendedKeys =
    args.recommendedKeys ?? DEFAULT_RECOMMENDED_MODEL_SELECTOR_KEYS;
  const optionByKey = new Map(
    args.options
      .filter((option) => option.available)
      .map((option) => [option.key, option] as const),
  );

  return recommendedKeys
    .map((key) => optionByKey.get(key))
    .filter((option): option is ModelSelectorOption => option != null);
}

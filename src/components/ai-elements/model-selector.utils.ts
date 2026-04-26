import {
  getSdkModelOptions,
  inferProviderIdFromModel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { DEFAULT_MODEL_SHORTCUT_KEYS } from "@/lib/providers/model-shortcuts";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface ModelSelectorOption {
  key: string;
  providerId: ProviderId;
  model: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  available: boolean;
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
  ...DEFAULT_MODEL_SHORTCUT_KEYS.slice(0, 3),
] as const;

function buildModelSelectorOption(args: {
  providerId: ProviderId;
  model: string;
  available?: boolean;
  description?: string;
  isDefault?: boolean;
}): ModelSelectorOption {
  return {
    key: `${args.providerId}:${args.model}`,
    providerId: args.providerId,
    model: args.model,
    label: toHumanModelName({ model: args.model }),
    description: args.description,
    isDefault: args.isDefault,
    available: args.available ?? true,
  };
}

export function buildModelSelectorValue(args: {
  model: string;
  providerId?: ProviderId;
  available?: boolean;
}): ModelSelectorOption {
  return buildModelSelectorOption({
    providerId:
      args.providerId ?? inferProviderIdFromModel({ model: args.model }),
    model: args.model,
    available: args.available,
  });
}

export interface ModelEnrichment {
  description?: string;
  isDefault?: boolean;
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
      const enrichment = args.enrichmentByModel?.get(model);
      return buildModelSelectorOption({
        providerId,
        model,
        available: args.availabilityByProvider?.[providerId] ?? true,
        description: enrichment?.description,
        isDefault: enrichment?.isDefault,
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

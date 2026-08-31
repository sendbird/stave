import { listProviderIds } from "./model-catalog";
import type { ProviderId } from "./provider.types";

/**
 * User overrides for which catalog models the model selector offers by default.
 *
 * The selector's baseline is "current models only": one entry per model lineage
 * (see `listFeaturedModelOptions`). A runtime catalog can advertise dozens of
 * historical models, and listing all of them by default turns the picker into an
 * archive. These overrides are the escape hatch in both directions — `true`
 * pins a model the baseline would drop, `false` removes one it would keep.
 *
 * Sparse on purpose: an absent entry means "follow the baseline", so a provider
 * shipping a new model shows it without a migration.
 */
export type ProviderModelVisibility = Record<string, boolean>;

export type ModelVisibility = Partial<
  Record<ProviderId, ProviderModelVisibility>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Collapses a provider model id down to the unit the selector shows as one row.
 *
 * Cursor advertises each fast/context/effort combination as its own ACP model
 * id, and Claude ships a `[1m]` twin of every context-capable model. Both are
 * rendered as options *on* a single row, so visibility has to be keyed by the
 * row, not by the variant, or a hidden model would reappear the moment the user
 * flipped one of those switches.
 */
export function getModelVisibilityKey(args: {
  providerId: ProviderId;
  model: string;
}) {
  const model = args.model.trim();
  if (args.providerId === "cursor") {
    return model.split("[")[0]?.trim() || model;
  }
  if (args.providerId === "claude-code") {
    return model.replace(/\[1m\]$/i, "").trim();
  }
  return model;
}

export function normalizeModelVisibility(value: unknown): ModelVisibility {
  if (!isRecord(value)) {
    return {};
  }
  const knownProviderIds = new Set<string>(listProviderIds());
  const normalized: ModelVisibility = {};
  for (const [candidateProviderId, candidate] of Object.entries(value)) {
    if (!knownProviderIds.has(candidateProviderId) || !isRecord(candidate)) {
      continue;
    }
    const providerId = candidateProviderId as ProviderId;
    const entries: ProviderModelVisibility = {};
    for (const [model, visible] of Object.entries(candidate)) {
      if (typeof visible !== "boolean") {
        continue;
      }
      const key = getModelVisibilityKey({ providerId, model });
      if (key) {
        entries[key] = visible;
      }
    }
    if (Object.keys(entries).length > 0) {
      normalized[providerId] = entries;
    }
  }
  return normalized;
}

export function readModelVisibilityOverride(args: {
  visibility?: ModelVisibility;
  providerId: ProviderId;
  model: string;
}): boolean | undefined {
  return args.visibility?.[args.providerId]?.[
    getModelVisibilityKey({ providerId: args.providerId, model: args.model })
  ];
}

/**
 * Writes one override. `visible: undefined` drops it back to the baseline, and
 * an emptied provider record is removed so the stored value never accumulates
 * dead keys.
 */
export function setModelVisibilityOverride(args: {
  visibility?: ModelVisibility;
  providerId: ProviderId;
  model: string;
  visible?: boolean;
}): ModelVisibility {
  const visibility = args.visibility ?? {};
  const key = getModelVisibilityKey({
    providerId: args.providerId,
    model: args.model,
  });
  if (!key) {
    return visibility;
  }
  const current = visibility[args.providerId] ?? {};
  if (current[key] === args.visible) {
    return visibility;
  }
  const next: ProviderModelVisibility = { ...current };
  if (args.visible === undefined) {
    delete next[key];
  } else {
    next[key] = args.visible;
  }
  if (Object.keys(next).length === 0) {
    const { [args.providerId]: _removed, ...rest } = visibility;
    return rest;
  }
  return { ...visibility, [args.providerId]: next };
}

export function clearProviderModelVisibility(args: {
  visibility?: ModelVisibility;
  providerId: ProviderId;
}): ModelVisibility {
  const visibility = args.visibility ?? {};
  if (!visibility[args.providerId]) {
    return visibility;
  }
  const { [args.providerId]: _removed, ...rest } = visibility;
  return rest;
}

export function countHiddenModels(args: {
  visibility?: ModelVisibility;
  providerId: ProviderId;
}) {
  return Object.values(args.visibility?.[args.providerId] ?? {}).filter(
    (visible) => !visible,
  ).length;
}

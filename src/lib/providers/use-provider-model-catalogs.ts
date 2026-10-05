import { i18n } from "@/i18n";
import { useAccountRuntimeOptions, useProviderAccounts } from "./use-provider-accounts";
import { selectedProviderAccount } from "./provider-account-selection";
import { buildApiConnectionCatalogEntries } from "./api-connection-models";
import { useEffect, useMemo, useRef, useState } from "react";
import { registerCursorModelDisplayNames } from "@/lib/providers/cursor-model-id";
import {
  providerReadiness,
  providerReadsAllowed,
  providerSurfaceVisible,
  useProviderReadinessStore,
} from "./provider-readiness-store";
import {
  getSdkModelOptions,
  getProviderDescriptor,
  isAutoModelId,
  isCodexPickerModel,
  listProviderDescriptors,
  registerDynamicDefaultReasoningEfforts,
  registerDynamicDisplayNames,
  registerDynamicSupportedReasoningEfforts,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderModelCatalogEntry,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

const PROVIDER_MODEL_CATALOG_TTL_MS = 5 * 60 * 1000;

export interface ProviderModelCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  models: string[];
  entries: ProviderModelCatalogEntry[];
  detail: string;
  isDynamic: boolean;
}

type CachedProviderModelCatalog = ProviderModelCatalogState & {
  fetchedAt: number;
  generation?: number;
};

const catalogCache = new Map<string, CachedProviderModelCatalog>();
const catalogInflight = new Map<string, Promise<CachedProviderModelCatalog>>();

/** An API connection's pinned models are an exclusive catalog, never merged with native defaults. */
export function configuredGatewayCatalog(args: {
  providerId: ProviderId; runtimeOptions?: ProviderRuntimeOptions;
}): CachedProviderModelCatalog | undefined {
  if (args.providerId !== "claude-code" && args.providerId !== "codex") return undefined;
  const profile = useProviderAccounts.getState().profiles.find(candidate =>
    candidate.providerId === args.providerId && candidate.id === selectedProviderAccount(args.providerId, args.runtimeOptions));
  if (!profile?.gateway) return undefined;
  const entries = buildApiConnectionCatalogEntries({ runtime: args.providerId, profile });
  return {
    status: "ready", models: entries.map((entry) => entry.model), entries,
    detail: i18n.t("providers:useProviderModelCatalogs.modelsPinnedOnTheAPIConnection"),
    isDynamic: true, fetchedAt: Date.now(),
  };
}

function fallbackEntries(providerId: ProviderId): ProviderModelCatalogEntry[] {
  const descriptor = getProviderDescriptor({ providerId });
  return getSdkModelOptions({ providerId }).map((model) => ({
    model,
    displayName: toHumanModelName({ model }),
    description:
      providerId === "codex"
        ? i18n.t("providers:useProviderModelCatalogs.runtimeSupportUnconfirmedYouCanStill")
        : "",
    hidden: false,
    isDefault: model === descriptor.defaultModel,
    defaultEffort: null,
    supportedEfforts: [],
  }));
}

function cacheKey(args: {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  const binaryPath =
    args.providerId === "codex"
      ? args.runtimeOptions?.codexBinaryPath
      : args.providerId === "cursor"
        ? args.runtimeOptions?.cursorBinaryPath
        : args.providerId === "kiro"
          ? args.runtimeOptions?.kiroBinaryPath
          : "";
  return [
    args.providerId,
    selectedProviderAccount(args.providerId, args.runtimeOptions),
    binaryPath?.trim() || "<default-binary>",
    args.cwd?.trim() || "<default-cwd>",
  ].join(":");
}

export function mergeProviderModelCatalogEntries(args: {
  providerId: ProviderId;
  dynamicEntries: readonly ProviderModelCatalogEntry[];
}) {
  const merged = new Map<string, ProviderModelCatalogEntry>();
  const defaultsToAuto =
    getProviderDescriptor({ providerId: args.providerId }).defaultModel ===
    "auto";
  // The `auto` row stands in for the provider's own auto model, so that entry
  // is folded into it instead of being listed twice. It is matched by id
  // family rather than by the runtime's `isDefault`, because `isDefault`
  // mirrors whichever model the session currently has selected and Stave moves
  // that selection itself. Folding on it dropped a different real model id
  // from the catalog after every switch, and a task still pinned to the
  // dropped id rendered from the raw id and reported itself as missing.
  const runtimeAuto = defaultsToAuto
    ? args.dynamicEntries.find(
        (entry) => !entry.hidden && isAutoModelId({ model: entry.model }),
      )
    : undefined;
  for (const entry of fallbackEntries(args.providerId)) {
    merged.set(
      entry.model,
      entry.model === "auto" && runtimeAuto
        ? {
            ...runtimeAuto,
            model: "auto",
            isDefault: true,
          }
        : entry,
    );
  }
  for (const entry of args.dynamicEntries) {
    const model = entry.model.trim();
    // Only the folded entry is dropped. Should the runtime ever advertise more
    // than one auto variant, the rest stay reachable as their own rows rather
    // than disappearing the way the old `isDefault` fold made models disappear.
    if (!model || entry.hidden || model === runtimeAuto?.model.trim()) {
      continue;
    }
    // Codex pickers stay pinned to the primary static catalog.
    // A runtime `model/list` may still advertise previous-generation or
    // experimental IDs; they may enrich the catalog entries but must
    // never add rows of their own.
    if (args.providerId === "codex" && !isCodexPickerModel(model)) {
      continue;
    }
    merged.set(model, {
      ...entry,
      model,
      ...(args.providerId === "codex"
        ? {
            description: [
              "Listed by the current Codex runtime.",
              entry.description,
            ]
              .filter(Boolean)
              .join(" "),
          }
        : {}),
      // `auto` is the default row for these providers; leaving the runtime's
      // moving default set here would reshuffle the picker's featured rows
      // every time the session's selection changed.
      isDefault: defaultsToAuto ? false : entry.isDefault,
    });
  }
  return [...merged.values()];
}

function registerCatalogMetadata(args: {
  providerId: ProviderId;
  entries: readonly ProviderModelCatalogEntry[];
}) {
  if (args.providerId === "cursor") {
    registerCursorModelDisplayNames(
      new Map(
        args.entries.flatMap((entry) =>
          entry.displayName && entry.displayName !== entry.model
            ? [[entry.model, entry.displayName] as const]
            : [],
        ),
      ),
    );
  }
  if (args.providerId !== "codex") {
    return;
  }
  const displayNames = new Map<string, string>();
  const defaultEfforts = new Map<string, string>();
  const supportedEfforts = new Map<string, readonly string[]>();
  for (const entry of args.entries) {
    if (entry.displayName && entry.displayName !== entry.model) {
      displayNames.set(entry.model, entry.displayName);
    }
    if (entry.defaultEffort) {
      defaultEfforts.set(entry.model, entry.defaultEffort);
    }
    if (entry.supportedEfforts.length > 0) {
      supportedEfforts.set(entry.model, entry.supportedEfforts);
    }
  }
  registerDynamicDisplayNames(displayNames);
  registerDynamicDefaultReasoningEfforts(defaultEfforts);
  registerDynamicSupportedReasoningEfforts(supportedEfforts);
}

export async function loadProviderModelCatalog(args: {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
  force?: boolean;
}): Promise<CachedProviderModelCatalog> {
  const gatewayCatalog = configuredGatewayCatalog(args);
  if (gatewayCatalog) return gatewayCatalog;
  const descriptor = listProviderDescriptors().find(
    (candidate) => candidate.id === args.providerId,
  );
  const fallback = fallbackEntries(args.providerId);
  if (descriptor?.modelCatalogSource !== "runtime") {
    return {
      status: "ready",
      models: fallback.map((entry) => entry.model),
      entries: fallback,
      detail: i18n.t("providers:useProviderModelCatalogs.usingTheBuiltInModelCatalog"),
      isDynamic: false,
      fetchedAt: Date.now(),
    };
  }

  const key = cacheKey(args);
  const cached = catalogCache.get(key);
  const generation = providerReadiness(
    args.providerId,
    args.runtimeOptions,
  )?.generation;
  if (!providerReadsAllowed(args.providerId, args.runtimeOptions)) {
    if (cached && providerSurfaceVisible(args.providerId, args.runtimeOptions))
      return {
        ...cached,
        detail:
          i18n.t("providers:useProviderModelCatalogs.statusUnverifiedShowingTheLastModel"),
      };
    catalogCache.delete(key);
    return {
      status: "idle",
      models: [],
      entries: [],
      detail: i18n.t("providers:useProviderModelCatalogs.verifyInstallationAndLoginInSettings"),
      isDynamic: false,
      fetchedAt: 0,
    };
  }
  if (
    !args.force &&
    cached &&
    cached.generation === generation &&
    Date.now() - cached.fetchedAt <= PROVIDER_MODEL_CATALOG_TTL_MS
  ) {
    return cached;
  }
  const inflightKey = `${key}:${generation ?? "default"}`;
  const inflight = catalogInflight.get(inflightKey);
  if (inflight) {
    return inflight;
  }

  const promise = (async (): Promise<CachedProviderModelCatalog> => {
    const getModelCatalog = window.api?.provider?.getModelCatalog;
    if (!getModelCatalog) {
      return {
        status: "ready",
        models: fallback.map((entry) => entry.model),
        entries: fallback,
        detail: i18n.t("providers:useProviderModelCatalogs.usingTheBuiltInModelCatalog"),
        isDynamic: false,
        fetchedAt: Date.now(),
        generation,
      };
    }
    try {
      const result = await getModelCatalog({
        providerId: args.providerId,
        ...(args.cwd ? { cwd: args.cwd } : {}),
        ...(args.runtimeOptions ? { runtimeOptions: args.runtimeOptions } : {}),
      });
      if (
        !providerReadsAllowed(args.providerId, args.runtimeOptions) ||
        generation !==
          providerReadiness(args.providerId, args.runtimeOptions)?.generation
      ) {
        return {
          status: "idle",
          models: [],
          entries: [],
          detail: i18n.t("providers:useProviderModelCatalogs.providerStatusChangedDuringModelDiscovery"),
          isDynamic: false,
          fetchedAt: 0,
        };
      }
      const entries = mergeProviderModelCatalogEntries({
        providerId: args.providerId,
        dynamicEntries: result.ok ? result.models : [],
      });
      registerCatalogMetadata({
        providerId: args.providerId,
        // Preserve the runtime's wire-id -> display-name mapping as well as
        // aliases introduced by merging, such as Cursor's `auto` row.
        entries: [...result.models, ...entries],
      });
      const next: CachedProviderModelCatalog = {
        generation,
        status: result.ok ? "ready" : "error",
        models: entries.map((entry) => entry.model),
        entries,
        detail: result.detail,
        isDynamic: result.ok && result.models.length > 0,
        fetchedAt: Date.now(),
      };
      catalogCache.set(key, next);
      return next;
    } catch (error) {
      if (
        generation !==
        providerReadiness(args.providerId, args.runtimeOptions)?.generation
      )
        return {
          status: "idle",
          models: [],
          entries: [],
          detail: i18n.t("providers:useProviderModelCatalogs.providerStatusChangedDuringModelDiscovery"),
          isDynamic: false,
          fetchedAt: 0,
        };
      const next: CachedProviderModelCatalog = {
        generation,
        status: "error",
        models: fallback.map((entry) => entry.model),
        entries: fallback,
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("providers:useProviderModelCatalogs.failedToLoadTheProviderModel"),
        isDynamic: false,
        fetchedAt: Date.now(),
      };
      catalogCache.set(key, next);
      return next;
    } finally {
      catalogInflight.delete(inflightKey);
    }
  })();
  catalogInflight.set(inflightKey, promise);
  return promise;
}

export function primeProviderModelCatalogs(args: {
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  return Promise.all(
    listProviderDescriptors()
      .filter((descriptor) => descriptor.modelCatalogSource === "runtime")
      .map((descriptor) =>
        loadProviderModelCatalog({
          providerId: descriptor.id,
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
        }),
      ),
  );
}

export function useProviderModelCatalogs(args: {
  enabled?: boolean;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  const runtimeOptions = useAccountRuntimeOptions(args.runtimeOptions);
  args = { ...args, runtimeOptions };
  const profiles = useProviderAccounts(state => state.profiles);
  const [revision, setRevision] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const readiness = useProviderReadinessStore((state) => state.providers);
  const lastRefreshNonce = useRef(0);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    let cancelled = false;
    const force = refreshNonce !== lastRefreshNonce.current;
    lastRefreshNonce.current = refreshNonce;
    void Promise.all(
      listProviderDescriptors().map((descriptor) =>
        loadProviderModelCatalog({
          providerId: descriptor.id,
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
          force,
        }),
      ),
    ).then(() => {
      if (!cancelled) {
        setRevision((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [args.cwd, args.enabled, args.runtimeOptions, refreshNonce, readiness]);

  return useMemo(() => {
    const catalogs = {} as Record<ProviderId, ProviderModelCatalogState>;
    for (const descriptor of listProviderDescriptors()) {
      const gatewayCatalog = configuredGatewayCatalog({ providerId: descriptor.id, runtimeOptions: args.runtimeOptions });
      if (gatewayCatalog) { catalogs[descriptor.id] = gatewayCatalog; continue; }
      const fallback = fallbackEntries(descriptor.id);
      const cached = catalogCache.get(
        cacheKey({
          providerId: descriptor.id,
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
        }),
      );
      if (!providerReadsAllowed(descriptor.id, args.runtimeOptions)) {
        catalogs[descriptor.id] =
          cached && providerSurfaceVisible(descriptor.id, args.runtimeOptions)
            ? {
                ...cached,
                detail: i18n.t("providers:useProviderModelCatalogs.statusUnverifiedShowingTheLastModelVariantfd01a02b"),
              }
            : {
                status: "idle",
                models: [],
                entries: [],
                detail: i18n.t("providers:useProviderModelCatalogs.verifyInstallationAndLoginInSettings"),
                isDynamic: false,
              };
        continue;
      }
      catalogs[descriptor.id] = (cached?.generation ===
      providerReadiness(descriptor.id, args.runtimeOptions)?.generation
        ? cached
        : undefined) ?? {
        status:
          descriptor.modelCatalogSource === "runtime" && args.enabled
            ? "loading"
            : "ready",
        models: fallback.map((entry) => entry.model),
        entries: fallback,
        detail: "",
        isDynamic: false,
      };
    }
    return {
      catalogs,
      revision,
      refresh: () => setRefreshNonce((value) => value + 1),
    };
  }, [args.cwd, args.enabled, args.runtimeOptions, revision, readiness, profiles]);
}

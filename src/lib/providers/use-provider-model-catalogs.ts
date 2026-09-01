import { useEffect, useMemo, useState } from "react";
import {
  getSdkModelOptions,
  getProviderDescriptor,
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
};

const catalogCache = new Map<string, CachedProviderModelCatalog>();
const catalogInflight = new Map<
  string,
  Promise<CachedProviderModelCatalog>
>();

function fallbackEntries(providerId: ProviderId): ProviderModelCatalogEntry[] {
  const descriptor = getProviderDescriptor({ providerId });
  return getSdkModelOptions({ providerId }).map((model) => ({
    model,
    displayName: toHumanModelName({ model }),
    description: "",
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
    binaryPath?.trim() || "<default-binary>",
    args.cwd?.trim() || "<default-cwd>",
  ].join(":");
}

function mergeEntries(args: {
  providerId: ProviderId;
  dynamicEntries: readonly ProviderModelCatalogEntry[];
}) {
  const merged = new Map<string, ProviderModelCatalogEntry>();
  const runtimeDefault = args.dynamicEntries.find((entry) => entry.isDefault);
  for (const entry of fallbackEntries(args.providerId)) {
    merged.set(
      entry.model,
      getProviderDescriptor({ providerId: args.providerId }).defaultModel ===
          "auto" &&
        entry.model === "auto" &&
        runtimeDefault
        ? {
            ...runtimeDefault,
            model: "auto",
            isDefault: true,
          }
        : entry,
    );
  }
  for (const entry of args.dynamicEntries) {
    const model = entry.model.trim();
    if (
      !model ||
      entry.hidden ||
      (getProviderDescriptor({ providerId: args.providerId }).defaultModel ===
        "auto" && entry.isDefault)
    ) {
      continue;
    }
    // Codex pickers stay pinned to the GPT-5.6 trio in the static catalog.
    // A runtime `model/list` may still advertise previous-generation or
    // experimental IDs; they may enrich the three catalog entries but must
    // never add rows of their own.
    if (args.providerId === "codex" && !isCodexPickerModel(model)) {
      continue;
    }
    merged.set(model, { ...entry, model });
  }
  return [...merged.values()];
}

function registerCatalogMetadata(args: {
  providerId: ProviderId;
  entries: readonly ProviderModelCatalogEntry[];
}) {
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
  const descriptor = listProviderDescriptors().find(
    (candidate) => candidate.id === args.providerId,
  );
  const fallback = fallbackEntries(args.providerId);
  if (descriptor?.modelCatalogSource !== "runtime") {
    return {
      status: "ready",
      models: fallback.map((entry) => entry.model),
      entries: fallback,
      detail: "Using the built-in model catalog.",
      isDynamic: false,
      fetchedAt: Date.now(),
    };
  }

  const key = cacheKey(args);
  const cached = catalogCache.get(key);
  if (
    !args.force &&
    cached &&
    Date.now() - cached.fetchedAt <= PROVIDER_MODEL_CATALOG_TTL_MS
  ) {
    return cached;
  }
  const inflight = catalogInflight.get(key);
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
        detail: "Using the built-in model catalog.",
        isDynamic: false,
        fetchedAt: Date.now(),
      };
    }
    try {
      const result = await getModelCatalog({
        providerId: args.providerId,
        ...(args.cwd ? { cwd: args.cwd } : {}),
        ...(args.runtimeOptions ? { runtimeOptions: args.runtimeOptions } : {}),
      });
      const entries = mergeEntries({
        providerId: args.providerId,
        dynamicEntries: result.models,
      });
      registerCatalogMetadata({ providerId: args.providerId, entries });
      const next: CachedProviderModelCatalog = {
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
      const next: CachedProviderModelCatalog = {
        status: "error",
        models: fallback.map((entry) => entry.model),
        entries: fallback,
        detail:
          error instanceof Error
            ? error.message
            : "Failed to load the provider model catalog.",
        isDynamic: false,
        fetchedAt: Date.now(),
      };
      catalogCache.set(key, next);
      return next;
    } finally {
      catalogInflight.delete(key);
    }
  })();
  catalogInflight.set(key, promise);
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
  const [revision, setRevision] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      listProviderDescriptors().map((descriptor) =>
        loadProviderModelCatalog({
          providerId: descriptor.id,
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
          force: refreshNonce > 0,
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
  }, [args.cwd, args.enabled, args.runtimeOptions, refreshNonce]);

  return useMemo(() => {
    const catalogs = {} as Record<ProviderId, ProviderModelCatalogState>;
    for (const descriptor of listProviderDescriptors()) {
      const fallback = fallbackEntries(descriptor.id);
      const cached = catalogCache.get(
        cacheKey({
          providerId: descriptor.id,
          cwd: args.cwd,
          runtimeOptions: args.runtimeOptions,
        }),
      );
      catalogs[descriptor.id] = cached ?? {
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
  }, [args.cwd, args.enabled, args.runtimeOptions, revision]);
}

import { i18n } from "@/i18n";
import { useAccountRuntimeOptions } from "./use-provider-accounts";
import { useEffect, useMemo, useState } from "react";
import {
  getSdkModelOptions,
  isCodexPickerModel,
  registerDynamicDefaultReasoningEfforts,
  registerDynamicDisplayNames,
  registerDynamicSupportedReasoningEfforts,
} from "@/lib/providers/model-catalog";
import type { CodexModelCatalogEntry } from "@/lib/providers/provider.types";

const FALLBACK_CODEX_MODELS = [
  ...getSdkModelOptions({ providerId: "codex" }),
] as string[];
const CODEX_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Intersection of the Stave model catalog and the App Server's dynamic
 * `model/list` result. The picker is pinned to the primary catalog: the static
 * catalog keeps new models selectable even when the installed Codex binary
 * still reports an older lineup, and server-only models (previous
 * generations, experimental IDs) are dropped instead of appended.
 */
export function mergeCodexModelsWithCatalog(
  dynamicModels: readonly string[],
): string[] {
  const merged = [...FALLBACK_CODEX_MODELS];
  for (const model of dynamicModels) {
    const normalizedModel = model.trim();
    if (
      normalizedModel &&
      isCodexPickerModel(normalizedModel) &&
      !merged.includes(normalizedModel)
    ) {
      merged.push(normalizedModel);
    }
  }
  return merged;
}

type CodexModelCatalogCacheEntry = {
  status: "ready" | "error";
  models: string[];
  entries: CodexModelCatalogEntry[];
  detail: string;
  dynamic: boolean;
  fetchedAt: number;
};

const codexModelCatalogCache = new Map<string, CodexModelCatalogCacheEntry>();
const codexModelCatalogInflight = new Map<
  string,
  Promise<CodexModelCatalogCacheEntry>
>();

function getCacheKey(binaryPath?: string | null, accountProfileId = "system-default") {
  const trimmed = binaryPath?.trim();
  return JSON.stringify([accountProfileId, trimmed || "<default>"]);
}

function getCachedEntry(binaryPath?: string | null, accountProfileId?: string) {
  const cacheKey = getCacheKey(binaryPath, accountProfileId);
  const cached = codexModelCatalogCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAt > CODEX_MODEL_CACHE_TTL_MS) {
    return null;
  }
  return cached;
}

async function loadCodexModelCatalog(args: {
  binaryPath?: string | null;
  accountProfileId?: string;
  force?: boolean;
}) {
  const cacheKey = getCacheKey(args.binaryPath, args.accountProfileId);
  const cached = !args.force ? getCachedEntry(args.binaryPath, args.accountProfileId) : null;
  if (cached) {
    return cached;
  }

  const inflight = codexModelCatalogInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = (async (): Promise<CodexModelCatalogCacheEntry> => {
    const getCodexModelCatalog = window.api?.provider?.getCodexModelCatalog;
    if (!getCodexModelCatalog) {
      const fallbackEntry: CodexModelCatalogCacheEntry = {
        status: "ready",
        models: FALLBACK_CODEX_MODELS,
        entries: [],
        detail:
          i18n.t("providers:useCodexModelCatalog.usingStaveFallbackCodexModelList"),
        dynamic: false,
        fetchedAt: Date.now(),
      };
      codexModelCatalogCache.set(cacheKey, fallbackEntry);
      return fallbackEntry;
    }

    try {
      const result = await getCodexModelCatalog({
        runtimeOptions: { codexAccountProfileId: args.accountProfileId, codexBinaryPath: args.binaryPath?.trim() || undefined },
      });
      const visibleEntries = result.models.filter((model) => !model.hidden).map(entry => ({
        ...entry,
        description: [result.ok ? "Listed by the current Codex runtime." : "Runtime support unconfirmed.", entry.description].filter(Boolean).join(" "),
      }));
      const models = visibleEntries
        .map((model) => model.model.trim())
        .filter(Boolean);

      // Register dynamic display names so toHumanModelName() can use them,
      // dynamic default reasoning efforts so
      // resolveDefaultCodexEffortForModel() reflects Codex's own
      // recommendation (`defaultReasoningEffort`) for every catalog model,
      // and dynamic supported-effort lists so effort pickers never offer a
      // value the model would reject (e.g. Luna has no "ultra").
      if (models.length > 0) {
        const nameMap = new Map<string, string>();
        const defaultEffortMap = new Map<string, string>();
        const supportedEffortsMap = new Map<string, readonly string[]>();
        for (const entry of visibleEntries) {
          const id = entry.model.trim();
          if (!id) {
            continue;
          }
          if (entry.displayName && entry.displayName !== id) {
            nameMap.set(id, entry.displayName);
          }
          if (entry.defaultReasoningEffort) {
            defaultEffortMap.set(id, entry.defaultReasoningEffort);
          }
          if (entry.supportedReasoningEfforts.length > 0) {
            supportedEffortsMap.set(id, entry.supportedReasoningEfforts);
          }
        }
        if (nameMap.size > 0) {
          registerDynamicDisplayNames(nameMap);
        }
        if (defaultEffortMap.size > 0) {
          registerDynamicDefaultReasoningEfforts(defaultEffortMap);
        }
        if (supportedEffortsMap.size > 0) {
          registerDynamicSupportedReasoningEfforts(supportedEffortsMap);
        }
      }

      const nextEntry: CodexModelCatalogCacheEntry = {
        status: result.ok ? "ready" : "error",
        models:
          models.length > 0
            ? mergeCodexModelsWithCatalog(models)
            : FALLBACK_CODEX_MODELS,
        entries: visibleEntries,
        detail:
          result.detail ||
          i18n.t("providers:useCodexModelCatalog.loadedCodexModelCatalogFromThe"),
        dynamic: result.ok && models.length > 0,
        fetchedAt: Date.now(),
      };
      codexModelCatalogCache.set(cacheKey, nextEntry);
      return nextEntry;
    } catch (error) {
      const fallbackEntry: CodexModelCatalogCacheEntry = {
        status: "error",
        models: FALLBACK_CODEX_MODELS,
        entries: [],
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("providers:useCodexModelCatalog.failedToLoadTheCodexModel"),
        dynamic: false,
        fetchedAt: Date.now(),
      };
      codexModelCatalogCache.set(cacheKey, fallbackEntry);
      return fallbackEntry;
    } finally {
      codexModelCatalogInflight.delete(cacheKey);
    }
  })();

  codexModelCatalogInflight.set(cacheKey, promise);
  return promise;
}

export interface CodexModelCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  models: string[];
  entries: CodexModelCatalogEntry[];
  detail: string;
  isDynamic: boolean;
}

export function useCodexModelCatalog(args: {
  enabled?: boolean;
  codexBinaryPath?: string | null;
}) {
  const { codexAccountProfileId } = useAccountRuntimeOptions();
  const cacheKey = getCacheKey(args.codexBinaryPath, codexAccountProfileId);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<CodexModelCatalogState & { cacheKey: string }>(() => {
    const cached = getCachedEntry(args.codexBinaryPath, codexAccountProfileId);
    return {
      cacheKey,
      status: cached?.status ?? "idle",
      models: cached?.models ?? FALLBACK_CODEX_MODELS,
      entries: cached?.entries ?? [],
      detail: cached?.detail ?? "",
      isDynamic: cached?.dynamic ?? false,
    };
  });

  useEffect(() => {
    if (!args.enabled) {
      return;
    }

    let cancelled = false;
    const cached = getCachedEntry(args.codexBinaryPath, codexAccountProfileId);
    setState({
      cacheKey,
      status: cached?.status ?? "loading",
      models: cached?.models ?? FALLBACK_CODEX_MODELS,
      entries: cached?.entries ?? [],
      detail: cached?.detail ?? "",
      isDynamic: cached?.dynamic ?? false,
    });

    void loadCodexModelCatalog({
      binaryPath: args.codexBinaryPath,
      accountProfileId: codexAccountProfileId,
      force: refreshNonce > 0,
    }).then((entry) => {
      if (cancelled) {
        return;
      }
      setState({
        cacheKey,
        status: entry.status,
        models: entry.models,
        entries: entry.entries,
        detail: entry.detail,
        isDynamic: entry.dynamic,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [args.codexBinaryPath, args.enabled, codexAccountProfileId, refreshNonce, cacheKey]);

  return useMemo(
    () => ({
      ...(state.cacheKey === cacheKey ? state : { status: "loading" as const, models: FALLBACK_CODEX_MODELS, entries: [], detail: "", isDynamic: false }),
      refresh: () => setRefreshNonce((value) => value + 1),
    }),
    [state, cacheKey],
  );
}

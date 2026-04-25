import { useEffect, useMemo, useState } from "react";
import {
  getSdkModelOptions,
  registerDynamicDisplayNames,
} from "@/lib/providers/model-catalog";
import type { CodexModelCatalogEntry } from "@/lib/providers/provider.types";

const FALLBACK_CODEX_MODELS = [
  ...getSdkModelOptions({ providerId: "codex" }),
] as string[];
const CODEX_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

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

function getCacheKey(binaryPath?: string | null) {
  const trimmed = binaryPath?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "<default>";
}

function getCachedEntry(binaryPath?: string | null) {
  const cacheKey = getCacheKey(binaryPath);
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
  force?: boolean;
}) {
  const cacheKey = getCacheKey(args.binaryPath);
  const cached = !args.force ? getCachedEntry(args.binaryPath) : null;
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
          "Using Stave fallback Codex model list because the App Server catalog API is unavailable.",
        dynamic: false,
        fetchedAt: Date.now(),
      };
      codexModelCatalogCache.set(cacheKey, fallbackEntry);
      return fallbackEntry;
    }

    try {
      const result = await getCodexModelCatalog({
        runtimeOptions:
          args.binaryPath && args.binaryPath.trim().length > 0
            ? { codexBinaryPath: args.binaryPath.trim() }
            : undefined,
      });
      const visibleEntries = result.models.filter((model) => !model.hidden);
      const models = visibleEntries
        .map((model) => model.model.trim())
        .filter(Boolean);

      // Register dynamic display names so toHumanModelName() can use them
      if (models.length > 0) {
        const nameMap = new Map<string, string>();
        for (const entry of visibleEntries) {
          const id = entry.model.trim();
          if (id && entry.displayName && entry.displayName !== id) {
            nameMap.set(id, entry.displayName);
          }
        }
        if (nameMap.size > 0) {
          registerDynamicDisplayNames(nameMap);
        }
      }

      const nextEntry: CodexModelCatalogCacheEntry = {
        status: result.ok ? "ready" : "error",
        models: models.length > 0 ? models : FALLBACK_CODEX_MODELS,
        entries: visibleEntries,
        detail:
          result.detail ||
          "Loaded Codex model catalog from the current App Server runtime.",
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
            : "Failed to load the Codex model catalog.",
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
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<CodexModelCatalogState>(() => {
    const cached = getCachedEntry(args.codexBinaryPath);
    return {
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
    const cached = getCachedEntry(args.codexBinaryPath);
    setState((current) => ({
      status: cached?.status ?? "loading",
      models: cached?.models ?? current.models,
      entries: cached?.entries ?? current.entries,
      detail: cached?.detail ?? current.detail,
      isDynamic: cached?.dynamic ?? current.isDynamic,
    }));

    void loadCodexModelCatalog({
      binaryPath: args.codexBinaryPath,
      force: refreshNonce > 0,
    }).then((entry) => {
      if (cancelled) {
        return;
      }
      setState({
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
  }, [args.codexBinaryPath, args.enabled, refreshNonce]);

  return useMemo(
    () => ({
      ...state,
      refresh: () => setRefreshNonce((value) => value + 1),
    }),
    [state],
  );
}

import { getProviderLabel, providerSupportsNativeCommandCatalog } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface ProviderSlashCommand {
  name: string;
  command: string;
  description: string;
  argumentHint?: string;
}

export interface ProviderCommandCatalogState {
  providerId: ProviderId;
  status: "idle" | "loading" | "ready" | "unsupported" | "error";
  commands: ProviderSlashCommand[];
  detail: string;
}

export interface ProviderCommandCatalogResponse {
  ok: boolean;
  supported: boolean;
  commands: ProviderSlashCommand[];
  detail: string;
}

const MAX_PROVIDER_COMMAND_CATALOG_CACHE_ENTRIES = 32;
const providerCommandCatalogCache = new Map<string, ProviderCommandCatalogState>();

function toCatalogCacheKey(args: { providerId: ProviderId; cwd?: string }) {
  return `${args.providerId}:${args.cwd?.trim() || "<default>"}`;
}

export function getInitialProviderCommandCatalog(args: { providerId: ProviderId }): ProviderCommandCatalogState {
  if (!providerSupportsNativeCommandCatalog(args)) {
    return {
      providerId: args.providerId,
      status: "unsupported",
      commands: [],
      detail: `${getProviderLabel({ providerId: args.providerId, variant: "full" })} does not expose a native slash-command catalog through the current SDK/CLI path. Slash commands are passed through unchanged.`,
    };
  }

  return {
    providerId: args.providerId,
    status: "idle",
    commands: [],
    detail: "",
  };
}

export function getCachedProviderCommandCatalog(args: { providerId: ProviderId; cwd?: string }) {
  const cacheKey = toCatalogCacheKey(args);
  const cached = providerCommandCatalogCache.get(cacheKey);
  if (cached) {
    providerCommandCatalogCache.delete(cacheKey);
    providerCommandCatalogCache.set(cacheKey, cached);
    return cached;
  }
  return getInitialProviderCommandCatalog({
    providerId: args.providerId,
  });
}

export function setCachedProviderCommandCatalog(args: {
  providerId: ProviderId;
  cwd?: string;
  catalog: ProviderCommandCatalogState;
}) {
  const cacheKey = toCatalogCacheKey(args);
  providerCommandCatalogCache.delete(cacheKey);
  providerCommandCatalogCache.set(cacheKey, args.catalog);
  while (providerCommandCatalogCache.size > MAX_PROVIDER_COMMAND_CATALOG_CACHE_ENTRIES) {
    const oldestKey = providerCommandCatalogCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    providerCommandCatalogCache.delete(oldestKey);
  }
}

export function toProviderCommandCatalogState(args: {
  providerId: ProviderId;
  response?: ProviderCommandCatalogResponse | null;
  error?: unknown;
}): ProviderCommandCatalogState {
  if (args.error) {
    return {
      providerId: args.providerId,
      status: "error",
      commands: [],
      detail: `Failed to load provider command catalog: ${String(args.error)}`,
    };
  }

  const response = args.response;
  if (!response) {
    return getInitialProviderCommandCatalog({ providerId: args.providerId });
  }

  if (!response.ok) {
    return {
      providerId: args.providerId,
      status: "error",
      commands: [],
      detail: response.detail,
    };
  }

  if (!response.supported) {
    return {
      providerId: args.providerId,
      status: "unsupported",
      commands: [],
      detail: response.detail,
    };
  }

  return {
    providerId: args.providerId,
    status: "ready",
    commands: response.commands,
    detail: response.detail,
  };
}

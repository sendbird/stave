/**
 * Module-level cache for formatted repo-map context text.
 *
 * Stores one entry per workspace path in a plain Map with lightweight
 * metadata (file counts, timestamps) so a diagnostics viewer can show
 * cache status without IPC or re-renders.
 *
 * This is intentionally NOT a Zustand store — reads from `sendUserMessage`
 * are synchronous and effectively free (Map.get).
 *
 * Flow:
 *  1. TopBar pre-warms the cache asynchronously via `getRepoMap` IPC.
 *  2. On the first AI turn, `sendUserMessage` reads from this cache
 *     synchronously to inject the repo-map as retrieved context.
 */

export interface RepoMapCacheEntry {
  /** Formatted markdown text injected into the AI prompt. */
  text: string;
  /** ISO timestamp from the repo-map snapshot's `updatedAt`. */
  snapshotUpdatedAt: string;
  /** When this entry was stored in the in-memory cache. */
  cachedAt: string;
  /** Total file count from the snapshot. */
  fileCount: number;
  /** Code file count from the snapshot. */
  codeFileCount: number;
  /** Number of hotspot entries. */
  hotspotCount: number;
  /** Number of entrypoint entries. */
  entrypointCount: number;
  /** Number of doc entries. */
  docCount: number;
}

const cache = new Map<string, RepoMapCacheEntry>();
const MAX_REPO_MAP_CACHE_ENTRIES = 8;

/**
 * Return the cached formatted repo-map text for a workspace, or
 * `undefined` if the cache has not been populated yet.
 */
export function getRepoMapContextCache(workspacePath: string): string | undefined {
  const entry = cache.get(workspacePath);
  if (!entry) {
    return undefined;
  }
  cache.delete(workspacePath);
  cache.set(workspacePath, entry);
  return entry.text;
}

/**
 * Store (or overwrite) a repo-map cache entry for a workspace.
 */
export function setRepoMapContextCache(
  workspacePath: string,
  entry: Omit<RepoMapCacheEntry, "cachedAt">,
): void {
  cache.delete(workspacePath);
  cache.set(workspacePath, {
    ...entry,
    cachedAt: new Date().toISOString(),
  });
  while (cache.size > MAX_REPO_MAP_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

/**
 * Clear the cache. If `workspacePath` is provided, only that entry
 * is removed; otherwise the entire cache is flushed.
 */
export function clearRepoMapContextCache(workspacePath?: string): void {
  if (workspacePath) {
    cache.delete(workspacePath);
  } else {
    cache.clear();
  }
}

/**
 * Return a readonly snapshot of every cached entry for diagnostics.
 */
export function getRepoMapCacheSnapshot(): ReadonlyMap<string, Readonly<RepoMapCacheEntry>> {
  return cache;
}

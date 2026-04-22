/**
 * Stave Provider Availability Cache
 *
 * A lightweight TTL cache that remembers whether each provider is currently
 * reachable.  The Pre-processor and router consult this cache when selecting
 * which model to delegate work to, so that they can fall back gracefully when
 * a provider's quota is exhausted or its CLI is not installed.
 *
 * The cache is intentionally in-process and non-persistent: a fresh Stave
 * session always re-checks availability on the first request.
 */

const CACHE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  available: boolean;
  checkedAt: number;
}

const cache = new Map<string, CacheEntry>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the cached availability for `providerId`, or `null` when the entry
 * is absent or has expired.
 */
export function getCachedAvailability(providerId: string): boolean | null {
  const entry = cache.get(providerId);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.checkedAt > CACHE_TTL_MS) {
    cache.delete(providerId);
    return null;
  }
  return entry.available;
}

/**
 * Persist an availability result so subsequent calls within the TTL window
 * skip the check entirely.
 */
export function setCachedAvailability(providerId: string, available: boolean): void {
  cache.set(providerId, { available, checkedAt: Date.now() });
}

/**
 * Force a re-check on the next request (e.g. after an auth error or
 * quota-exhaustion error is surfaced to the user).
 */
export function invalidateAvailability(providerId: string): void {
  cache.delete(providerId);
}

/**
 * Return a snapshot of all currently-cached availability entries that have
 * not yet expired.  Useful for diagnostics / debug logging.
 */
export function getAvailabilitySnapshot(): Record<string, boolean> {
  const now = Date.now();
  const result: Record<string, boolean> = {};
  for (const [id, entry] of cache.entries()) {
    if (now - entry.checkedAt <= CACHE_TTL_MS) {
      result[id] = entry.available;
    }
  }
  return result;
}

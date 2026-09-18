type UtilityReadinessResult = { ready: boolean; detail?: string };
type ReadyEntry = { result: UtilityReadinessResult; expiresAt: number };
type PendingEntry = { promise: Promise<UtilityReadinessResult> };

/** Cache readiness only; each runner still enforces its own authentication. */
export function createUtilityReadinessCache(args?: {
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
}): {
  get(key: string, check: () => Promise<UtilityReadinessResult>): Promise<UtilityReadinessResult>;
  invalidate(key: string): void;
} {
  const now = args?.now ?? Date.now;
  const ttlMs = Math.max(0, args?.ttlMs ?? 30_000);
  const maxEntries = Math.max(0, args?.maxEntries ?? 16);
  const readyEntries = new Map<string, ReadyEntry>();
  const pendingEntries = new Map<string, PendingEntry>();

  const get = (key: string, check: () => Promise<UtilityReadinessResult>) => {
    const readyEntry = readyEntries.get(key);
    if (readyEntry) {
      if (now() < readyEntry.expiresAt) return Promise.resolve(readyEntry.result);
      readyEntries.delete(key);
    }
    const existing = pendingEntries.get(key);
    if (existing) return existing.promise;

    let pendingEntry: PendingEntry;
    const promise = Promise.resolve().then(check).then((result) => {
      if (result.ready && pendingEntries.get(key) === pendingEntry && maxEntries > 0) {
        readyEntries.delete(key);
        readyEntries.set(key, { result, expiresAt: now() + ttlMs });
        while (readyEntries.size > maxEntries) {
          const oldestKey = readyEntries.keys().next().value;
          if (oldestKey === undefined) break;
          readyEntries.delete(oldestKey);
        }
      }
      return result;
    }).finally(() => {
      if (pendingEntries.get(key) === pendingEntry) pendingEntries.delete(key);
    });
    pendingEntry = { promise };
    pendingEntries.set(key, pendingEntry);
    return promise;
  };

  return {
    get,
    invalidate(key) {
      readyEntries.delete(key);
      pendingEntries.delete(key);
    },
  };
}

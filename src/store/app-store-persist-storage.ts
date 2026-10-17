import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Persist storage that coalesces writes.
 *
 * Zustand's `persist` middleware calls `setItem` after every `set()`, which
 * by default means `JSON.stringify` plus a synchronous `localStorage.setItem`
 * on every store update, including ~20 Hz streaming flushes that never touch
 * a persisted slice. This storage:
 *
 * - skips the write when every top-level persisted slice is reference-equal
 *   to the value last accepted for that key;
 * - debounces the remaining writes (trailing edge) with a maximum wait so a
 *   steady stream of changes still lands on disk regularly;
 * - flushes synchronously on `pagehide` / `beforeunload`, before any read,
 *   and on demand through `flush()`, which reports whether the write landed;
 *   a failed write (quota, for example) stays pending for the next flush;
 * - orders local changes against outside writes (another window or tab, or
 *   the e2e harness) as synchronous writes would have. When a new local value
 *   arrives, any outside value already stored is acknowledged, so the local
 *   change made after it wins. At flush time a pending write is dropped only
 *   when something else replaced the stored value after our latest local
 *   change: with synchronous writes that outside value would have landed after
 *   ours, so it keeps winning (the e2e harness seeds `stave-store` this way
 *   and then reloads). The next store update writes the full state again, as
 *   it always did.
 */
export interface CoalescedPersistStorage<S> extends PersistStorage<S> {
  /**
   * Writes the pending value now, if any. Safe to call at any time. Returns
   * `false` when the write failed; the value then stays pending so a later
   * flush retries it.
   */
  flush: () => boolean;
  /** Whether a write is waiting for its debounce window. */
  hasPendingWrite: () => boolean;
}

/** Synchronous string storage: the subset of `Storage` this needs. */
export type SyncStringStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export interface CoalescedPersistTimers {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

export const PERSIST_WRITE_DEBOUNCE_MS = 400;
export const PERSIST_WRITE_MAX_WAIT_MS = 2000;

const defaultTimers: CoalescedPersistTimers = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  now: () => Date.now(),
};

export function arePersistedSlicesEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      Object.is(leftRecord[key], rightRecord[key]),
  );
}

/**
 * Returns `undefined` when the backing storage cannot be resolved, matching
 * `createJSONStorage`, so `persist` keeps its "storage unavailable" path.
 */
export function createCoalescedPersistStorage<S>(args: {
  getStorage: () => SyncStringStorage;
  debounceMs?: number;
  maxWaitMs?: number;
  timers?: CoalescedPersistTimers;
  /** Window-like target for `pagehide` / `beforeunload` flushes. */
  lifecycleTarget?: Pick<Window, "addEventListener"> | null;
}): CoalescedPersistStorage<S> | undefined {
  let backing: SyncStringStorage;
  try {
    backing = args.getStorage();
  } catch {
    return undefined;
  }
  const debounceMs = args.debounceMs ?? PERSIST_WRITE_DEBOUNCE_MS;
  const maxWaitMs = args.maxWaitMs ?? PERSIST_WRITE_MAX_WAIT_MS;
  const timers = args.timers ?? defaultTimers;
  // Last value accepted per key: either written or currently pending.
  const acceptedByName = new Map<string, StorageValue<S>>();
  // Raw stored string as of this storage's last read, write or acknowledged
  // outside write, per key.
  const knownRawByName = new Map<string, string | null>();
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let pendingSince: number | null = null;
  let timer: unknown = null;

  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  const flush = (): boolean => {
    clearTimer();
    const write = pending;
    pending = null;
    pendingSince = null;
    if (!write) {
      return true;
    }
    try {
      if (knownRawByName.has(write.name)) {
        const currentRaw = backing.getItem(write.name);
        // Something else wrote after our latest local change: it wins.
        if (currentRaw !== knownRawByName.get(write.name)) {
          knownRawByName.set(write.name, currentRaw);
          acceptedByName.delete(write.name);
          return true;
        }
      }
      const raw = JSON.stringify(write.value);
      backing.setItem(write.name, raw);
      knownRawByName.set(write.name, raw);
      return true;
    } catch (error) {
      // Keep the value pending (and accepted) so the next flush, or the next
      // store update, retries it instead of losing it.
      pending = write;
      console.error("[persistence] failed to write the app store", error);
      return false;
    }
  };

  const schedule = () => {
    const now = timers.now();
    pendingSince ??= now;
    const remainingMaxWait = Math.max(0, pendingSince + maxWaitMs - now);
    clearTimer();
    timer = timers.setTimeout(flush, Math.min(debounceMs, remainingMaxWait));
  };

  const storage: CoalescedPersistStorage<S> = {
    getItem: (name) => {
      if (pending?.name === name) {
        flush();
      }
      const raw = backing.getItem(name);
      knownRawByName.set(name, raw);
      return raw === null ? null : (JSON.parse(raw) as StorageValue<S>);
    },
    setItem: (name, value) => {
      if (pending && pending.name !== name) {
        flush();
      }
      const accepted = acceptedByName.get(name);
      if (
        accepted &&
        accepted.version === value.version &&
        arePersistedSlicesEqual(accepted.state, value.state)
      ) {
        return;
      }
      if (knownRawByName.has(name)) {
        // This local change comes after whatever is stored now, including an
        // outside write since our last read or write: acknowledge that value
        // so the flush keeps this change instead of dropping it.
        try {
          knownRawByName.set(name, backing.getItem(name));
        } catch {
          // Keep the last known value; the flush re-checks the stored one.
        }
      }
      acceptedByName.set(name, value);
      pending = { name, value };
      schedule();
    },
    removeItem: (name) => {
      if (pending?.name === name) {
        clearTimer();
        pending = null;
        pendingSince = null;
      }
      acceptedByName.delete(name);
      backing.removeItem(name);
      knownRawByName.set(name, null);
    },
    flush,
    hasPendingWrite: () => pending !== null,
  };

  const lifecycleTarget =
    args.lifecycleTarget === undefined
      ? typeof window !== "undefined" &&
        typeof window.addEventListener === "function"
        ? window
        : null
      : args.lifecycleTarget;
  lifecycleTarget?.addEventListener("pagehide", flush);
  lifecycleTarget?.addEventListener("beforeunload", flush);

  return storage;
}

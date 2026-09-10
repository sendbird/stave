/**
 * Shared read policy for provider account-usage endpoints.
 *
 * Reading usage is not free: every provider path behind it is an authenticated
 * request against the user's own subscription, and two of them can launch a
 * provider CLI. Left unguarded, three separate mistakes compound into traffic
 * that looks automated rather than interactive:
 *
 * 1. Repeat reads. A caller that asks twice inside a minute gets two requests
 *    for data that cannot have meaningfully changed.
 * 2. Failure loops. A stale credential answers 401 forever, and a fixed timer
 *    happily reproduces that 401 at the same cadence indefinitely. Repeated
 *    authentication failures at machine-regular intervals are exactly the
 *    signal abuse heuristics are built to catch.
 * 3. Unbounded forcing. `force` exists for user-initiated refreshes and for the
 *    near-limit dispatch check, but without a floor it turns "user is sending
 *    turns while nearly out of quota" into a burst of reads at the moment the
 *    account is already under the most scrutiny.
 *
 * So: cache per provider, back off geometrically on consecutive failures, and
 * give `force` a floor. `force` still bypasses the TTL and the backoff, because
 * every forcing caller is a direct consequence of a user action — but a manual
 * refresh can never exceed one read per `USAGE_READ_FORCE_FLOOR_MS`.
 *
 * The pre-send near-limit check is the one exception to that floor. Its entire
 * purpose is to be right at the instant a turn is dispatched, and floored to a
 * minute it would wave through a second send on a reading it had already
 * decided was too close to call. It stays unfloored — still one read per send,
 * still coalesced with any read already in flight — because a read caused by
 * pressing send is interactive traffic, not a background poll.
 *
 * Failure is defined by the caller, not by a thrown error: the provider
 * fetchers deliberately return an `unavailable` snapshot instead of throwing,
 * so `classify` is what tells this module that a read did not work.
 */

/**
 * Shortest gap between two background reads of the same provider. The status
 * bar's own cadence is what normally decides how often usage is read; this is
 * the floor that keeps any caller from out-running it.
 */
export const USAGE_READ_TTL_MS = 2 * 60_000;

/** Shortest gap between two *manually* forced reads of the same provider. */
export const USAGE_READ_FORCE_FLOOR_MS = 60_000;

/** Backoff after the first failure; doubles per additional consecutive one. */
export const USAGE_READ_BACKOFF_BASE_MS = 5 * 60_000;

/** Backoff ceiling. A provider that stays broken is retried hourly. */
export const USAGE_READ_BACKOFF_MAX_MS = 60 * 60_000;

export type UsageReadOutcome = "ok" | "failed";

export function usageReadBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return 0;
  }
  const grown =
    USAGE_READ_BACKOFF_BASE_MS * 2 ** Math.min(consecutiveFailures - 1, 10);
  return Math.min(grown, USAGE_READ_BACKOFF_MAX_MS);
}

interface UsageReadEntry {
  /** Most recent value, successful or not, as returned to callers. */
  value: unknown;
  /** Most recent *successful* value, kept to serve reads during backoff. */
  lastOk: unknown;
  /** True once any request has produced a value to serve. */
  hasValue: boolean;
  /** Error from the last throwing request, replayed while no value exists. */
  error: unknown;
  updatedAt: number;
  consecutiveFailures: number;
  /** Earliest time a non-forced read may be attempted again. */
  nextAttemptAt: number;
}

const entries = new Map<string, UsageReadEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export function clearUsageReadState(key?: string) {
  if (key === undefined) {
    entries.clear();
    inFlight.clear();
    return;
  }
  entries.delete(key);
  inFlight.delete(key);
}

export interface UsageReadState {
  updatedAt: number;
  consecutiveFailures: number;
  nextAttemptAt: number;
}

export function readUsageReadState(key: string): UsageReadState | null {
  const entry = entries.get(key);
  return entry
    ? {
        updatedAt: entry.updatedAt,
        consecutiveFailures: entry.consecutiveFailures,
        nextAttemptAt: entry.nextAttemptAt,
      }
    : null;
}

/**
 * Fold a provider-pushed reading into the cached snapshot.
 *
 * Some providers report their own limits as a side effect of the turn traffic
 * the user already paid for: the Codex App Server pushes
 * `account/rateLimits/updated`, and the Claude SDK emits `rate_limit_event`
 * with the utilization of the currently binding window. That is strictly
 * better data than a poll could produce — it is newer, it is authoritative,
 * and it costs no extra request — so recording it here both improves the
 * meter and pushes `updatedAt` forward, which suppresses the next read.
 *
 * `updater` returning `null` means "nothing to apply"; an entry with no
 * successful value yet is left alone, because a pushed fragment is an overlay
 * on a full snapshot, not a substitute for one.
 */
export function recordPushedUsageReading<T>(args: {
  key: string;
  update: (previous: T) => T | null;
  now?: number;
}): boolean {
  const entry = entries.get(args.key);
  if (!entry || !entry.hasValue || entry.lastOk === undefined) {
    return false;
  }
  const next = args.update(entry.lastOk as T);
  if (next === null) {
    return false;
  }
  entries.set(args.key, {
    ...entry,
    value: next,
    lastOk: next,
    error: undefined,
    updatedAt: args.now ?? Date.now(),
    consecutiveFailures: 0,
    nextAttemptAt: 0,
  });
  return true;
}

export async function readProviderUsage<T>(args: {
  /** Cache key; one per provider. */
  key: string;
  request: () => Promise<T>;
  /** Maps a returned snapshot to success or failure for backoff purposes. */
  classify: (value: T) => UsageReadOutcome;
  force?: boolean;
  now?: number;
  ttlMs?: number;
  forceFloorMs?: number;
}): Promise<T> {
  const now = args.now ?? Date.now();
  const ttlMs = args.ttlMs ?? USAGE_READ_TTL_MS;
  const forceFloorMs = args.forceFloorMs ?? USAGE_READ_FORCE_FLOOR_MS;
  const entry = entries.get(args.key);

  if (entry) {
    const ageMs = now - entry.updatedAt;
    const minAgeMs = args.force ? forceFloorMs : ttlMs;
    const withinFloor = ageMs < minAgeMs;
    // Backoff applies to background reads only. A forced read is a user
    // action, and the floor above already bounds how often it can happen.
    const withinBackoff = !args.force && now < entry.nextAttemptAt;
    if (withinFloor || withinBackoff) {
      if (entry.hasValue) {
        return (withinFloor ? entry.value : (entry.lastOk ?? entry.value)) as T;
      }
      // Nothing has ever succeeded here, so there is no snapshot to serve.
      // Replaying the recorded failure keeps the caller honest without
      // issuing the request the backoff just declined to make.
      throw entry.error instanceof Error
        ? entry.error
        : new Error(String(entry.error ?? "Usage read is unavailable."));
    }
  }

  const pending = inFlight.get(args.key);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = (async () => {
    try {
      const value = await args.request();
      const failed = args.classify(value) === "failed";
      const consecutiveFailures = failed
        ? (entries.get(args.key)?.consecutiveFailures ?? 0) + 1
        : 0;
      const previous = entries.get(args.key);
      entries.set(args.key, {
        value,
        lastOk: failed ? previous?.lastOk : value,
        hasValue: true,
        error: undefined,
        updatedAt: now,
        consecutiveFailures,
        nextAttemptAt: now + usageReadBackoffMs(consecutiveFailures),
      });
      return value;
    } catch (error) {
      // A fetcher that throws is still a failed read and must not escape the
      // backoff accounting, or a throwing provider would retry every tick.
      // A first-ever read that throws still has to start the backoff, or a
      // provider that throws on every call would be retried on every tick
      // forever — the exact failure loop this module exists to prevent.
      const previous = entries.get(args.key);
      const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
      entries.set(args.key, {
        value: previous?.value,
        lastOk: previous?.lastOk,
        hasValue: previous?.hasValue ?? false,
        error,
        updatedAt: now,
        consecutiveFailures,
        nextAttemptAt: now + usageReadBackoffMs(consecutiveFailures),
      });
      throw error;
    } finally {
      inFlight.delete(args.key);
    }
  })();

  inFlight.set(args.key, request);
  return request;
}

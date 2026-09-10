import type { CodexRateLimitSnapshot } from "../../src/lib/providers/provider.types";
import { mapCodexRateLimitBuckets } from "./codex-snapshot-mappers";

/**
 * Host-side cache for Codex account rate limits.
 *
 * The Codex App Server pushes `account/rateLimits/updated` on every model
 * response it receives during a turn, so while the user is working the status
 * bar already has fresher data than any poll could produce. Polling
 * `account/rateLimits/read` on a short timer on top of that is pure overhead
 * against the user's ChatGPT account: it produces a steady stream of
 * authenticated requests that carry no new information and look like bot
 * traffic. The cache turns the active read into a fallback for the idle case
 * and rate-limits it to one request per `CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS`.
 *
 * Callers that need a genuinely fresh reading (a user pressing refresh, the
 * near-limit dispatch guard) pass `force`.
 */

/**
 * Longest the status bar will trust a cached reading before issuing an active
 * `account/rateLimits/read`. Matches the minimum timer cadence third-party
 * usage monitors use for the same endpoint.
 */
export const CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS = 15 * 60_000;

export type CodexRateLimitsCacheSource = "notification" | "rpc";

export interface CodexRateLimitsCacheEntry {
  buckets: CodexRateLimitSnapshot[];
  updatedAt: number;
  source: CodexRateLimitsCacheSource;
}

let cachedEntry: CodexRateLimitsCacheEntry | null = null;

export function recordCodexRateLimits(args: {
  buckets: CodexRateLimitSnapshot[];
  source: CodexRateLimitsCacheSource;
  now?: number;
}): CodexRateLimitsCacheEntry {
  const entry: CodexRateLimitsCacheEntry = {
    buckets: args.buckets,
    source: args.source,
    updatedAt: args.now ?? Date.now(),
  };
  cachedEntry = entry;
  return entry;
}

export function readCodexRateLimitsCache(): CodexRateLimitsCacheEntry | null {
  return cachedEntry;
}

export function clearCodexRateLimitsCache() {
  cachedEntry = null;
}

export function isCodexRateLimitsCacheFresh(args: {
  entry: CodexRateLimitsCacheEntry | null;
  now: number;
  maxAgeMs: number;
}): args is { entry: CodexRateLimitsCacheEntry; now: number; maxAgeMs: number } {
  return (
    args.entry !== null &&
    args.entry.buckets.length > 0 &&
    args.now - args.entry.updatedAt < args.maxAgeMs
  );
}

/**
 * Serve the cached buckets when they are fresh; otherwise perform the active
 * read and record its result so the next caller inside the window is free.
 */
export async function resolveCodexRateLimitBuckets(args: {
  request: () => Promise<CodexRateLimitSnapshot[]>;
  force?: boolean;
  now?: number;
  maxAgeMs?: number;
}): Promise<CodexRateLimitSnapshot[]> {
  const now = args.now ?? Date.now();
  const maxAgeMs = args.maxAgeMs ?? CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS;
  const entry = cachedEntry;
  if (!args.force && isCodexRateLimitsCacheFresh({ entry, now, maxAgeMs })) {
    return entry.buckets;
  }
  const buckets = await args.request();
  recordCodexRateLimits({ buckets, source: "rpc", now });
  return buckets;
}

/** Minimal shape of an App Server client, so this module stays cycle-free. */
export interface CodexRateLimitsRequester {
  request<T>(method: string, params: unknown): Promise<T>;
}

/** The active `account/rateLimits/read` RPC, mapped to bucket snapshots. */
export async function requestCodexRateLimitBuckets(
  client: CodexRateLimitsRequester,
): Promise<CodexRateLimitSnapshot[]> {
  return mapCodexRateLimitBuckets(
    await client.request<unknown>("account/rateLimits/read", {}),
  );
}

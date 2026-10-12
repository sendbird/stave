import type { CodexRateLimitSnapshot } from "../../src/lib/providers/provider.types";
import { mapCodexRateLimitBuckets } from "./codex-snapshot-mappers";

export type CodexRateLimitUpdate = Partial<CodexRateLimitSnapshot> & Pick<CodexRateLimitSnapshot, "limitId">;
const FIELDS = ["limitName", "planType", "primary", "secondary", "individualLimit", "credits", "spendControlReached"] as const;

/** Rolling notifications omit unavailable fields; an explicit zero budget still clears its percentage. */
export function mapCodexRateLimitUpdates(params: { rateLimits?: unknown }): CodexRateLimitUpdate[] {
  const raw = params.rateLimits;
  if (!raw || typeof raw !== "object") return [];
  const mapped = mapCodexRateLimitBuckets({ rateLimits: raw })[0]!;
  const update: CodexRateLimitUpdate = { ...mapped };
  for (const key of FIELDS) {
    if ((raw as Record<string, unknown>)[key] == null) delete update[key];
  }
  return [update];
}

export function codexBucketKey(bucket: Pick<CodexRateLimitSnapshot, "limitId"> & Partial<CodexRateLimitSnapshot>) {
  return bucket.limitId ?? bucket.limitName ?? "unnamed";
}

export function mergeCodexRateLimitUpdates(previous: CodexRateLimitSnapshot[], updates: CodexRateLimitUpdate[]) {
  const buckets = new Map(previous.map((bucket) => [codexBucketKey(bucket), bucket]));
  for (const update of updates) {
    const key = codexBucketKey(update);
    const empty: CodexRateLimitSnapshot = { limitId: null, limitName: null, planType: null,
      primary: null, secondary: null, credits: null, individualLimit: null, spendControlReached: null };
    buckets.set(key, { ...empty, ...buckets.get(key), ...update });
  }
  return [...buckets.values()];
}

import type {
  CursorUsageSnapshot,
  KiroUsageSnapshot,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { providerConfigurationKey } from "../../src/lib/providers/provider-readiness";
import { fetchCursorUsageSnapshot } from "./rate-limits/cursor-usage-fetcher";
import { fetchKiroUsageSnapshot } from "./rate-limits/kiro-usage-fetcher";
import { readProviderUsage } from "./rate-limits/usage-read-policy";

export type OptionalProviderAccess = "ready" | "unavailable" | "unknown";

/** Capacity establishes access even when it is exhausted; quota guards own that case. */
export function accountUsageAccess(
  snapshot: CursorUsageSnapshot | KiroUsageSnapshot,
): OptionalProviderAccess {
  if (snapshot.source === "unavailable") return "unknown";
  if ("overagesEnabled" in snapshot && snapshot.overagesEnabled) return "ready";
  if (
    (snapshot.monthly?.limit ?? 0) > 0 ||
    snapshot.buckets.some((bucket) => (bucket.limit ?? 0) > 0)
  )
    return "ready";
  if (
    snapshot.monthly?.limit === 0 ||
    (!snapshot.monthly && snapshot.buckets.length === 0)
  )
    return "unavailable";
  // A percentage or a plan label alone cannot establish an account's capacity.
  return "unknown";
}

export async function readOptionalProviderAccess(
  args: {
    providerId: "cursor" | "kiro";
    runtimeOptions?: ProviderRuntimeOptions;
    force?: boolean;
  },
  dependencies: {
    cursor?: typeof fetchCursorUsageSnapshot;
    kiro?: typeof fetchKiroUsageSnapshot;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<OptionalProviderAccess> {
  // Automated app launches must never query the user's subscription.
  if (
    (dependencies.env ?? process.env).STAVE_DISABLE_ACCOUNT_USAGE_READS === "1"
  )
    return "unknown";
  let lastReadFailed = false;
  try {
    const result = await readProviderUsage({
      key: `optional-access:${args.providerId}:${providerConfigurationKey(args.providerId, args.runtimeOptions)}`,
      force: args.force,
      ttlMs: 5 * 60_000,
      classify: (value: OptionalProviderAccess) =>
        value === "unknown" ? "failed" : "ok",
      onResult: (feedback) => {
        lastReadFailed = feedback.lastReadFailed;
      },
      request: async () =>
        accountUsageAccess(
          args.providerId === "cursor"
            ? await (dependencies.cursor ?? fetchCursorUsageSnapshot)()
            : await (dependencies.kiro ?? fetchKiroUsageSnapshot)({
                runtimeOptions: args.runtimeOptions,
              }),
        ),
    });
    // The usage cache may serve lastOk during backoff. It is not current proof of access.
    return lastReadFailed ? "unknown" : result;
  } catch {
    return "unknown";
  }
}

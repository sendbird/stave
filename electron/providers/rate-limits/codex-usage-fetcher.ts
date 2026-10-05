import { withProviderAccountScope } from "../../provider-accounts/runtime-scope";
import type { CodexUsageSnapshot } from "../../../src/lib/providers/provider.types";
import { getCodexAppServerClientFromRuntimeOptions } from "../codex-app-server-runtime";
import {
  requestCodexRateLimitBuckets,
  resolveCodexRateLimitReading,
} from "../codex-rate-limits-cache";
import type { StreamTurnArgs } from "../types";

const observations = new WeakMap<CodexUsageSnapshot, { fresh: boolean; observedAt: number }>();

/** Host-only provenance; it is never serialized with the snapshot. */
export function readCodexUsageObservation(snapshot: CodexUsageSnapshot) {
  return observations.get(snapshot);
}

/**
 * Codex rate-limit buckets for the global status bar.
 *
 * Deliberately avoids the heavy `getCodexAppServerSnapshot` call
 * (account/skills/plugins/threads/...) — the meter needs the rate-limit
 * section only. Readings are served from the `account/rateLimits/updated`
 * cache the runtime fills during a turn, so an active session costs no extra
 * ChatGPT request; the active `account/rateLimits/read` RPC runs only when
 * that cache has aged out or `force` demands a live reading.
 */
export async function fetchCodexUsageSnapshot(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  force?: boolean;
}): Promise<CodexUsageSnapshot> {
  return withProviderAccountScope(args.runtimeOptions, async () => {
  try {
    const reading = await resolveCodexRateLimitReading({
      force: args.force,
      request: () =>
        requestCodexRateLimitBuckets(
          getCodexAppServerClientFromRuntimeOptions(args),
        ),
    });
    const snapshot: CodexUsageSnapshot = { source: "rpc", buckets: reading.entry.buckets, error: null };
    observations.set(snapshot, { fresh: reading.fresh, observedAt: reading.entry.updatedAt });
    return snapshot;
  } catch (error) {
    return {
      source: "unavailable",
      buckets: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
  });
}

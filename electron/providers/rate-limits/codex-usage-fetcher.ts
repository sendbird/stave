import type { CodexUsageSnapshot } from "../../../src/lib/providers/provider.types";
import { getCodexAppServerClientFromRuntimeOptions } from "../codex-app-server-runtime";
import {
  requestCodexRateLimitBuckets,
  resolveCodexRateLimitBuckets,
} from "../codex-rate-limits-cache";
import type { StreamTurnArgs } from "../types";

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
  try {
    const buckets = await resolveCodexRateLimitBuckets({
      force: args.force,
      request: () =>
        requestCodexRateLimitBuckets(
          getCodexAppServerClientFromRuntimeOptions(args),
        ),
    });
    return { source: "rpc", buckets, error: null };
  } catch (error) {
    return {
      source: "unavailable",
      buckets: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

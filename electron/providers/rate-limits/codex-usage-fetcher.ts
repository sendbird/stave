import type { CodexUsageSnapshot } from "../../../src/lib/providers/provider.types";
import { fetchCodexRateLimitBuckets } from "../codex-app-server-runtime";
import type { StreamTurnArgs } from "../types";

/**
 * Codex rate-limit buckets for the global status bar. Thin wrapper around
 * the existing `account/rateLimits/read` app-server RPC (already used by
 * `getCodexAppServerSnapshot` for the Settings > Codex panel) so the status
 * bar can poll just the rate-limit data without the account/skills/plugins/
 * threads sections that snapshot also loads.
 */
export async function fetchCodexUsageSnapshot(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<CodexUsageSnapshot> {
  try {
    const buckets = await fetchCodexRateLimitBuckets(args);
    return { source: "rpc", buckets, error: null };
  } catch (error) {
    return {
      source: "unavailable",
      buckets: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

import type { RateLimitsSnapshotResponse } from "../../../src/lib/providers/provider.types";
import type { StreamTurnArgs } from "../types";
import { fetchClaudeUsageSnapshot } from "./claude-usage-fetcher";
import { fetchCodexUsageSnapshot } from "./codex-usage-fetcher";

/**
 * Combined Claude + Codex usage snapshot for the global status bar. Each
 * provider is fetched independently so one provider being unavailable never
 * blocks the other from reporting.
 */
export async function getRateLimitsSnapshot(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<RateLimitsSnapshotResponse> {
  const [claude, codex] = await Promise.all([
    fetchClaudeUsageSnapshot(),
    fetchCodexUsageSnapshot({ runtimeOptions: args.runtimeOptions }),
  ]);
  return { claude, codex };
}

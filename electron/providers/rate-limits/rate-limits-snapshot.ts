import { emptyRateLimitsSnapshot } from "../../../src/lib/providers/account-usage-block";
import type {
  ProviderId,
  RateLimitsSnapshotResponse,
} from "../../../src/lib/providers/provider.types";
import type { StreamTurnArgs } from "../types";
import { fetchClaudeUsageSnapshot } from "./claude-usage-fetcher";
import { fetchCodexUsageSnapshot } from "./codex-usage-fetcher";
import { fetchCursorUsageSnapshot } from "./cursor-usage-fetcher";
import { fetchKiroUsageSnapshot } from "./kiro-usage-fetcher";

function shouldFetchProvider(
  providerId: ProviderId,
  providers: readonly ProviderId[] | undefined,
) {
  return !providers || providers.length === 0 || providers.includes(providerId);
}

/**
 * Combined provider usage snapshot for the global status bar. Each
 * provider is fetched independently so one provider being unavailable never
 * blocks the other from reporting. Callers that only need one provider
 * (pre-send usage checks) can pass `providers` to skip the rest.
 */
export async function getRateLimitsSnapshot(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  providers?: ProviderId[];
}): Promise<RateLimitsSnapshotResponse> {
  const providers = args.providers;
  const [claude, codex, cursor, kiro] = await Promise.all([
    shouldFetchProvider("claude-code", providers)
      ? fetchClaudeUsageSnapshot()
      : Promise.resolve(emptyRateLimitsSnapshot().claude),
    shouldFetchProvider("codex", providers)
      ? fetchCodexUsageSnapshot({ runtimeOptions: args.runtimeOptions })
      : Promise.resolve(emptyRateLimitsSnapshot().codex),
    shouldFetchProvider("cursor", providers)
      ? fetchCursorUsageSnapshot()
      : Promise.resolve(emptyRateLimitsSnapshot().cursor),
    shouldFetchProvider("kiro", providers)
      ? fetchKiroUsageSnapshot(args)
      : Promise.resolve(emptyRateLimitsSnapshot().kiro),
  ]);
  return { claude, codex, cursor, kiro };
}

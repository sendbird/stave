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
import { readProviderUsage } from "./usage-read-policy";

/**
 * Who asked for a forced read. A manual refresh is floored so the button
 * cannot be held down; the pre-send near-limit check is not, because its only
 * job is to be correct at the instant a turn is dispatched.
 */
export type RateLimitsForceReason = "manual" | "dispatch-guard";

function shouldFetchProvider(
  providerId: ProviderId,
  providers: readonly ProviderId[] | undefined,
) {
  return !providers || providers.length === 0 || providers.includes(providerId);
}

/**
 * The fetchers report failure as an `unavailable` snapshot rather than by
 * throwing, so the read policy needs this to know when to start backing off.
 */
function classifySnapshot(value: { source: string }) {
  return value.source === "unavailable" ? ("failed" as const) : ("ok" as const);
}

/**
 * Injectable so the read policy, the CLI-fallback boundary, and the provider
 * filter can be unit-tested without touching a real account. Production always
 * uses the defaults.
 */
export interface UsageFetchers {
  claude: typeof fetchClaudeUsageSnapshot;
  codex: typeof fetchCodexUsageSnapshot;
  cursor: typeof fetchCursorUsageSnapshot;
  kiro: typeof fetchKiroUsageSnapshot;
}

const defaultFetchers: UsageFetchers = {
  claude: fetchClaudeUsageSnapshot,
  codex: fetchCodexUsageSnapshot,
  cursor: fetchCursorUsageSnapshot,
  kiro: fetchKiroUsageSnapshot,
};

/**
 * Combined provider usage snapshot for the global status bar.
 *
 * Each provider is fetched independently so one being unavailable never blocks
 * another, and each goes through the shared read policy: a short per-provider
 * cache, geometric backoff once a provider starts failing, and a floor on how
 * often `force` can bypass the cache. Callers that only need one provider
 * (pre-send usage checks) pass `providers` to skip the rest.
 *
 * `force` marks a read that a user action is waiting on — a manual refresh, or
 * the near-limit check in front of a dispatch. It bypasses the cache and the
 * backoff, and it is the only thing that may launch a provider CLI. Background
 * polling never does either.
 *
 * A provider whose fetcher throws is reported as unavailable rather than
 * failing the whole snapshot: the other three providers are unrelated accounts
 * and there is no reason for one broken credential to blank the status bar.
 */
export async function getRateLimitsSnapshot(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  providers?: ProviderId[];
  /** Skip provider-side caches (user-initiated refresh, near-limit checks). */
  force?: boolean;
  reason?: RateLimitsForceReason;
  fetchers?: Partial<UsageFetchers>;
}): Promise<RateLimitsSnapshotResponse> {
  const providers = args.providers;
  const force = args.force;
  const fetchers = { ...defaultFetchers, ...args.fetchers };
  const forceFloorMs = args.reason === "dispatch-guard" ? 0 : undefined;
  const empty = emptyRateLimitsSnapshot();

  function read<K extends keyof UsageFetchers>(
    key: K,
    providerId: ProviderId,
    request: () => Promise<RateLimitsSnapshotResponse[K]>,
  ): Promise<RateLimitsSnapshotResponse[K]> {
    if (!shouldFetchProvider(providerId, providers)) {
      return Promise.resolve(empty[key]);
    }
    return readProviderUsage({
      key: providerId,
      force,
      forceFloorMs,
      classify: classifySnapshot,
      request,
    }).catch(() => empty[key]);
  }

  const [claude, codex, cursor, kiro] = await Promise.all([
    read("claude", "claude-code", () =>
      fetchers.claude({ allowCliFallback: force === true }),
    ),
    read("codex", "codex", () =>
      fetchers.codex({ runtimeOptions: args.runtimeOptions, force }),
    ),
    read("cursor", "cursor", () => fetchers.cursor()),
    read("kiro", "kiro", () => fetchers.kiro(args)),
  ]);
  return { claude, codex, cursor, kiro };
}

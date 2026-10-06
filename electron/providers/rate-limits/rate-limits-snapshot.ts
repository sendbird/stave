import { providerAccountKey, withProviderAccountScope } from "../../provider-accounts/runtime-scope";
import { currentClaudeGateway, peekApiConnection } from "../../provider-accounts/gateway-runtime";
import { emptyRateLimitsSnapshot } from "../../../src/lib/providers/account-usage-block";
import type {
  ProviderId,
  RateLimitsSnapshotResponse,
} from "../../../src/lib/providers/provider.types";
import type { StreamTurnArgs } from "../types";
import { fetchClaudeUsageSnapshot } from "./claude-usage-fetcher";
import { fetchCodexUsageSnapshot, readCodexUsageObservation } from "./codex-usage-fetcher";
import { fetchCursorUsageSnapshot } from "./cursor-usage-fetcher";
import { fetchKiroUsageSnapshot } from "./kiro-usage-fetcher";
import { readProviderUsage } from "./usage-read-policy";
import { isOptionalProvider } from "../../../src/lib/providers/provider-readiness";
import { optionalProviderReadKey } from "../optional-provider-tooling";
import { publishQuotaObservation, type QuotaObservationMetadata } from "./quota-observations";
import type { QuotaReadFeedback } from "../../../src/lib/providers/quota-read-feedback";
import { CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS } from "../codex-rate-limits-cache";

/**
 * Who asked for a forced read. A manual refresh is floored so the button
 * cannot be held down; the pre-send near-limit check is not, because its only
 * job is to be correct at the instant a turn is dispatched.
 */
export type RateLimitsForceReason = "manual" | "dispatch-guard";

/**
 * Turns every account-usage read into an immediate `unavailable` answer.
 *
 * Each launch otherwise reads every connected provider's usage with the
 * signed-in user's own credentials, and an automated run that launches Stave
 * dozens of times (the Electron e2e harness) turns that into rate-limited
 * traffic against those accounts. Set to `1` for automated launches only.
 */
export const ACCOUNT_USAGE_READS_DISABLED_ENV = "STAVE_DISABLE_ACCOUNT_USAGE_READS";

export function accountUsageReadsDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[ACCOUNT_USAGE_READS_DISABLED_ENV] === "1";
}

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
  optionalReadKey?: typeof optionalProviderReadKey;
  /** Host-only persistence hook. Cached responses are not new observations. */
  onObservation?: (snapshot: RateLimitsSnapshotResponse, metadata: QuotaObservationMetadata) => void;
  env?: NodeJS.ProcessEnv;
}): Promise<RateLimitsSnapshotResponse> {
  if (accountUsageReadsDisabled(args.env)) {
    const disabled: QuotaReadFeedback = { status: "unavailable", reason: "unavailable",
      nextRefreshAt: null, nextAutomaticReadAt: null, lastReadFailed: false };
    const providerIds: ProviderId[] = ["claude-code", "codex", "cursor", "kiro"];
    return {
      ...emptyRateLimitsSnapshot(),
      reads: Object.fromEntries(
        providerIds
          .filter((providerId) => shouldFetchProvider(providerId, args.providers))
          .map((providerId) => [providerId, disabled]),
      ),
    };
  }
  return withProviderAccountScope(args.runtimeOptions, async () => {
  const providers = args.providers;
  const force = args.force;
  const fetchers = { ...defaultFetchers, ...args.fetchers };
  const forceFloorMs = args.reason === "dispatch-guard" ? 0 : undefined;
  const empty = emptyRateLimitsSnapshot();
  const reads: NonNullable<RateLimitsSnapshotResponse["reads"]> = {};
  const unavailable: QuotaReadFeedback = { status: "unavailable", reason: "unavailable",
    nextRefreshAt: null, nextAutomaticReadAt: null, lastReadFailed: false };

  async function read<K extends keyof UsageFetchers>(
    key: K,
    providerId: ProviderId,
    request: () => Promise<RateLimitsSnapshotResponse[K]>,
  ): Promise<RateLimitsSnapshotResponse[K]> {
    if (!shouldFetchProvider(providerId, providers)) {
      return empty[key];
    }
    if ((providerId === "claude-code" && currentClaudeGateway()) || (providerId === "codex" && peekApiConnection("codex"))) {
      reads[providerId] = unavailable;
      return { ...empty[key], error: "API billing through an API connection: subscription quota is not available." };
    }
    const readKey = isOptionalProvider(providerId)
      ? (args.optionalReadKey ?? optionalProviderReadKey)(providerId, args.runtimeOptions)
      : providerAccountKey(providerId, providerId);
    if (!readKey) { reads[providerId] = unavailable; return empty[key]; }
    const value = await readProviderUsage({
      key: readKey,
      force,
      forceFloorMs,
      classify: classifySnapshot,
      onResult: (feedback) => { reads[providerId] = feedback; },
      request: async () => {
        const fresh = await request();
        const provenance = key === "codex"
          ? readCodexUsageObservation(fresh as RateLimitsSnapshotResponse["codex"])
          : undefined;
        if (classifySnapshot(fresh) === "ok" && (!isOptionalProvider(providerId) ||
          readKey === (args.optionalReadKey ?? optionalProviderReadKey)(providerId, args.runtimeOptions)) &&
          provenance?.fresh !== false) {
          const snapshot = { ...empty, [key]: fresh };
          const metadata = publishQuotaObservation(snapshot, provenance?.observedAt);
          args.onObservation?.(snapshot, metadata);
        }
        return fresh;
      },
    }).catch(() => empty[key]);
    if (isOptionalProvider(providerId) && readKey !== (args.optionalReadKey ?? optionalProviderReadKey)(providerId, args.runtimeOptions)) {
      reads[providerId] = unavailable;
      return empty[key];
    }
    const provenance = key === "codex" ? readCodexUsageObservation(value as RateLimitsSnapshotResponse["codex"]) : undefined;
    const feedback = reads[providerId];
    if (provenance?.fresh === false && feedback) {
      reads[providerId] = { ...feedback, status: "cached",
        reason: feedback.status === "fresh" ? "provider-cache" : feedback.reason,
        nextAutomaticReadAt: new Date(Math.max(Date.parse(feedback.nextAutomaticReadAt ?? "") || 0,
          provenance.observedAt + CODEX_RATE_LIMITS_ACTIVE_REFRESH_MS)).toISOString() };
    }
    return value;
  }

  const [claude, codex, cursor, kiro] = await Promise.all([
    read("claude", "claude-code", () =>
      fetchers.claude({ allowCliFallback: force === true }),
    ),
    read("codex", "codex", () =>
      fetchers.codex({ runtimeOptions: args.runtimeOptions, force }),
    ),
    read("cursor", "cursor", () => fetchers.cursor()),
    read("kiro", "kiro", () => fetchers.kiro({
      ...args,
      usageIdentity: (args.optionalReadKey ?? optionalProviderReadKey)("kiro", args.runtimeOptions) ?? undefined,
    })),
  ]);
  return { claude, codex, cursor, kiro, reads };
  });
}

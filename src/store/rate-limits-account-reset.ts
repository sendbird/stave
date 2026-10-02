import {
  emptyRateLimitsSnapshot,
  mergeRateLimitsSnapshots,
} from "@/lib/providers/account-usage-block";
import {
  selectedProviderAccount,
  type ProviderAccountSelection,
} from "@/lib/providers/provider-account-selection";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AppState } from "./app-store.types";

/**
 * Usage belongs to an account, so switching one provider's account makes only
 * that provider's numbers stale. The other providers keep their readings, and
 * nothing goes blank that the switch did not touch.
 */

const ACCOUNT_PROVIDERS = ["claude-code", "codex"] as const;

/** Providers whose selected account differs; an unset id and System default are the same account. */
export function providersWithChangedAccount(
  previous: ProviderAccountSelection,
  next: ProviderAccountSelection,
): ProviderId[] {
  return ACCOUNT_PROVIDERS.filter(
    (providerId) =>
      selectedProviderAccount(providerId, previous) !==
      selectedProviderAccount(providerId, next),
  );
}

/**
 * Clear the readings of `providers` only. Their freshness entries go too, so
 * the next read counts as the first for the new account and a late response
 * for the old one cannot land (see `refreshRateLimits`).
 */
export function resetRateLimitsForProviders(
  state: Pick<AppState, "rateLimitsSnapshot" | "rateLimitsUpdatedAtByProvider">,
  providers: readonly ProviderId[],
): Pick<AppState, "rateLimitsSnapshot" | "rateLimitsUpdatedAtByProvider"> {
  if (providers.length === 0) {
    return {
      rateLimitsSnapshot: state.rateLimitsSnapshot,
      rateLimitsUpdatedAtByProvider: state.rateLimitsUpdatedAtByProvider,
    };
  }
  const updatedAt = { ...state.rateLimitsUpdatedAtByProvider };
  for (const providerId of providers) {
    delete updatedAt[providerId];
  }
  return {
    rateLimitsSnapshot: state.rateLimitsSnapshot
      ? mergeRateLimitsSnapshots({
          current: state.rateLimitsSnapshot,
          incoming: emptyRateLimitsSnapshot(),
          providers,
        })
      : null,
    rateLimitsUpdatedAtByProvider: updatedAt,
  };
}

/** Count reads in flight per provider, so a meter can tell "reading" from "unavailable". */
export function adjustRateLimitsInFlight(
  inFlight: AppState["rateLimitsInFlightByProvider"],
  providers: readonly ProviderId[],
  delta: 1 | -1,
): AppState["rateLimitsInFlightByProvider"] {
  const next = { ...inFlight };
  for (const providerId of providers) {
    const count = (next[providerId] ?? 0) + delta;
    if (count > 0) next[providerId] = count;
    else delete next[providerId];
  }
  return next;
}

/**
 * A provider's numbers are on their way: no reading for its current account
 * yet (never read, or reset by an account switch) and a read is in flight.
 */
export function isRateLimitsReadPending(
  state: Pick<AppState, "rateLimitsUpdatedAtByProvider" | "rateLimitsInFlightByProvider">,
  providerId: ProviderId,
): boolean {
  return (
    !state.rateLimitsUpdatedAtByProvider[providerId] &&
    (state.rateLimitsInFlightByProvider[providerId] ?? 0) > 0
  );
}

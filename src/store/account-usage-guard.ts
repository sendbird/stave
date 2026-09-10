import {
  resolveAccountUsageBlock,
  resolveTightestAccountUsageWindow,
} from "@/lib/providers/account-usage-block";
import { toast } from "@/lib/notifications/toast";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";

export async function guardSendAgainstAccountUsage(
  getState: () => AppState,
  providerId: ProviderId,
  options?: { cachedOnly?: boolean },
): Promise<Extract<SendUserMessageResult, { status: "blocked" }> | null> {
  const enabled = getState().settings.blockTurnsWhenAccountLimitReached;
  if (!enabled) {
    return null;
  }
  const state = getState();
  const usage = resolveTightestAccountUsageWindow({
    providerId,
    snapshot: state.rateLimitsSnapshot,
  });
  // Use the latest poll result immediately. Only near-limit dispatches need
  // another round trip; already-exhausted accounts can be rejected from cache.
  const cachedBlock = resolveAccountUsageBlock({
    providerId,
    snapshot: state.rateLimitsSnapshot,
  });
  if (!options?.cachedOnly && !cachedBlock) {
    if (usage != null && usage.usedPercent >= 97) {
      await state.refreshRateLimits({
        providers: [providerId],
        force: true,
        reason: "dispatch-guard",
      });
    } else if (!usage) {
      // Initial/unavailable usage must not hold the composer hostage.
      void state
        .refreshRateLimits({ providers: [providerId] })
        .catch(() => undefined);
    }
  }
  const block = resolveAccountUsageBlock({
    providerId,
    snapshot: getState().rateLimitsSnapshot,
  });
  if (!block) {
    return null;
  }
  toast.warning("Account usage limit reached", {
    description: block.message,
  });
  return {
    status: "blocked",
    reason: "account-limit",
    message: block.message,
  };
}

export function isAccountUsageBlockingFromState(args: {
  providerId: ProviderId;
  state: Pick<AppState, "settings" | "rateLimitsSnapshot">;
}): boolean {
  return (
    args.state.settings.blockTurnsWhenAccountLimitReached &&
    resolveAccountUsageBlock({
      providerId: args.providerId,
      snapshot: args.state.rateLimitsSnapshot,
    }) != null
  );
}

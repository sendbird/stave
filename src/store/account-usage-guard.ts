import { resolveAccountUsageBlock } from "@/lib/providers/account-usage-block";
import { toast } from "@/lib/notifications/toast";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";

export async function guardSendAgainstAccountUsage(
  getState: () => AppState,
  providerId: ProviderId,
): Promise<Extract<SendUserMessageResult, { status: "blocked" }> | null> {
  const enabled = getState().settings.blockTurnsWhenAccountLimitReached;
  if (!enabled) {
    return null;
  }
  await getState().refreshRateLimits({ providers: [providerId] });
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

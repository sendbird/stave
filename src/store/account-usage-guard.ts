import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
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
  options?: { cachedOnly?: boolean; model?: string; accountProfileId?: string },
): Promise<Extract<SendUserMessageResult, { status: "blocked" }> | null> {
  const enabled = getState().settings.blockTurnsWhenAccountLimitReached;
  if (!enabled) {
    return null;
  }
  const state = getState();
  // A queued turn retains its account even after the global selection changes.
  // Never block that turn using the newly selected account's cached usage.
  if (options?.accountProfileId && options.accountProfileId !== selectedProviderAccount(providerId, state.settings)) {
    const read = window.api?.provider?.getRateLimitsSnapshot;
    if (!read || options.cachedOnly) return null;
    const runtimeOptions = providerId === "codex"
      ? { codexAccountProfileId: options.accountProfileId, codexBinaryPath: state.settings.codexBinaryPath || undefined }
      : { claudeAccountProfileId: options.accountProfileId, claudeBinaryPath: state.settings.claudeBinaryPath || undefined };
    const snapshot = await read({ providers: [providerId], runtimeOptions, force: true, reason: "dispatch-guard" }).catch(() => null);
    const block = snapshot && resolveAccountUsageBlock({ providerId, model: options.model, snapshot });
    if (!block) return null;
    toast.warning("Account usage limit reached", { description: block.message });
    return { status: "blocked", reason: "account-limit", message: block.message };
  }
  const usage = resolveTightestAccountUsageWindow({
    providerId,
    model: options?.model,
    snapshot: state.rateLimitsSnapshot,
  });
  // Use the latest poll result immediately. Only near-limit dispatches need
  // another round trip; already-exhausted accounts can be rejected from cache.
  const cachedBlock = resolveAccountUsageBlock({
    providerId,
    model: options?.model,
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
  if (selectedProviderAccount(providerId, state.settings) !== selectedProviderAccount(providerId, getState().settings)) return null;
  const block = resolveAccountUsageBlock({
    providerId,
    model: options?.model,
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
  model?: string | null;
  state: Pick<AppState, "settings" | "rateLimitsSnapshot">;
}): boolean {
  return (
    args.state.settings.blockTurnsWhenAccountLimitReached &&
    resolveAccountUsageBlock({
      providerId: args.providerId,
      model: args.model ?? undefined,
      snapshot: args.state.rateLimitsSnapshot,
    }) != null
  );
}

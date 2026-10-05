import { i18n } from "@/i18n/runtime";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import {
  resolveAccountUsageBlock,
  resolveTightestAccountUsageWindow,
  type AccountUsageBlock,
} from "@/lib/providers/account-usage-block";
import { toast } from "@/lib/notifications/toast";
import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";

function buildAccountLimitBlockedResult(
  block: AccountUsageBlock,
  model: string | undefined,
  accountProfileId: string,
): Extract<SendUserMessageResult, { status: "blocked" }> {
  return {
    status: "blocked",
    reason: "account-limit",
    message: block.message,
    usageLimit: {
      providerId: block.providerId,
      accountProfileId,
      ...(model ? { model } : {}),
      windowLabel: block.windowLabel,
      resetsAt: block.resetsAt == null ? null : block.resetsAt * 1000,
    },
  };
}

/** Read a captured execution account without replacing the selected account's meter. */
export async function readProviderAccountUsage(
  getState: () => AppState,
  providerId: ProviderId,
  accountProfileId: string,
) {
  const read = window.api?.provider?.getRateLimitsSnapshot;
  if (!read) return null;
  const settings = getState().settings;
  const runtimeOptions: ProviderRuntimeOptions = providerId === "codex"
    ? { codexAccountProfileId: accountProfileId, codexBinaryPath: settings.codexBinaryPath || undefined }
    : providerId === "claude-code"
      ? { claudeAccountProfileId: accountProfileId, claudeBinaryPath: settings.claudeBinaryPath || undefined }
      : providerId === "cursor"
        ? { cursorBinaryPath: settings.cursorBinaryPath || undefined }
        : { kiroBinaryPath: settings.kiroBinaryPath || undefined };
  try {
    return await read({ providers: [providerId], runtimeOptions, force: true, reason: "dispatch-guard" });
  } catch {
    return null;
  }
}

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
  const accountProfileId = options?.accountProfileId ?? selectedProviderAccount(providerId, state.settings);
  // A queued turn retains its account even after the global selection changes.
  // Never block that turn using the newly selected account's cached usage.
  if (options?.accountProfileId && options.accountProfileId !== selectedProviderAccount(providerId, state.settings)) {
    if (options.cachedOnly) return null;
    const snapshot = await readProviderAccountUsage(getState, providerId, accountProfileId);
    const block = snapshot && resolveAccountUsageBlock({ providerId, model: options.model, snapshot });
    if (!block) return null;
    toast.warning(i18n.t("notifications:accountUsageGuard.accountUsageLimitReached"), { description: block.message });
    return buildAccountLimitBlockedResult(block, options.model, accountProfileId);
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
  if (selectedProviderAccount(providerId, state.settings) !== selectedProviderAccount(providerId, getState().settings)) {
    // The turn still owns the account captured before the await. Its refresh
    // was discarded by the selected meter, so read that account separately.
    return guardSendAgainstAccountUsage(getState, providerId, { ...options, accountProfileId });
  }
  const block = resolveAccountUsageBlock({
    providerId,
    model: options?.model,
    snapshot: getState().rateLimitsSnapshot,
  });
  if (!block) {
    return null;
  }
  toast.warning(i18n.t("notifications:accountUsageGuard.accountUsageLimitReached"), {
    description: block.message,
  });
  return buildAccountLimitBlockedResult(block, options?.model, accountProfileId);
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

import { useMemo } from "react";
import { isAccountUsageBlockingFromState } from "@/store/account-usage-guard";
import { useAppStore } from "@/store/app.store";
import { resolveProviderAccountBlocker } from "./provider-account-blocker";
import { providerConfigurationKey } from "./provider-readiness";
import { useProviderReadinessStore } from "./provider-readiness-store";
import { selectedProviderAccount } from "./provider-account-selection";
import type { ProviderId } from "./provider.types";
import { useProviderAccounts } from "./use-provider-accounts";

/**
 * Live `resolveProviderAccountBlocker` for one provider's selected account.
 * Each store read is a primitive or a stored reference, so a composer that
 * re-renders on every keystroke does not recompute it.
 */
export function useProviderAccountBlocker(providerId: ProviderId) {
  const claudeAccountProfileId = useAppStore((state) => state.settings.claudeAccountProfileId);
  const codexAccountProfileId = useAppStore((state) => state.settings.codexAccountProfileId);
  const claudeBinaryPath = useAppStore((state) => state.settings.claudeBinaryPath);
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  const available = useAppStore((state) => state.providerAvailability[providerId]);
  const limitReached = useAppStore((state) => isAccountUsageBlockingFromState({ providerId, state }));
  const readiness = useProviderReadinessStore((state) => state.providers[providerId]);
  const profiles = useProviderAccounts((state) => state.profiles);
  return useMemo(() => {
    const options = {
      claudeAccountProfileId,
      codexAccountProfileId,
      claudeBinaryPath: claudeBinaryPath || undefined,
      codexBinaryPath: codexBinaryPath || undefined,
    };
    // A readiness answer for another account or binary says nothing about this one.
    const tool = readiness?.configurationKey === providerConfigurationKey(providerId, options) ? readiness.tool : undefined;
    const selectedId = selectedProviderAccount(providerId, options);
    const accounts = profiles.filter((profile) => profile.providerId === providerId);
    return resolveProviderAccountBlocker({
      providerId,
      available,
      tool,
      selectedProfile: accounts.find((profile) => profile.id === selectedId),
      otherAccountCount: accounts.filter((profile) => profile.id !== selectedId).length,
      limitReached,
    });
  }, [available, claudeAccountProfileId, claudeBinaryPath, codexAccountProfileId, codexBinaryPath, limitReached, profiles, providerId, readiness]);
}

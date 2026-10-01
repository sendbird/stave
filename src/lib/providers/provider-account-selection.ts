import { SYSTEM_ACCOUNT_PROFILE_ID } from "./provider-accounts";
import type { ProviderId } from "./provider.types";

export interface ProviderAccountSelection {
  claudeAccountProfileId?: string;
  codexAccountProfileId?: string;
}

export function selectedProviderAccount(providerId: ProviderId, options?: ProviderAccountSelection) {
  return (providerId === "claude-code" ? options?.claudeAccountProfileId : providerId === "codex" ? options?.codexAccountProfileId : undefined) ?? SYSTEM_ACCOUNT_PROFILE_ID;
}

/** Include System default explicitly when capturing a queued or active turn. */
export function snapshotProviderAccounts(options?: ProviderAccountSelection) {
  return {
    claudeAccountProfileId: selectedProviderAccount("claude-code", options),
    codexAccountProfileId: selectedProviderAccount("codex", options),
  };
}

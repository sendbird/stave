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

/**
 * A provider's accounts offer a choice only when there is more than one. With
 * a single account (usually System default) a picker would show one option and
 * say nothing, so every account switch in Stave follows this rule.
 */
export function canSwitchProviderAccount(options: readonly { id: string }[]) {
  return options.length > 1;
}

/**
 * Whether an account picker is drawn: another account to switch to, or the
 * chosen account no longer exists and the picker is the way back to one that
 * does. Without the second case a CLI tab pinned to a removed account would
 * have no control left to recover with.
 */
export function shouldShowProviderAccountPicker(args: {
  options: readonly { id: string }[];
  selectedId: string;
}) {
  return (
    canSwitchProviderAccount(args.options) ||
    (args.options.length > 0 &&
      !args.options.some((option) => option.id === args.selectedId))
  );
}

/**
 * The account a recorded provider session belongs to, named only when it
 * tells the reader something. Providers without Stave accounts (Cursor, Kiro)
 * and System default name nothing; an account that was removed reads
 * "Removed account" rather than its opaque id. Until the account list has
 * loaded, an unknown id names nothing instead of guessing it was removed.
 */
export function describeProviderSessionAccount(args: {
  providerId: ProviderId;
  accountProfileId: string;
  profiles: readonly { id: string; providerId: string; label: string }[];
  profilesLoaded: boolean;
}): string | null {
  if (args.providerId !== "claude-code" && args.providerId !== "codex") return null;
  if (args.accountProfileId === SYSTEM_ACCOUNT_PROFILE_ID) return null;
  const profile = args.profiles.find(
    (candidate) =>
      candidate.providerId === args.providerId &&
      candidate.id === args.accountProfileId,
  );
  if (profile) return profile.label;
  return args.profilesLoaded ? "Removed account" : null;
}

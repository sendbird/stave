import { i18n } from "@/i18n/runtime";
import type { ChatMessage } from "@/types/chat";
import type { ProviderAccountIdentity } from "./provider-account-identity";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProfile,
  type ProviderAccountProviderId,
} from "./provider-accounts";

export interface TurnAccountRef {
  providerId: ProviderAccountProviderId;
  profileId: string;
}

function isAccountProvider(
  providerId: ChatMessage["providerId"],
): providerId is ProviderAccountProviderId {
  return providerId === "claude-code" || providerId === "codex";
}

/**
 * The account a turn ran on, or undefined when the row cannot say.
 *
 * Only Claude Code and Codex have Stave accounts. Electron main stamps the
 * account onto `provider_turn` only when it is not System default, so a row
 * that reached its provider (it has a native session or turn) and carries no
 * account ran on System default. A row that never reached the provider, or
 * one written before turns recorded their native ids, stays unknown rather
 * than guessing.
 */
export function resolveTurnAccountRef(
  message: Pick<
    ChatMessage,
    | "providerId"
    | "nativeAccountProfileId"
    | "nativeProviderSessionId"
    | "nativeProviderTurnId"
  >,
): TurnAccountRef | undefined {
  if (!isAccountProvider(message.providerId)) return undefined;
  if (message.nativeAccountProfileId) {
    return {
      providerId: message.providerId,
      profileId: message.nativeAccountProfileId,
    };
  }
  if (message.nativeProviderSessionId || message.nativeProviderTurnId) {
    return {
      providerId: message.providerId,
      profileId: SYSTEM_ACCOUNT_PROFILE_ID,
    };
  }
  return undefined;
}

export function findTurnAccountProfile(
  profiles: readonly ProviderAccountProfile[],
  ref: TurnAccountRef,
): ProviderAccountProfile | undefined {
  return profiles.find(
    (profile) =>
      profile.providerId === ref.providerId && profile.id === ref.profileId,
  );
}

/**
 * Whether the turn row should name its account inline. With a single account
 * for the provider there is nothing to tell apart, so the name stays in the
 * tooltip and the row stays quiet.
 */
export function shouldShowTurnAccountInline(
  profiles: readonly ProviderAccountProfile[],
  providerId: ProviderAccountProviderId,
): boolean {
  let count = 0;
  for (const profile of profiles) {
    if (profile.providerId === providerId) count += 1;
    if (count > 1) return true;
  }
  return false;
}

/** Whether the turn's account can be asked who it is signed in as. */
export function canProbeTurnAccount(profile: ProviderAccountProfile | undefined) {
  // An API connection has no sign-in, and a removed account has nothing left
  // to ask about.
  return Boolean(profile && !profile.gateway);
}

/**
 * The line under the account name in a turn's tooltip: who the account is
 * signed in as, that it bills through an API connection, or nothing when the
 * answer would not help (a removed account, a check that could not finish).
 */
export function describeTurnAccountDetail(
  profile: ProviderAccountProfile | undefined,
  identity: ProviderAccountIdentity | undefined,
): string | null {
  if (!profile) return null;
  if (profile.gateway) return i18n.t("providers:turnModelInfo.apiBilling");
  if (!identity) return i18n.t("providers:providerAccountIdentity.checkingSignIn");
  if (identity.state === "signed-in") {
    return [identity.email, identity.plan].filter(Boolean).join(" · ") || null;
  }
  if (identity.state === "signed-out") {
    return i18n.t("providers:mcpManagement.notSignedIn");
  }
  return null;
}

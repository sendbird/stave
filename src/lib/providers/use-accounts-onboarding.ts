import { useMemo } from "react";
import { useAppStore } from "@/store/app.store";
import {
  buildAccountsOnboardingChecklist,
  type AccountsOnboardingAccountProviderId,
  type AccountsOnboardingProviderId,
  type CliManagedProviderId,
} from "./accounts-onboarding";
import { useComposerModelSelectorAvailable } from "./accounts-navigation";
import { registeredAccountSignedIn } from "./provider-account-identity";
import type { ProviderAccountProfile } from "./provider-accounts";
import { providerConfigurationKey } from "./provider-readiness";
import { useProviderReadinessStore } from "./provider-readiness-store";
import { useProviderAccountIdentities } from "./use-provider-account-identity";
import { useProviderAccounts } from "./use-provider-accounts";

/** CLI found for a provider: null until its first check answered. */
function useProviderInstalled(providerId: AccountsOnboardingProviderId) {
  return useProviderReadinessStore((state) => {
    const tool = state.providers[providerId]?.tool;
    return tool ? tool.available : null;
  });
}

/**
 * Cursor, Kiro and OpenCode sign in through their own CLI: availability is the
 * readiness gate Stave already applies (authenticated, or managed in the CLI).
 */
function useCliManagedProviderSignedIn(providerId: CliManagedProviderId) {
  return useAppStore((state) => state.providerAvailability[providerId] === true);
}

/** The readiness key for a provider's selected account and binary, as the checks publish it. */
function useSelectedConfigurationKey(providerId: AccountsOnboardingAccountProviderId) {
  const claudeAccountProfileId = useAppStore((state) => state.settings.claudeAccountProfileId);
  const codexAccountProfileId = useAppStore((state) => state.settings.codexAccountProfileId);
  const claudeBinaryPath = useAppStore((state) => state.settings.claudeBinaryPath);
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  return providerConfigurationKey(providerId, {
    claudeAccountProfileId,
    codexAccountProfileId,
    claudeBinaryPath: claudeBinaryPath || undefined,
    codexBinaryPath: codexBinaryPath || undefined,
  });
}

/**
 * A provider can take a turn: availability says so (that covers an API
 * connection with a readable key), the CLI check for the selected account and
 * binary reported authenticated, or a sign-in account that is still registered
 * answered "signed in". A removed account's cached identity never counts.
 */
function useProviderSignedIn(providerId: AccountsOnboardingAccountProviderId, profiles: readonly ProviderAccountProfile[]) {
  const available = useAppStore((state) => state.providerAvailability[providerId] === true);
  const configurationKey = useSelectedConfigurationKey(providerId);
  const authenticated = useProviderReadinessStore((state) => {
    const readiness = state.providers[providerId];
    return readiness?.configurationKey === configurationKey && readiness.tool.authState === "authenticated";
  });
  const identities = useProviderAccountIdentities((state) => state.byKey);
  const registeredSignedIn = useMemo(
    () => registeredAccountSignedIn({ providerId, profiles, identities }),
    [identities, profiles, providerId],
  );
  return available || authenticated || registeredSignedIn;
}

/**
 * Whether a Claude or Codex subscription is in use, for "In use": that
 * provider's CLI is installed and a registered sign-in account works, the same
 * per-provider rule as Getting started's ready.
 */
export function useRegisteredSubscriptionSignedIn() {
  const profiles = useProviderAccounts((state) => state.profiles);
  const identities = useProviderAccountIdentities((state) => state.byKey);
  const claudeKey = useSelectedConfigurationKey("claude-code");
  const codexKey = useSelectedConfigurationKey("codex");
  const claudeAuthenticated = useProviderReadinessStore((state) => {
    const readiness = state.providers["claude-code"];
    return readiness?.configurationKey === claudeKey && readiness.tool.authState === "authenticated";
  });
  const codexAuthenticated = useProviderReadinessStore((state) => {
    const readiness = state.providers.codex;
    return readiness?.configurationKey === codexKey && readiness.tool.authState === "authenticated";
  });
  const claudeInstalled = useProviderInstalled("claude-code");
  const codexInstalled = useProviderInstalled("codex");
  return useMemo(
    () =>
      (claudeInstalled === true && (claudeAuthenticated || registeredAccountSignedIn({ providerId: "claude-code", profiles, identities }))) ||
      (codexInstalled === true && (codexAuthenticated || registeredAccountSignedIn({ providerId: "codex", profiles, identities }))),
    [claudeAuthenticated, claudeInstalled, codexAuthenticated, codexInstalled, identities, profiles],
  );
}

/** The Getting started checklist from live state; recomputed as sign-in and checks change. */
export function useAccountsOnboarding() {
  const claudeInstalled = useProviderInstalled("claude-code");
  const codexInstalled = useProviderInstalled("codex");
  const profiles = useProviderAccounts((state) => state.profiles);
  const claudeSignedIn = useProviderSignedIn("claude-code", profiles);
  const codexSignedIn = useProviderSignedIn("codex", profiles);
  const cursorInstalled = useProviderInstalled("cursor");
  const kiroInstalled = useProviderInstalled("kiro");
  const opencodeInstalled = useProviderInstalled("opencode");
  const cursorSignedIn = useCliManagedProviderSignedIn("cursor");
  const kiroSignedIn = useCliManagedProviderSignedIn("kiro");
  const opencodeSignedIn = useCliManagedProviderSignedIn("opencode");
  const workspaceOpen = useAppStore((state) =>
    Boolean(state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath),
  );
  const skipped = useAppStore((state) => state.settings.accountsOnboarding.skipped);
  const composerOpen = useComposerModelSelectorAvailable();
  return useMemo(() => {
    const extraAccountCount = profiles.filter((profile) => profile.kind !== "system" && !profile.apiConnection).length;
    const connectionCount = new Set(profiles.filter((profile) => profile.apiConnection).map((profile) => profile.id)).size;
    return buildAccountsOnboardingChecklist({
      providers: {
        "claude-code": { installed: claudeInstalled, signedIn: claudeSignedIn },
        codex: { installed: codexInstalled, signedIn: codexSignedIn },
        cursor: { installed: cursorInstalled, signedIn: cursorSignedIn },
        kiro: { installed: kiroInstalled, signedIn: kiroSignedIn },
        opencode: { installed: opencodeInstalled, signedIn: opencodeSignedIn },
      },
      extraAccountCount,
      connectionCount,
      workspaceOpen,
      composerOpen,
      skipped,
    });
  }, [
    composerOpen,
    claudeInstalled, claudeSignedIn, codexInstalled, codexSignedIn,
    cursorInstalled, cursorSignedIn, kiroInstalled, kiroSignedIn, opencodeInstalled, opencodeSignedIn,
    profiles, skipped, workspaceOpen,
  ]);
}

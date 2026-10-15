import { useMemo } from "react";
import { useAppStore } from "@/store/app.store";
import {
  buildAccountsOnboardingChecklist,
  type AccountsOnboardingProviderId,
} from "./accounts-onboarding";
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
 * A provider can take a turn: availability says so (that covers an API
 * connection with a readable key), or one of its sign-in accounts answered
 * "signed in". Each read returns a boolean, so the selectors stay stable.
 */
function useProviderSignedIn(providerId: AccountsOnboardingProviderId) {
  const available = useAppStore((state) => state.providerAvailability[providerId] === true);
  const authenticated = useProviderReadinessStore(
    (state) => state.providers[providerId]?.tool.authState === "authenticated",
  );
  const identitySignedIn = useProviderAccountIdentities((state) =>
    Object.entries(state.byKey).some(
      ([key, identity]) => key.startsWith(`${providerId}:`) && identity?.state === "signed-in",
    ),
  );
  return available || authenticated || identitySignedIn;
}

/** The Getting started checklist from live state; recomputed as sign-in and checks change. */
export function useAccountsOnboarding() {
  const claudeInstalled = useProviderInstalled("claude-code");
  const codexInstalled = useProviderInstalled("codex");
  const claudeSignedIn = useProviderSignedIn("claude-code");
  const codexSignedIn = useProviderSignedIn("codex");
  const profiles = useProviderAccounts((state) => state.profiles);
  const workspaceOpen = useAppStore((state) =>
    Boolean(state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath),
  );
  const skipped = useAppStore((state) => state.settings.accountsOnboarding.skipped);
  return useMemo(() => {
    const extraAccountCount = profiles.filter((profile) => profile.kind !== "system" && !profile.apiConnection).length;
    const connectionCount = new Set(profiles.filter((profile) => profile.apiConnection).map((profile) => profile.id)).size;
    return buildAccountsOnboardingChecklist({
      providers: {
        "claude-code": { installed: claudeInstalled, signedIn: claudeSignedIn },
        codex: { installed: codexInstalled, signedIn: codexSignedIn },
      },
      extraAccountCount,
      connectionCount,
      workspaceOpen,
      skipped,
    });
  }, [claudeInstalled, claudeSignedIn, codexInstalled, codexSignedIn, profiles, skipped, workspaceOpen]);
}

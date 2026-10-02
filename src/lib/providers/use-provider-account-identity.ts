import { useEffect } from "react";
import { create } from "zustand";
import { useAppStore } from "@/store/app.store";
import type { ProviderAccountIdentity } from "./provider-account-identity";
import type { ProviderAccountProviderId } from "./provider-accounts";

const latestRequest = new Map<string, number>();

function identityKey(providerId: ProviderAccountProviderId, profileId: string) {
  return `${providerId}:${profileId}`;
}

/**
 * Sign-in identity for each account, keyed by provider and profile. Electron
 * main caches the probe, so a mount only asks; pass `refresh` after something
 * that changes the answer (the sign-in terminal closing). A late reply for an
 * older request is dropped.
 */
export const useProviderAccountIdentities = create<{
  byKey: Record<string, ProviderAccountIdentity | undefined>;
  load: (args: { providerId: ProviderAccountProviderId; profileId: string; refresh?: boolean }) => Promise<void>;
}>((set) => ({
  byKey: {},
  load: async ({ providerId, profileId, refresh }) => {
    const bridge = window.api?.providerAccounts;
    if (!bridge?.identity) return;
    const key = identityKey(providerId, profileId);
    const request = (latestRequest.get(key) ?? 0) + 1;
    latestRequest.set(key, request);
    const settings = useAppStore.getState().settings;
    const binaryPath = (providerId === "codex" ? settings.codexBinaryPath : settings.claudeBinaryPath) || undefined;
    let identity: ProviderAccountIdentity;
    try {
      const result = await bridge.identity({
        providerId,
        profileId,
        ...(refresh ? { refresh: true } : {}),
        ...(binaryPath ? { binaryPath } : {}),
      });
      identity = result.ok ? result.identity : { state: "unknown", reason: "failed", checkedAt: Date.now() };
    } catch {
      identity = { state: "unknown", reason: "failed", checkedAt: Date.now() };
    }
    if (latestRequest.get(key) !== request) return;
    set((state) => ({ byKey: { ...state.byKey, [key]: identity } }));
  },
}));

/** Row-local read: the row re-renders only when its own account's identity changes. */
export function useProviderAccountIdentity(providerId: ProviderAccountProviderId, profileId: string, enabled = true) {
  const identity = useProviderAccountIdentities((state) => state.byKey[identityKey(providerId, profileId)]);
  useEffect(() => {
    if (enabled) void useProviderAccountIdentities.getState().load({ providerId, profileId });
  }, [providerId, profileId, enabled]);
  return identity;
}

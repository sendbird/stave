import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useAppStore } from "@/store/app.store";
import type { ProviderRuntimeOptions } from "./provider.types";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "./provider-accounts";

const defaults: ProviderAccountProfile[] = ["claude-code", "codex"].map((providerId) => ({
  id: SYSTEM_ACCOUNT_PROFILE_ID, providerId: providerId as "claude-code" | "codex", label: "System default", kind: "system",
}));
let refreshGeneration = 0;
export const useProviderAccounts = create<{
  profiles: ProviderAccountProfile[]; error: string | null; loading: boolean;
  refresh: () => Promise<void>;
}>((set) => ({
  profiles: defaults, error: null, loading: false,
  refresh: async () => {
    if (!window.api?.providerAccounts) return;
    const generation = ++refreshGeneration;
    set({ loading: true, error: null });
    try {
      const result = await window.api.providerAccounts.list();
      if (generation !== refreshGeneration) return;
      if (result.ok) set({ profiles: result.profiles });
      else set({ error: result.message });
    } catch (error) { if (generation === refreshGeneration) set({ error: String(error) }); }
    finally { if (generation === refreshGeneration) set({ loading: false }); }
  },
}));

export function useLoadProviderAccounts() {
  useEffect(() => { const state = useProviderAccounts.getState(); if (!state.loading) void state.refresh(); }, []);
}

/** Global defaults apply only when a request did not capture an explicit account. */
export function useAccountRuntimeOptions(options?: ProviderRuntimeOptions) {
  const claude = useAppStore((s) => s.settings.claudeAccountProfileId);
  const codex = useAppStore((s) => s.settings.codexAccountProfileId);
  return useMemo(() => ({
    ...options,
    claudeAccountProfileId: options?.claudeAccountProfileId ?? claude ?? SYSTEM_ACCOUNT_PROFILE_ID,
    codexAccountProfileId: options?.codexAccountProfileId ?? codex ?? SYSTEM_ACCOUNT_PROFILE_ID,
  }), [options, claude, codex]);
}

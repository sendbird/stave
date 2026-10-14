import { useEffect, useMemo } from "react";
import type { PromptInputRunAccountPool } from "@/components/ai-elements/prompt-input-run-account-pool";
import type { AgentRun } from "@/lib/agent-runs/domain";
import { isPoolableAccount } from "@/lib/agent-runs/account-pool";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";

/**
 * The rows of the pool choice: the account the Run starts on, then the
 * provider's other subscription accounts in Settings order. API connections
 * never appear. Pure, for the hook and its tests.
 */
export function listRunAccountPoolRows(args: {
  providerId: string;
  currentAccountId: string;
  profiles: readonly Pick<ProviderAccountProfile, "id" | "providerId" | "label" | "gateway" | "apiConnection">[];
  excludedAccountIds?: readonly string[];
  /** A live Run's frozen pool: exactly its accounts, in its order. */
  lockedAccountIds?: readonly string[];
}): PromptInputRunAccountPool["accounts"] {
  const subscriptions = args.profiles.filter((profile) => profile.providerId === args.providerId && isPoolableAccount(profile));
  const labelOf = (id: string) => subscriptions.find((profile) => profile.id === id)?.label ?? id.slice(0, 8);
  if (args.lockedAccountIds) {
    return args.lockedAccountIds.map((id, index) => ({ id, label: labelOf(id), current: index === 0, included: true }));
  }
  if (!subscriptions.some((profile) => profile.id === args.currentAccountId)) return [];
  const excluded = new Set(args.excludedAccountIds ?? []);
  const others = subscriptions.filter((profile) => profile.id !== args.currentAccountId);
  return [
    { id: args.currentAccountId, label: labelOf(args.currentAccountId), current: true, included: true },
    ...others.map((profile) => ({ id: profile.id, label: profile.label, current: false, included: !excluded.has(profile.id) })),
  ];
}

/** The draft configures the next Run's pool; a live Run shows the pool it froze. */
export function useRunAccountPool(args: {
  taskId: string;
  providerId: string;
  lockedRun: Pick<AgentRun, "accountPool"> | null;
}): PromptInputRunAccountPool | null {
  const { taskId, providerId, lockedRun } = args;
  const pooled = providerId === "claude-code" || providerId === "codex" ? providerId : null;
  const accountKey = providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
  const profiles = useProviderAccounts((state) => state.profiles);
  const draftAccount = useAppStore((state) => state.promptDraftByTask[taskId]?.runtimeOverrides?.[accountKey]);
  const settingsAccount = useAppStore((state) => state.settings[accountKey]);
  const preference = useAppStore((state) => state.promptDraftByTask[taskId]?.runtimeOverrides?.agentRunAccountPool);
  useEffect(() => {
    const accounts = useProviderAccounts.getState();
    if (pooled && !accounts.loaded && !accounts.loading) void accounts.refresh();
  }, [pooled]);
  const currentAccountId = draftAccount ?? settingsAccount ?? SYSTEM_ACCOUNT_PROFILE_ID;
  const accounts = useMemo(() => pooled ? listRunAccountPoolRows({
    providerId: pooled, currentAccountId, profiles, excludedAccountIds: preference?.excludedAccountIds,
    ...(lockedRun ? { lockedAccountIds: lockedRun.accountPool?.accountIds ?? [] } : {}),
  }) : [], [pooled, currentAccountId, profiles, preference?.excludedAccountIds, lockedRun]);
  if (!pooled) return null;
  // One account offers no choice; a live Run without a pool shows nothing either.
  if (lockedRun ? !lockedRun.accountPool : accounts.length < 2) return null;
  const updatePreference = (patch: { enabled?: boolean; excludedAccountIds?: string[] }) => {
    const store = useAppStore.getState();
    const overrides = store.promptDraftByTask[taskId]?.runtimeOverrides;
    const current = overrides?.agentRunAccountPool;
    store.updatePromptDraft({ taskId, patch: { runtimeOverrides: { ...overrides,
      agentRunAccountPool: { enabled: current?.enabled ?? false, ...(current?.excludedAccountIds ? { excludedAccountIds: current.excludedAccountIds } : {}), ...patch } } } });
  };
  return {
    providerId: pooled,
    enabled: lockedRun ? true : preference?.enabled === true,
    locked: Boolean(lockedRun),
    accounts,
    onEnabledChange: (enabled) => { if (!lockedRun) updatePreference({ enabled }); },
    onAccountIncludedChange: (accountId, included) => {
      if (lockedRun) return;
      const excluded = new Set(useAppStore.getState().promptDraftByTask[taskId]?.runtimeOverrides?.agentRunAccountPool?.excludedAccountIds ?? []);
      if (included) excluded.delete(accountId); else excluded.add(accountId);
      updatePreference({ excludedAccountIds: [...excluded] });
    },
  };
}

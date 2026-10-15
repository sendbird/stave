import { i18n } from "@/i18n/runtime";
import { useProviderAccounts } from "./use-provider-accounts";
import { selectedProviderAccount, type ProviderAccountSelection } from "./provider-account-selection";
import type { ProviderId } from "./provider.types";

let pending: Promise<void> | undefined;

/** Missing renderer metadata is never an unrestricted native account. */
export async function ensureRoutingAccountCatalog(accounts: ProviderAccountSelection, signal: AbortSignal, providers: readonly ProviderId[] = ["codex", "claude-code"]) {
  signal.throwIfAborted();
  const selected = (["codex", "claude-code"] as const).map((providerId) => ({ providerId, id: selectedProviderAccount(providerId, accounts) }))
    .filter(({ providerId, id }) => providers.includes(providerId) && id !== "system-default");
  if (!selected.length) return;
  if (!useProviderAccounts.getState().loaded) {
    pending ??= useProviderAccounts.getState().refresh().finally(() => { pending = undefined; });
    const deadline = AbortSignal.timeout(10_000);
    const interrupted = AbortSignal.any([signal, deadline]);
    let abort!: () => void;
    const stopped = new Promise<never>((_, reject) => { abort = () => reject(new DOMException("Account catalog unavailable", "AbortError")); interrupted.addEventListener("abort", abort, { once: true }); });
    try { await Promise.race([pending, stopped]); }
    finally { interrupted.removeEventListener("abort", abort); }
  }
  signal.throwIfAborted();
  const state = useProviderAccounts.getState();
  if (!state.loaded || selected.some(({ providerId, id }) => !state.profiles.some((profile) => profile.providerId === providerId && profile.id === id)))
    throw new Error(i18n.t("settingsConnections:providerAccountPicker.accountUnavailable"));
}

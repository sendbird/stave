import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { buildApiConnectionCatalogEntries } from "./api-connection-models";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "./provider-accounts";
import { selectedProviderAccount, type ProviderAccountSelection } from "./provider-account-selection";
import type { ProviderId } from "./provider.types";

type ConnectionRuntime = "claude-code" | "codex";
const CONNECTION_RUNTIMES: readonly ConnectionRuntime[] = ["claude-code", "codex"];
type ProfileView = Pick<ProviderAccountProfile, "id" | "providerId" | "label" | "gateway" | "apiConnection">;

/** The subscription account a runtime used last, so leaving a connection returns to it. */
const lastSubscriptionAccount = new Map<ConnectionRuntime, string>();

function isConnectionAccount(profiles: readonly ProfileView[], providerId: ProviderId, accountId: string) {
  return profiles.some((profile) => profile.providerId === providerId && profile.id === accountId && Boolean(profile.gateway));
}

/** The account a model in the picker runs on: its connection, or the runtime's subscription account. */
export function subscriptionAccountFor(args: {
  providerId: ConnectionRuntime;
  selection: ProviderAccountSelection;
  profiles: readonly ProfileView[];
}) {
  const selected = selectedProviderAccount(args.providerId, args.selection);
  if (!isConnectionAccount(args.profiles, args.providerId, selected)) {
    lastSubscriptionAccount.set(args.providerId, selected);
    return selected;
  }
  const remembered = lastSubscriptionAccount.get(args.providerId);
  return remembered && args.profiles.some((profile) => profile.providerId === args.providerId && profile.id === remembered && !profile.gateway)
    ? remembered : SYSTEM_ACCOUNT_PROFILE_ID;
}

/**
 * Account selection for the runtime's own models: a runtime set to an API
 * connection reads its subscription catalog instead, so the picker keeps the
 * runtime's models next to the connection's.
 */
export function subscriptionAccountSelection(selection: ProviderAccountSelection, profiles: readonly ProfileView[]): ProviderAccountSelection {
  return {
    claudeAccountProfileId: subscriptionAccountFor({ providerId: "claude-code", selection, profiles }),
    codexAccountProfileId: subscriptionAccountFor({ providerId: "codex", selection, profiles }),
  };
}

/** The connection a picker option runs on; undefined for the runtime's own models. */
export function connectionOptionKey(providerId: ProviderId, model: string, accountProfileId: string) {
  return `${providerId}:${model}@${accountProfileId}`;
}

/** One group per API connection and runtime it serves, each model tagged with the connection account. */
export function buildConnectionModelSelectorOptions(args: {
  profiles: readonly ProfileView[];
  availabilityByProvider?: Partial<Record<ProviderId, boolean>>;
}): ModelSelectorOption[] {
  return CONNECTION_RUNTIMES.flatMap((runtime) =>
    args.profiles.filter((profile) => profile.providerId === runtime && profile.gateway).flatMap((profile) =>
      buildApiConnectionCatalogEntries({ runtime, profile }).map((entry): ModelSelectorOption => ({
        key: connectionOptionKey(runtime, entry.model, profile.id),
        providerId: runtime,
        model: entry.model,
        label: entry.displayName,
        description: entry.description || undefined,
        isDefault: entry.isDefault || undefined,
        available: args.availabilityByProvider?.[runtime] ?? true,
        group: entry.group,
        accountProfileId: profile.id,
        ...(entry.badge ? { badge: entry.badge } : {}),
      }))));
}

/**
 * The account switch a picked model needs, or null: a connection's model
 * selects that connection; a runtime model picked while a connection is
 * selected returns to the runtime's subscription account.
 */
export function accountSwitchForSelection(args: {
  option: Pick<ModelSelectorOption, "providerId" | "accountProfileId" | "isAuto">;
  selection: ProviderAccountSelection;
  profiles: readonly ProfileView[];
}): { claudeAccountProfileId: string } | { codexAccountProfileId: string } | null {
  const runtime = args.option.providerId;
  if (args.option.isAuto || (runtime !== "claude-code" && runtime !== "codex")) return null;
  const current = selectedProviderAccount(runtime, args.selection);
  const target = args.option.accountProfileId ?? (isConnectionAccount(args.profiles, runtime, current)
    ? subscriptionAccountFor({ providerId: runtime, selection: args.selection, profiles: args.profiles }) : current);
  if (target === current) return null;
  return runtime === "codex" ? { codexAccountProfileId: target } : { claudeAccountProfileId: target };
}

/** For tests: forget the remembered subscription accounts. */
export function resetRememberedSubscriptionAccounts() {
  lastSubscriptionAccount.clear();
}

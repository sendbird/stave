import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import { buildApiConnectionCatalogEntries } from "./api-connection-models";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "./provider-accounts";
import { selectedProviderAccount, type ProviderAccountSelection } from "./provider-account-selection";
import type { ProviderId } from "./provider.types";

type ConnectionRuntime = "claude-code" | "codex";
const CONNECTION_RUNTIMES: readonly ConnectionRuntime[] = ["claude-code", "codex"];
type ProfileView = Pick<ProviderAccountProfile, "id" | "providerId" | "label" | "gateway" | "apiConnection">;
/** The sign-in account each runtime used last, so leaving a connection returns to it. */
export type RememberedSubscriptionAccounts = Partial<Record<ConnectionRuntime, string>>;

function isConnectionRuntime(providerId: ProviderId): providerId is ConnectionRuntime {
  return providerId === "claude-code" || providerId === "codex";
}

/** The API connection a runtime's selected account is, if it is one. */
export function selectedConnectionAccount(providerId: ProviderId, selection: ProviderAccountSelection, profiles: readonly ProfileView[]) {
  if (!isConnectionRuntime(providerId)) return undefined;
  const selected = selectedProviderAccount(providerId, selection);
  return profiles.some((profile) => profile.providerId === providerId && profile.id === selected && Boolean(profile.gateway))
    ? selected : undefined;
}

/** The sign-in account a runtime's own models run on: the selected one, else the one it used last. */
export function subscriptionAccountFor(args: {
  providerId: ConnectionRuntime;
  selection: ProviderAccountSelection;
  profiles: readonly ProfileView[];
  remembered?: RememberedSubscriptionAccounts;
}) {
  const selected = selectedProviderAccount(args.providerId, args.selection);
  if (!selectedConnectionAccount(args.providerId, args.selection, args.profiles)) return selected;
  const remembered = args.remembered?.[args.providerId];
  return remembered && args.profiles.some((profile) => profile.providerId === args.providerId && profile.id === remembered && !profile.gateway)
    ? remembered : SYSTEM_ACCOUNT_PROFILE_ID;
}

/**
 * Account selection for the runtimes' own models: a runtime set to an API
 * connection reads its sign-in catalog instead, so the picker keeps the
 * runtime's models next to the connection's.
 */
export function subscriptionAccountSelection(
  selection: ProviderAccountSelection,
  profiles: readonly ProfileView[],
  remembered?: RememberedSubscriptionAccounts,
): ProviderAccountSelection {
  return {
    claudeAccountProfileId: subscriptionAccountFor({ providerId: "claude-code", selection, profiles, remembered }),
    codexAccountProfileId: subscriptionAccountFor({ providerId: "codex", selection, profiles, remembered }),
  };
}

/** The sign-in accounts to remember now: each runtime whose selected account is not a connection. */
export function subscriptionAccountsToRemember(selection: ProviderAccountSelection, profiles: readonly ProfileView[]): RememberedSubscriptionAccounts {
  return Object.fromEntries(CONNECTION_RUNTIMES.flatMap((runtime) =>
    selectedConnectionAccount(runtime, selection, profiles) ? [] : [[runtime, selectedProviderAccount(runtime, selection)]]));
}

function onAccount(option: ModelSelectorOption, accountProfileId: string): ModelSelectorOption {
  return { ...option, key: `${option.providerId}:${option.model}@${accountProfileId}`, accountProfileId };
}

/**
 * The selected account's rows, tagged with the connection when a runtime's
 * account is one, so their keys match the picker's connection rows and
 * picking one never switches accounts.
 */
export function tagSelectedConnectionOptions(
  options: readonly ModelSelectorOption[],
  selection: ProviderAccountSelection,
  profiles: readonly ProfileView[],
): ModelSelectorOption[] {
  return options.map((option) => {
    const connection = option.isAuto ? undefined : selectedConnectionAccount(option.providerId, selection, profiles);
    return connection && !option.accountProfileId ? onAccount(option, connection) : option;
  });
}

/**
 * One group per API connection and runtime it serves. A row on the selected
 * account takes that account's availability; a row on another connection is
 * offered, and the composer's account line explains a key it cannot read once
 * it is selected.
 */
export function buildConnectionModelSelectorOptions(args: {
  profiles: readonly ProfileView[];
  selection: ProviderAccountSelection;
  availabilityByProvider?: Partial<Record<ProviderId, boolean>>;
}): ModelSelectorOption[] {
  return CONNECTION_RUNTIMES.flatMap((runtime) =>
    args.profiles.filter((profile) => profile.providerId === runtime && profile.gateway).flatMap((profile) => {
      const selected = selectedProviderAccount(runtime, args.selection) === profile.id;
      return buildApiConnectionCatalogEntries({ runtime, profile }).map((entry): ModelSelectorOption => onAccount({
        key: "",
        providerId: runtime,
        model: entry.model,
        label: entry.displayName,
        description: entry.description || undefined,
        isDefault: entry.isDefault || undefined,
        available: selected ? args.availabilityByProvider?.[runtime] ?? true : true,
        group: entry.group,
        ...(entry.badge ? { badge: entry.badge } : {}),
      }, profile.id));
    }));
}

/**
 * The account switch a picked model needs, or null: a connection's model
 * selects that connection; a runtime model picked while a connection is
 * selected returns to the runtime's sign-in account.
 */
export function accountSwitchForSelection(args: {
  option: Pick<ModelSelectorOption, "providerId" | "accountProfileId" | "isAuto">;
  selection: ProviderAccountSelection;
  profiles: readonly ProfileView[];
  remembered?: RememberedSubscriptionAccounts;
}): { claudeAccountProfileId: string } | { codexAccountProfileId: string } | null {
  const runtime = args.option.providerId;
  if (args.option.isAuto || !isConnectionRuntime(runtime)) return null;
  const current = selectedProviderAccount(runtime, args.selection);
  const target = args.option.accountProfileId ?? subscriptionAccountFor({ providerId: runtime, selection: args.selection, profiles: args.profiles, remembered: args.remembered });
  if (target === current) return null;
  return runtime === "codex" ? { codexAccountProfileId: target } : { claudeAccountProfileId: target };
}

const rememberedSubscriptionAccounts: RememberedSubscriptionAccounts = {};

/** Records the sign-in accounts in use; call from an effect, not while rendering. */
export function rememberSubscriptionAccounts(selection: ProviderAccountSelection, profiles: readonly ProfileView[]) {
  Object.assign(rememberedSubscriptionAccounts, subscriptionAccountsToRemember(selection, profiles));
}

/** The sign-in accounts recorded this session; not saved across restarts. */
export function readRememberedSubscriptionAccounts(): RememberedSubscriptionAccounts {
  return { ...rememberedSubscriptionAccounts };
}

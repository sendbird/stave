import { formatList } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import { ProviderAccountProviderIdSchema, type ProviderAccountProviderId } from "./provider-accounts";
import { sharedSetupSummary } from "./provider-account-setup-plan";

/**
 * Sharing the System default setup (skills, instructions, settings) into a
 * managed account. Additive to the account registry: nothing here changes the
 * registry file, and the account's folder stays the single source of truth.
 */
export const PROVIDER_ACCOUNT_SETUP_IPC = {
  setupStatus: "provider-accounts:setup-status",
  shareSetup: "provider-accounts:share-setup",
} as const;

export const ProviderAccountSetupStatusArgsSchema = z
  .object({ providerId: ProviderAccountProviderIdSchema, id: z.uuid() })
  .strict();
/**
 * How a managed account receives System default's `settings.json`:
 * - `link`: a live link, so a setting changed in either place applies to both.
 * - `copy`: a filtered copy the account can change on its own.
 */
export const ProviderAccountSettingsSharingModeSchema = z.enum(["link", "copy"]);
export type ProviderAccountSettingsSharingMode = z.infer<typeof ProviderAccountSettingsSharingModeSchema>;
/** New sharing links settings. An account shared before the mode existed keeps its copy until changed. */
export const DEFAULT_SETTINGS_SHARING_MODE: ProviderAccountSettingsSharingMode = "link";

export const ProviderAccountShareSetupArgsSchema = ProviderAccountSetupStatusArgsSchema.extend({
  enabled: z.boolean(),
  settingsMode: ProviderAccountSettingsSharingModeSchema.optional(),
}).strict();

export type ProviderAccountSetupStatusArgs = z.infer<typeof ProviderAccountSetupStatusArgsSchema>;
export type ProviderAccountShareSetupArgs = z.infer<typeof ProviderAccountShareSetupArgsSchema>;

/**
 * - `shared`: this account uses System default's entry.
 * - `not-shared`: sharing is off, or this entry has not been applied yet.
 * - `kept`: the account already has its own version, so Stave left it alone.
 * - `missing`: System default has nothing to share for this entry.
 * - `failed`: Stave could not create the link or copy.
 */
export type ProviderAccountSetupEntryState = "shared" | "not-shared" | "kept" | "missing" | "failed";

export interface ProviderAccountSetupEntry {
  name: string;
  /** Plain noun for the UI ("skills"). */
  label: string;
  /**
   * How a shared entry reaches the account: a live link or a filtered copy.
   * Settings follow the chosen mode, except that settings naming a credential
   * are always copied through the filter.
   */
  action: "link" | "copy";
  state: ProviderAccountSetupEntryState;
}

export interface ProviderAccountSetupState {
  /** True once sharing was turned on for this account and not turned off since. */
  enabled: boolean;
  /** Present only when the provider shares a settings file (Claude). */
  settingsMode?: ProviderAccountSettingsSharingMode;
  entries: ProviderAccountSetupEntry[];
}

export type ProviderAccountSetupResult =
  | { ok: true; setup: ProviderAccountSetupState }
  | { ok: false; message: string };

export interface ProviderAccountSetupBridgeApi {
  /** Read-only: what the account shares now. */
  setupStatus: (args: ProviderAccountSetupStatusArgs) => Promise<ProviderAccountSetupResult>;
  /**
   * `enabled: true` links or copies System default's setup into the account and
   * can be repeated to refresh the copied settings or to switch `settingsMode`.
   * `enabled: false` removes
   * only what Stave added.
   */
  shareSetup: (args: ProviderAccountShareSetupArgs) => Promise<ProviderAccountSetupResult>;
}

function joinLabels(labels: readonly string[]) {
  return formatList([...labels]);
}

/**
 * The sentence under the "use my setup" checkbox. Off, it says what turning it
 * on does; on, it says what this account shares and what it kept. Both end on
 * what is never shared.
 */
export function describeProviderAccountSetup(
  providerId: ProviderAccountProviderId,
  setup: ProviderAccountSetupState | null,
): string {
  const never = i18n.t("providers:providerAccountSetup.signInAndConversationHistoryAre");
  if (!setup?.enabled) return i18n.t("providers:providerAccountSetup.sharesYourFromSystemDefaultWith", { value1: sharedSetupSummary(providerId), value2: never });
  const labelsIn = (state: ProviderAccountSetupEntryState) => [
    ...new Set(setup.entries.filter((entry) => entry.state === state).map((entry) => entry.label)),
  ];
  const shared = labelsIn("shared");
  const kept = labelsIn("kept");
  const parts = [
    shared.length > 0 ? i18n.t("providers:providerAccountSetup.sharingFromSystemDefault", { value1: joinLabels(shared) }) : i18n.t("providers:providerAccountSetup.systemDefaultHasNothingToShare"),
    kept.length > 0 ? i18n.t("providers:providerAccountSetup.keptThisAccountSOwn", { value1: joinLabels(kept) }) : "",
    never,
  ];
  return parts.filter(Boolean).join(" ");
}

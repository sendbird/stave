import { formatList } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
import type { CodexMcpDelegationPreview, CodexMcpDelegationPreviewArgs, CodexMcpDelegationSettings } from "./codex-mcp-delegation-settings";
import { z } from "zod";
import { ProviderAccountProfileIdSchema, ProviderAccountProviderIdSchema, type ProviderAccountProviderId } from "./provider-accounts";
import { sharedSetupSummary } from "./provider-account-setup-plan";

/**
 * Sharing the System default setup (skills, instructions, settings) into a
 * managed account. Additive to the account registry: nothing here changes the
 * registry file, and the account's folder stays the single source of truth.
 */
export const PROVIDER_ACCOUNT_SETUP_IPC = {
  setupStatus: "provider-accounts:setup-status",
  shareSetup: "provider-accounts:share-setup",
  mcpOptions: "provider-accounts:mcp-options",
  checkMcpConnections: "provider-accounts:check-mcp-connections",
  codexMcpDelegation: "provider-accounts:codex-mcp-delegation",
  setCodexMcpDelegation: "provider-accounts:set-codex-mcp-delegation",
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

/** Change a Claude account's MCP choices; an omitted choice keeps its value. */
export const ProviderAccountMcpOptionsArgsSchema = ProviderAccountSetupStatusArgsSchema.extend({
  useSystemMcp: z.boolean().optional(),
  delegateMcpWork: z.boolean().optional(),
}).strict();

export type ProviderAccountMcpOptionsArgs = z.infer<typeof ProviderAccountMcpOptionsArgsSchema>;
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
  /**
   * Present only for a provider with MCP choices of its own (Claude).
   * `useSystemMcp`: the account runs System default's MCP servers without
   * sharing the rest of the setup; setup sharing includes them either way.
   * `delegateMcpWork`: work that needs an MCP server only another account can
   * use goes to a subagent on that account.
   */
  mcp?: {
    useSystemMcp: boolean;
    delegateMcpWork: boolean;
    /**
     * The other Claude accounts that can use MCP servers this one cannot, by
     * label and server name: what `delegateMcpWork` hands over. Absent when
     * the accounts could not be compared.
     */
    delegable?: { id: string; label: string; servers: string[]; observedAt: number | null }[];
  };
  entries: ProviderAccountSetupEntry[];
}

export type ProviderAccountSetupResult =
  | { ok: true; setup: ProviderAccountSetupState }
  | { ok: false; message: string };

export const CheckMcpConnectionsArgsSchema = z.object({ profileId: ProviderAccountProfileIdSchema, claudeBinaryPath: z.string().max(4096).optional() }).strict();
export type CheckMcpConnectionsArgs = z.infer<typeof CheckMcpConnectionsArgsSchema>;
export type CheckMcpConnectionsResult =
  | { ok: true; servers: { name: string; status: "connected" | "needs-auth" | "failed" }[] }
  | { ok: false };

export interface ProviderAccountSetupBridgeApi {
  codexMcpDelegation: (args: CodexMcpDelegationPreviewArgs) => Promise<CodexMcpDelegationPreview>;
  setCodexMcpDelegation: (settings: CodexMcpDelegationSettings) => Promise<boolean>;
  checkMcpConnections: (args: CheckMcpConnectionsArgs) => Promise<CheckMcpConnectionsResult>;
  /** Read-only: what the account shares now. */
  setupStatus: (args: ProviderAccountSetupStatusArgs) => Promise<ProviderAccountSetupResult>;
  /**
   * `enabled: true` links or copies System default's setup into the account and
   * can be repeated to refresh the copied settings or to switch `settingsMode`.
   * `enabled: false` removes
   * only what Stave added.
   */
  shareSetup: (args: ProviderAccountShareSetupArgs) => Promise<ProviderAccountSetupResult>;
  /** Change the account's MCP choices, leaving the rest of its setup alone. */
  mcpOptions: (args: ProviderAccountMcpOptionsArgs) => Promise<ProviderAccountSetupResult>;
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

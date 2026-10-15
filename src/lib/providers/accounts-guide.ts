/** The user guide for sign-in accounts and API connections, opened from Settings. */
export const STAVE_ACCOUNTS_GUIDE_URL =
  "https://github.com/sendbird/stave/blob/main/docs/features/accounts-and-gateways.md";

/** Anchor of the guide's API connection section; keep in step with its heading. */
export const STAVE_API_CONNECTIONS_GUIDE_URL = `${STAVE_ACCOUNTS_GUIDE_URL}#use-a-company-gateway-key-with-claude-and-codex`;

/** Settings search targets for the account and API connection cards. */
export const PROVIDER_ACCOUNTS_FIELD_ID = {
  "claude-code": "settings-field-claude-accounts",
  codex: "settings-field-codex-accounts",
} as const;
export const API_CONNECTIONS_FIELD_ID = "settings-field-api-connections";

/** The "Add an account" form inside each provider's accounts card. */
export const PROVIDER_ACCOUNT_ADD_FIELD_ID = {
  "claude-code": "settings-field-claude-accounts-add",
  codex: "settings-field-codex-accounts-add",
} as const;
/** The "Add a connection" form inside the API connections card. */
export const API_CONNECTION_NEW_FIELD_ID = "settings-field-api-connection-new";
/** The Getting started checklist at the top of Settings > Accounts. */
export const ACCOUNTS_GETTING_STARTED_FIELD_ID = "settings-field-accounts-getting-started";

/** The row for Cursor, Kiro or OpenCode, whose CLI keeps its own sign-in. */
export function cliProviderFieldId(providerId: CliManagedAccountsProviderId) {
  return `settings-field-cli-provider-${providerId}`;
}

export function apiConnectionFieldId(connectionId: string) {
  return `settings-field-api-connection-${connectionId}`;
}

type AccountProviderId = keyof typeof PROVIDER_ACCOUNTS_FIELD_ID;
export type CliManagedAccountsProviderId = "cursor" | "kiro" | "opencode";

/**
 * Deep-link targets inside Settings > Accounts, passed as `focus` with
 * `openSettings({ section: "accounts", focus })` or the open-settings event:
 * - `claude-code` / `codex`: that provider's accounts card.
 * - `claude-code-add` / `codex-add`: its "Add an account" form.
 * - `claude-code-signin` / `codex-signin`: opens System default's sign-in terminal.
 * - `api-connections`: the API connections card.
 * - `api-connection-new`: the "Add a connection" form.
 * - `api-connection:<id>`: that connection, with its edit form open.
 * - `cli:cursor` / `cli:kiro` / `cli:opencode`: that CLI's sign-in row.
 */
export type AccountsSettingsFocus =
  | AccountProviderId
  | `${AccountProviderId}-add`
  | `${AccountProviderId}-signin`
  | "getting-started"
  | "api-connections"
  | "api-connection-new"
  | `api-connection:${string}`
  | `cli:${CliManagedAccountsProviderId}`;

const API_CONNECTION_FOCUS_PREFIX = "api-connection:";

export function apiConnectionFocus(connectionId: string): AccountsSettingsFocus {
  return `${API_CONNECTION_FOCUS_PREFIX}${connectionId}`;
}

export function cliProviderFocus(providerId: CliManagedAccountsProviderId): AccountsSettingsFocus {
  return `cli:${providerId}`;
}

/**
 * Where a "sign in" button for a provider lands. Claude Code and Codex: their
 * accounts card (`show`) or System default's sign-in terminal (`start`).
 * Cursor, Kiro and OpenCode keep their own sign-in, so both go to their CLI
 * row, which copies the login command. Null for anything else.
 */
export function providerSignInFocus(providerId: string, mode: "show" | "start"): AccountsSettingsFocus | null {
  if (providerId === "claude-code" || providerId === "codex") return mode === "start" ? `${providerId}-signin` : providerId;
  if (providerId === "cursor" || providerId === "kiro" || providerId === "opencode") return cliProviderFocus(providerId);
  return null;
}

/** The connection a `focus` names, when it names one. */
export function apiConnectionIdFromFocus(focus: string | null | undefined) {
  return focus?.startsWith(API_CONNECTION_FOCUS_PREFIX)
    ? focus.slice(API_CONNECTION_FOCUS_PREFIX.length) || null
    : null;
}

/** The provider whose sign-in terminal a `focus` asks to open. */
export function signInProviderFromFocus(focus: string | null | undefined): AccountProviderId | null {
  return focus === "claude-code-signin" ? "claude-code" : focus === "codex-signin" ? "codex" : null;
}

/**
 * The element a `focus` lands on, or null for an unknown target (the section
 * then opens at its top). The value is an element id inside the section.
 */
export function accountsFocusElementId(focus: string | null | undefined): string | null {
  if (!focus) return null;
  switch (focus) {
    case "claude-code":
    case "codex":
      return PROVIDER_ACCOUNTS_FIELD_ID[focus];
    case "claude-code-signin":
    case "codex-signin":
      return PROVIDER_ACCOUNTS_FIELD_ID[signInProviderFromFocus(focus)!];
    case "claude-code-add":
      return PROVIDER_ACCOUNT_ADD_FIELD_ID["claude-code"];
    case "codex-add":
      return PROVIDER_ACCOUNT_ADD_FIELD_ID.codex;
    case "getting-started":
      return ACCOUNTS_GETTING_STARTED_FIELD_ID;
    case "api-connections":
      return API_CONNECTIONS_FIELD_ID;
    case "api-connection-new":
      return API_CONNECTION_NEW_FIELD_ID;
    case "cli:cursor":
    case "cli:kiro":
    case "cli:opencode":
      return cliProviderFieldId(focus.slice("cli:".length) as CliManagedAccountsProviderId);
    default: {
      const connectionId = apiConnectionIdFromFocus(focus);
      return connectionId ? apiConnectionFieldId(connectionId) : null;
    }
  }
}

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

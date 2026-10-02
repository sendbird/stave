/** The user guide for sign-in accounts and API gateways, opened from Settings. */
export const STAVE_ACCOUNTS_GUIDE_URL =
  "https://github.com/sendbird/stave/blob/main/docs/features/accounts-and-gateways.md";

/** Anchor of the guide's gateway section; keep in step with its heading. */
export const STAVE_GATEWAY_GUIDE_URL = `${STAVE_ACCOUNTS_GUIDE_URL}#connect-claude-to-an-api-gateway`;

/** Settings search targets for the account and gateway cards. */
export const PROVIDER_ACCOUNTS_FIELD_ID = {
  "claude-code": "settings-field-claude-accounts",
  codex: "settings-field-codex-accounts",
} as const;
export const CLAUDE_GATEWAY_FIELD_ID = "settings-field-claude-gateway";

/**
 * ChatGPT auth-token helpers for the Codex app-server runtime.
 *
 * Extracted from `codex-app-server-runtime.ts` to keep the runtime module
 * under the max-lines ratchet; these helpers are pure (no process or client
 * state) and unit-tested via `resolveCodexChatgptAuthTokensRefreshResponse`.
 */

export type CodexAppServerAuthMode =
  | "apikey"
  | "chatgpt"
  | "chatgptAuthTokens"
  | null;

export type CodexGetAuthStatusResponse = {
  authMethod?: CodexAppServerAuthMode;
  authToken?: string | null;
  requiresOpenaiAuth?: boolean | null;
};

export type CodexAccountReadResponse = {
  account?: {
    type?: string;
    planType?: string | null;
  } | null;
  requiresOpenaiAuth?: boolean;
};

export type CodexChatgptAuthTokensRefreshParams = {
  reason?: "unauthorized";
  previousAccountId?: string | null;
};

export type CodexChatgptAuthTokensRefreshResponse = {
  accessToken: string;
  chatgptAccountId: string;
  chatgptPlanType: string | null;
};

function decodeJwtPayload(token: string) {
  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length < 2 || !parts[1]) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(normalized + padding, "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getJwtClaimRecord(args: {
  payload: Record<string, unknown> | null;
  key: string;
}) {
  const value = args.payload?.[args.key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function resolveCodexChatgptAuthTokensRefreshResponse(args: {
  authStatus: CodexGetAuthStatusResponse;
  accountStatus: CodexAccountReadResponse;
  previousAccountId?: string | null;
}): CodexChatgptAuthTokensRefreshResponse | null {
  const authMethod = args.authStatus.authMethod ?? null;
  if (authMethod !== "chatgpt" && authMethod !== "chatgptAuthTokens") {
    return null;
  }

  const accessToken = args.authStatus.authToken?.trim();
  if (!accessToken) {
    return null;
  }

  const payload = decodeJwtPayload(accessToken);
  const authClaims = getJwtClaimRecord({
    payload,
    key: "https://api.openai.com/auth",
  });
  const chatgptAccountId =
    typeof authClaims?.chatgpt_account_id === "string"
      ? authClaims.chatgpt_account_id.trim()
      : "";
  if (!chatgptAccountId) {
    return null;
  }

  const planTypeFromClaims =
    typeof authClaims?.chatgpt_plan_type === "string"
      ? authClaims.chatgpt_plan_type
      : null;
  const planTypeFromAccount =
    typeof args.accountStatus.account?.planType === "string"
      ? args.accountStatus.account.planType
      : null;

  return {
    accessToken,
    chatgptAccountId,
    chatgptPlanType: planTypeFromAccount ?? planTypeFromClaims,
  };
}

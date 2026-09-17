/** Slack-published public OAuth client ID for Cursor's hosted Slack MCP route. Not a secret. */
export const CURSOR_SLACK_MCP_CLIENT_ID = "3660753192626.8903469228982";

export const OAUTH_CLIENT_ID_MAX_LENGTH = 200;
export const OAUTH_CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const SLACK_OAUTH_CLIENT_ID_PATTERN = /^\d+\.\d+$/;

const SLACK_HOSTED_MCP_HOST = "mcp.slack.com";

export function isSlackHostedMcpUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === SLACK_HOSTED_MCP_HOST
    );
  } catch {
    return false;
  }
}

export function normalizeOAuthClientId(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isPublicOAuthClientId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= OAUTH_CLIENT_ID_MAX_LENGTH &&
    OAUTH_CLIENT_ID_PATTERN.test(value) &&
    !value.includes("${")
  );
}

export function isCursorOfficialSlackClientId(value: string | undefined) {
  return normalizeOAuthClientId(value) === CURSOR_SLACK_MCP_CLIENT_ID;
}

export function assertKiroSlackOAuthClientId(clientId: string | undefined) {
  const id = normalizeOAuthClientId(clientId);
  if (!id) {
    throw new Error("Kiro Slack MCP requires a Slack app OAuth client ID.");
  }
  if (isCursorOfficialSlackClientId(id)) {
    throw new Error(
      "Kiro Slack MCP cannot reuse Cursor's published Slack client ID. Enter the client ID from your Slack app.",
    );
  }
  if (!SLACK_OAUTH_CLIENT_ID_PATTERN.test(id)) {
    throw new Error(
      "Slack app client IDs use the form 1234567890.1234567890.",
    );
  }
  return id;
}

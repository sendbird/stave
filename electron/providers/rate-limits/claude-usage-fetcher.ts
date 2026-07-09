import type {
  ClaudeUsageSnapshot,
  ClaudeUsageWindow,
} from "../../../src/lib/providers/provider.types";
import { readClaudeOAuthAccessToken } from "./claude-credentials";
import { fetchClaudeUsageViaCli } from "./claude-usage-cli-fallback";

const OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const CLAUDE_CODE_USER_AGENT = "claude-code/2.1.0";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The OAuth usage endpoint's exact response shape isn't documented; accept
 * both an API-style fractional `utilization` (0..1) and a Claude Code
 * statusline-style `used_percentage` (0..100), each paired with an
 * epoch-second `resets_at` — see the usage-bar plan's research notes.
 */
function normalizeWindow(raw: unknown): ClaudeUsageWindow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const window = raw as Record<string, unknown>;
  let usedPercent: number | null = null;
  if (typeof window.used_percentage === "number") {
    usedPercent = window.used_percentage;
  } else if (typeof window.utilization === "number") {
    usedPercent =
      window.utilization <= 1 ? window.utilization * 100 : window.utilization;
  }
  if (usedPercent === null) {
    return null;
  }
  const resetsAt =
    typeof window.resets_at === "number" ? window.resets_at : null;
  return { usedPercent, resetsAt };
}

/**
 * Returns `null` (rather than an "unavailable" snapshot) for anything the
 * CLI fallback might still recover from: missing credentials, network
 * failure, or an unrecognized response shape. Only a definite server
 * rejection (4xx/5xx) is returned as an explicit error, so the caller can
 * still show it if the CLI fallback also fails.
 */
async function fetchClaudeUsageViaOAuth(): Promise<ClaudeUsageSnapshot | null> {
  const accessToken = readClaudeOAuthAccessToken();
  if (!accessToken) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OAUTH_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": OAUTH_BETA_HEADER,
        "User-Agent": CLAUDE_CODE_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        source: "unavailable",
        session: null,
        weekly: null,
        error: `Claude OAuth usage request failed (${response.status}).`,
      };
    }
    const body = (await response.json()) as Record<string, unknown>;
    const session = normalizeWindow(body.five_hour);
    const weekly = normalizeWindow(body.seven_day);
    if (!session && !weekly) {
      // Unexpected shape — treat like "no credentials" so the CLI fallback
      // gets a chance instead of surfacing a confusing empty success.
      return null;
    }
    return { source: "oauth", session, weekly, error: null };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Claude session/weekly usage for the global status bar: OAuth usage
 * endpoint first (using the Claude Code CLI's own stored credentials, no
 * separate API key), falling back to parsing the hidden CLI `/usage` panel
 * when OAuth credentials are missing or the request fails outright.
 */
export async function fetchClaudeUsageSnapshot(): Promise<ClaudeUsageSnapshot> {
  const oauthResult = await fetchClaudeUsageViaOAuth();
  if (oauthResult?.source === "oauth") {
    return oauthResult;
  }

  const cliResult = await fetchClaudeUsageViaCli();
  if (cliResult.source === "cli") {
    return cliResult;
  }

  // Both paths failed — prefer the OAuth-specific error when we have one,
  // since "server rejected the request" is more actionable than the CLI
  // fallback's generic "couldn't parse /usage".
  return oauthResult?.error ? oauthResult : cliResult;
}

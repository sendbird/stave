import type {
  ClaudeUsageSnapshot,
  ClaudeUsageWindow,
} from "../../../src/lib/providers/provider.types";
import { readClaudeOAuthCredentials } from "./claude-credentials";
import { fetchClaudeUsageViaCli } from "./claude-usage-cli-fallback";

const OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const CLAUDE_CODE_USER_AGENT = "claude-code/2.1.0";
const REQUEST_TIMEOUT_MS = 10_000;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * `used_percentage`, `utilization`, and `limits[].percent` are all reported by
 * the OAuth usage endpoint on the same 0..100 percentage scale — verified
 * against a live response where `five_hour.utilization: 1.0` matched
 * `limits[kind=session].percent: 1`, and `extra_usage.utilization: 0.07`
 * matched a $0.70/$1000 spend (0.07%, not 0.0007).
 *
 * An earlier revision guessed that `utilization <= 1` meant an API-style
 * fraction and scaled it by 100, which pegged every window at or below 1% to
 * a red "100%" meter right after a session reset. Never rescale here.
 */
export function normalizeWindow(raw: unknown): ClaudeUsageWindow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const window = raw as Record<string, unknown>;
  let usedPercent: number | null = null;
  if (
    typeof window.used_percentage === "number" &&
    Number.isFinite(window.used_percentage)
  ) {
    usedPercent = window.used_percentage;
  } else if (
    typeof window.utilization === "number" &&
    Number.isFinite(window.utilization)
  ) {
    usedPercent = window.utilization;
  }
  if (usedPercent === null) {
    return null;
  }
  return {
    usedPercent: clampPercent(usedPercent),
    resetsAt: normalizeResetsAt(window.resets_at),
  };
}

function listLimitEntries(
  body: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!Array.isArray(body.limits)) {
    return [];
  }
  return body.limits.filter(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) && typeof candidate === "object",
  );
}

function limitToWindow(
  limit: Record<string, unknown>,
): ClaudeUsageWindow | null {
  return normalizeWindow({
    used_percentage: limit.percent,
    resets_at: limit.resets_at,
  });
}

/**
 * Current builds report the canonical windows in the `limits` array
 * (`kind: "session"` / `"weekly_all"`); the top-level `five_hour`/`seven_day`
 * objects are the older shape. Prefer `limits` so the meter keeps working if
 * the legacy top-level fields are eventually dropped.
 *
 * `is_active` is deliberately ignored: it marks the currently *binding* limit,
 * not data validity, so an inactive entry still carries a real percent.
 */
export function normalizeNamedWindow(
  raw: unknown,
  kind: "session" | "weekly_all",
  legacyKey: "five_hour" | "seven_day",
): ClaudeUsageWindow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const body = raw as Record<string, unknown>;
  for (const limit of listLimitEntries(body)) {
    if (limit.kind === kind) {
      const window = limitToWindow(limit);
      if (window) {
        return window;
      }
    }
  }
  return normalizeWindow(body[legacyKey]);
}

/**
 * Fable's model-scoped weekly limit is reported by current Claude Code builds
 * in the `limits` array. Keep the older top-level field names as fallbacks for
 * accounts or CLI versions that still expose the previous response shape.
 */
export function normalizeFableWeeklyWindow(
  raw: unknown,
): ClaudeUsageWindow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const body = raw as Record<string, unknown>;
  for (const limit of listLimitEntries(body)) {
    const scope =
      limit.scope && typeof limit.scope === "object"
        ? (limit.scope as Record<string, unknown>)
        : null;
    const model =
      scope?.model && typeof scope.model === "object"
        ? (scope.model as Record<string, unknown>)
        : null;
    if (
      limit.kind === "weekly_scoped" &&
      typeof model?.display_name === "string" &&
      /\bfable\b/i.test(model.display_name) &&
      typeof limit.percent === "number" &&
      Number.isFinite(limit.percent)
    ) {
      return limitToWindow(limit);
    }
  }

  return normalizeWindow(
    body.fable_weekly ?? body.fable_seven_day ?? body.seven_day_fable,
  );
}

/**
 * `resets_at` has been observed as an epoch-second number, but the OAuth
 * endpoint's response shape isn't documented and other Anthropic APIs use
 * ISO-8601 strings for reset timestamps — accept both rather than silently
 * dropping the value (which showed up as a permanent "unknown" reset time
 * in the UI even though the server had sent a real value).
 */
export function normalizeResetsAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsedMs = Date.parse(value);
    if (!Number.isNaN(parsedMs)) {
      return Math.floor(parsedMs / 1000);
    }
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber;
    }
  }
  return null;
}

function unavailable(error: string): ClaudeUsageSnapshot {
  return {
    source: "unavailable",
    session: null,
    weekly: null,
    fableWeekly: null,
    error,
  };
}

/**
 * How to react to a failed OAuth usage attempt.
 *
 * - `terminal`: the server already gave the user-visible answer (rate limited,
 *   missing scope). Spawning a hidden CLI just to hear the same thing wastes a
 *   PTY and, for 429, risks compounding the limit.
 * - `retryAfterCliRepair`: the token is probably stale. Running the CLI makes
 *   it rotate its own credentials as a side effect, so re-reading them and
 *   retrying OAuth can succeed without Stave ever writing credentials itself.
 * - `fallbackOnly`: transient/unknown — just try the CLI panel.
 */
type OAuthFailureAction = "terminal" | "retryAfterCliRepair" | "fallbackOnly";

export interface ClaudeOAuthUsageFailure {
  action: OAuthFailureAction;
  error: string;
}

export function classifyOAuthUsageStatus(
  status: number,
): ClaudeOAuthUsageFailure {
  if (status === 429) {
    return {
      action: "terminal",
      error: "Claude usage is rate limited right now.",
    };
  }
  if (status === 401) {
    return {
      action: "retryAfterCliRepair",
      error: "Claude OAuth credentials are stale (401).",
    };
  }
  if (status === 403) {
    return {
      action: "retryAfterCliRepair",
      error: "Claude OAuth credentials were rejected (403).",
    };
  }
  if (status >= 500) {
    return {
      action: "fallbackOnly",
      error: `Claude usage endpoint is unavailable (${status}).`,
    };
  }
  return {
    action: "terminal",
    error: `Claude OAuth usage request failed (${status}).`,
  };
}

export function classifyOAuthUsageError(
  error: unknown,
): ClaudeOAuthUsageFailure {
  if (error instanceof SyntaxError) {
    return {
      action: "fallbackOnly",
      error: "Claude usage response could not be parsed.",
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    action: "fallbackOnly",
    error: `Claude usage request failed: ${message}`,
  };
}

type OAuthAttempt =
  | { kind: "success"; snapshot: ClaudeUsageSnapshot }
  | { kind: "failure"; failure: ClaudeOAuthUsageFailure };

async function attemptOAuthUsage(accessToken: string): Promise<OAuthAttempt> {
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
        kind: "failure",
        failure: classifyOAuthUsageStatus(response.status),
      };
    }
    const body = (await response.json()) as Record<string, unknown>;
    const session = normalizeNamedWindow(body, "session", "five_hour");
    const weekly = normalizeNamedWindow(body, "weekly_all", "seven_day");
    const fableWeekly = normalizeFableWeeklyWindow(body);
    if (!session && !weekly && !fableWeekly) {
      // Unexpected shape — let the CLI fallback try instead of surfacing a
      // confusing empty success.
      return {
        kind: "failure",
        failure: {
          action: "fallbackOnly",
          error: "Claude usage response had no recognizable windows.",
        },
      };
    }
    return {
      kind: "success",
      snapshot: { source: "oauth", session, weekly, fableWeekly, error: null },
    };
  } catch (error) {
    return { kind: "failure", failure: classifyOAuthUsageError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Claude session/weekly usage for the global status bar: OAuth usage
 * endpoint first (using the Claude Code CLI's own stored credentials, no
 * separate API key), falling back to parsing the hidden CLI `/usage` panel
 * when OAuth credentials are missing or the request fails.
 *
 * On a stale-token rejection the CLI fallback doubles as a credential repair
 * step — the CLI rotates its own tokens on startup — so OAuth is retried once
 * with the re-read token before settling for the panel-parsed numbers.
 */
export async function fetchClaudeUsageSnapshot(): Promise<ClaudeUsageSnapshot> {
  const credentials = await readClaudeOAuthCredentials();

  if (!credentials.accessToken) {
    const cliResult = await fetchClaudeUsageViaCli();
    if (cliResult.source === "cli") {
      return cliResult;
    }
    if (credentials.hasRefreshableCredentials) {
      const repaired = await retryOAuthAfterCliRepair();
      if (repaired) {
        return repaired;
      }
    }
    return cliResult;
  }

  const attempt = await attemptOAuthUsage(credentials.accessToken);
  if (attempt.kind === "success") {
    return attempt.snapshot;
  }
  if (attempt.failure.action === "terminal") {
    return unavailable(attempt.failure.error);
  }

  const cliResult = await fetchClaudeUsageViaCli();

  if (attempt.failure.action === "retryAfterCliRepair") {
    const repaired = await retryOAuthAfterCliRepair(credentials.accessToken);
    if (repaired) {
      return repaired;
    }
  }

  if (cliResult.source === "cli") {
    return cliResult;
  }

  // Both paths failed — prefer the OAuth-specific error, since "server
  // rejected the request" is more actionable than the CLI fallback's generic
  // "couldn't parse /usage".
  return unavailable(attempt.failure.error);
}

/**
 * Re-read credentials after the CLI has run and retry OAuth once. Returns
 * `null` when nothing changed or the retry also failed, so the caller can fall
 * back to the panel-parsed snapshot.
 */
async function retryOAuthAfterCliRepair(
  previousAccessToken?: string,
): Promise<ClaudeUsageSnapshot | null> {
  const refreshed = await readClaudeOAuthCredentials();
  if (!refreshed.accessToken || refreshed.accessToken === previousAccessToken) {
    return null;
  }
  const retry = await attemptOAuthUsage(refreshed.accessToken);
  return retry.kind === "success" ? retry.snapshot : null;
}

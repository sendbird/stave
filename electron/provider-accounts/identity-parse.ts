/**
 * Pure parsers for the sign-in probe. Each takes text the CLI or an auth file
 * produced and returns only an email, a plan label and a state. Nothing here
 * returns a token, a key, a path or raw output: the result type has no field
 * that could carry one.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_PLAN_LENGTH = 32;
const MAX_ID_TOKEN_LENGTH = 16 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An address, or null. Anything that does not look like one is dropped, not shown. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) ? email : null;
}

/** "max" becomes "Max", "enterprise_plus" becomes "Enterprise plus". Unfamiliar shapes become null. */
export function normalizePlan(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const words = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  if (!words || words.length > MAX_PLAN_LENGTH) return null;
  if (!/^[a-z0-9][a-z0-9 .+]*$/.test(words)) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A JSON object from output that may carry a warning before or after it. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const attempts = [text.trim()];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt);
      if (isRecord(parsed)) return parsed;
    } catch {
      /* Try the next candidate. */
    }
  }
  return null;
}

export type ParsedClaudeStatus =
  | { state: "signed-in"; email: string | null; plan: string | null }
  | { state: "signed-out" }
  | { state: "unreadable" };

/**
 * `claude auth status --json`. Only `loggedIn` is documented; `email` and
 * `subscriptionType` are observed fields, so each is optional and a value of
 * the wrong type shows nothing. Signed-out output arrives with a non-zero exit
 * code, which is why the caller passes stdout regardless of the exit status.
 */
export function parseClaudeAuthStatus(stdout: string): ParsedClaudeStatus {
  const record = parseJsonObject(stdout);
  if (!record) return { state: "unreadable" };
  if (record.loggedIn === true)
    return {
      state: "signed-in",
      email: normalizeEmail(record.email),
      plan: normalizePlan(record.subscriptionType),
    };
  if (record.loggedIn === false) return { state: "signed-out" };
  return { state: "unreadable" };
}

export type ParsedCodexStatus =
  | { state: "signed-in"; method: "chatgpt" | "api-key" | "other" }
  | { state: "signed-out" }
  | { state: "unreadable" };

/**
 * `codex login status` prints no identity, and for an API-key login it prints a
 * masked key. Only the classification leaves this function; the text does not.
 */
export function parseCodexLoginStatus(args: { status: number | null; text: string }): ParsedCodexStatus {
  if (/not logged in/i.test(args.text)) return { state: "signed-out" };
  if (args.status !== 0) return { state: "unreadable" };
  if (/api key/i.test(args.text)) return { state: "signed-in", method: "api-key" };
  if (/chatgpt/i.test(args.text)) return { state: "signed-in", method: "chatgpt" };
  return { state: "signed-in", method: "other" };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (token.length > MAX_ID_TOKEN_LENGTH) return null;
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface CodexIdentityClaims {
  email: string | null;
  plan: string | null;
}

/**
 * Reads the email and plan claims from the text of a Codex `auth.json`.
 *
 * This is the one place Stave opens a credential file, and it is narrow on
 * purpose: it looks only at `tokens.id_token`, decodes that token's payload
 * without verifying it (the file is the user's own and the claims are display
 * text), copies out `email` and `chatgpt_plan_type`, and drops everything else
 * before returning. The access token, the refresh token and any API key in the
 * file are never read into the result.
 */
export function readCodexIdentityClaims(authJson: string): CodexIdentityClaims | null {
  let file: unknown;
  try {
    file = JSON.parse(authJson);
  } catch {
    return null;
  }
  if (!isRecord(file) || !isRecord(file.tokens)) return null;
  const idToken = file.tokens.id_token;
  const claims = typeof idToken === "string" ? decodeJwtPayload(idToken) : isRecord(idToken) ? idToken : null;
  if (!claims) return null;
  const profile = claims["https://api.openai.com/profile"];
  const auth = claims["https://api.openai.com/auth"];
  return {
    email: normalizeEmail(claims.email) ?? normalizeEmail(isRecord(profile) ? profile.email : undefined),
    plan: normalizePlan(isRecord(auth) ? auth.chatgpt_plan_type : claims.chatgpt_plan_type),
  };
}

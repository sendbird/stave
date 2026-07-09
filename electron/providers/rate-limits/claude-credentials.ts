import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Why: this is the same macOS Keychain service name the Claude Code CLI
// itself writes to when a user runs `claude login` — reading it lets Stave
// call Anthropic's usage endpoint with the CLI's own OAuth session instead
// of asking for a separate API key.
const MACOS_KEYCHAIN_SERVICE = "Claude Code-credentials";

const CREDENTIALS_FILE_PATH = path.join(
  homedir(),
  ".claude",
  ".credentials.json",
);

function parseOAuthAccessToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: string };
    };
    const accessToken = parsed?.claudeAiOauth?.accessToken;
    return typeof accessToken === "string" && accessToken.trim()
      ? accessToken
      : null;
  } catch {
    return null;
  }
}

function readMacKeychainAccessToken(): string | null {
  if (process.platform !== "darwin") {
    return null;
  }
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", MACOS_KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", timeout: 5_000 },
    );
    return parseOAuthAccessToken(raw);
  } catch {
    // Keychain entry missing, access denied, or `security` unavailable —
    // the caller falls back to the credentials file, then to the CLI.
    return null;
  }
}

function readCredentialsFileAccessToken(): string | null {
  try {
    const raw = readFileSync(CREDENTIALS_FILE_PATH, "utf8");
    return parseOAuthAccessToken(raw);
  } catch {
    return null;
  }
}

/**
 * Read-only lookup of the Claude Code CLI's own OAuth access token.
 *
 * Deliberately does not refresh or write back credentials — Stave has no
 * business owning the CLI's login state, and the CLI itself (or a live
 * `claude` terminal) may be rotating these tokens concurrently. If the
 * token is missing, stale, or rejected by the server, the caller falls back
 * to parsing the CLI's own `/usage` panel instead of trying to repair auth.
 */
export function readClaudeOAuthAccessToken(): string | null {
  return readMacKeychainAccessToken() ?? readCredentialsFileAccessToken();
}

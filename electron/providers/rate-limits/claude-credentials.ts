import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { resolveLoginShellEnvVarValue } from "../executable-path";

// Why: this is the same macOS Keychain service name the Claude Code CLI
// itself writes to when a user runs `claude login` — reading it lets Stave
// call Anthropic's usage endpoint with the CLI's own OAuth session instead
// of asking for a separate API key.
const MACOS_KEYCHAIN_SERVICE = "Claude Code-credentials";

const DEFAULT_CLAUDE_CONFIG_DIR = path.join(homedir(), ".claude");

/**
 * Config-dir candidates, mirroring how the CLI itself resolves its home:
 * `CLAUDE_CONFIG_DIR` wins over `~/.claude`. Stave's host process is a GUI
 * app and doesn't inherit the user's shell exports, so the login-shell
 * value is consulted too (users who relocate `~/.claude` — e.g. a symlink
 * into `~/.agents/claude` — typically export CLAUDE_CONFIG_DIR there).
 * Symlinks are resolved so a dir and its target count as one candidate.
 */
function listClaudeConfigDirCandidates(): string[] {
  const rawCandidates = [
    process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR,
    resolveLoginShellEnvVarValue({ key: "CLAUDE_SECURESTORAGE_CONFIG_DIR" }),
    process.env.CLAUDE_CONFIG_DIR,
    resolveLoginShellEnvVarValue({ key: "CLAUDE_CONFIG_DIR" }),
    DEFAULT_CLAUDE_CONFIG_DIR,
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of rawCandidates) {
    const trimmed = raw?.trim();
    if (!trimmed) {
      continue;
    }
    for (const candidate of [trimmed, safeRealpath(trimmed)]) {
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function safeRealpath(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

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

/**
 * Keychain service-name candidates, matching the CLI's own scheme (from
 * its credential-store code): the default config dir uses the plain
 * `Claude Code-credentials` entry, while a custom CLAUDE_CONFIG_DIR (or
 * CLAUDE_SECURESTORAGE_CONFIG_DIR) scopes the entry by appending
 * `-<first 8 hex chars of sha256(NFC-normalized config dir)>`. Trying the
 * candidates in order is cheap — the first hit wins and misses fall
 * through to the credentials file / CLI paths.
 */
function listKeychainServiceCandidates(configDirs: string[]): string[] {
  const services = new Set<string>([MACOS_KEYCHAIN_SERVICE]);
  for (const dir of configDirs) {
    if (dir === DEFAULT_CLAUDE_CONFIG_DIR) {
      continue;
    }
    services.add(
      `${MACOS_KEYCHAIN_SERVICE}-${createHash("sha256")
        .update(dir.normalize("NFC"))
        .digest("hex")
        .slice(0, 8)}`,
    );
  }
  return [...services];
}

function readMacKeychainAccessToken(configDirs: string[]): string | null {
  if (process.platform !== "darwin") {
    return null;
  }
  for (const service of listKeychainServiceCandidates(configDirs)) {
    try {
      const raw = execFileSync(
        "security",
        ["find-generic-password", "-s", service, "-w"],
        { encoding: "utf8", timeout: 5_000 },
      );
      const accessToken = parseOAuthAccessToken(raw);
      if (accessToken) {
        return accessToken;
      }
    } catch {
      // Keychain entry missing, access denied, or `security` unavailable —
      // try the next candidate, then the credentials file, then the CLI.
    }
  }
  return null;
}

function readCredentialsFileAccessToken(configDirs: string[]): string | null {
  for (const configDir of configDirs) {
    try {
      const raw = readFileSync(
        path.join(configDir, ".credentials.json"),
        "utf8",
      );
      const accessToken = parseOAuthAccessToken(raw);
      if (accessToken) {
        return accessToken;
      }
    } catch {
      // Missing/unreadable in this candidate dir — try the next one.
    }
  }
  return null;
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
  const configDirs = listClaudeConfigDirCandidates();
  return (
    readMacKeychainAccessToken(configDirs) ??
    readCredentialsFileAccessToken(configDirs)
  );
}

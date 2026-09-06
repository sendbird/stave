import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { resolveLoginShellEnvVarValuesAsync } from "../executable-path";

// Why: this is the same macOS Keychain service name the Claude Code CLI
// itself writes to when a user runs `claude login` — reading it lets Stave
// call Anthropic's usage endpoint with the CLI's own OAuth session instead
// of asking for a separate API key.
const MACOS_KEYCHAIN_SERVICE = "Claude Code-credentials";

// Why: the CLI keys its keychain entry by *account* as well as service —
// the account is `$USER` (or `os.userInfo().username`) when it matches
// this pattern, else the literal fallback below. Older CLI builds wrote
// under the fallback account, so a machine can hold BOTH a stale
// `claude-code-user` entry and a fresh `<username>` entry for the same
// service. A service-only `security find-generic-password -s` returns
// whichever entry comes first (often the stale one), so Stave must query
// account-qualified candidates first, in the same order the CLI resolves
// them, before falling back to a service-only match.
const MACOS_KEYCHAIN_FALLBACK_ACCOUNT = "claude-code-user";
const MACOS_KEYCHAIN_ACCOUNT_PATTERN = /^[a-zA-Z0-9._-]+$/;

const DEFAULT_CLAUDE_CONFIG_DIR = path.join(homedir(), ".claude");

/**
 * Config-dir candidates, mirroring how the CLI itself resolves its home:
 * `CLAUDE_CONFIG_DIR` wins over `~/.claude`. Stave's host process is a GUI
 * app and doesn't inherit the user's shell exports, so the login-shell
 * value is consulted too (users who relocate `~/.claude` — e.g. a symlink
 * into `~/.agents/claude` — typically export CLAUDE_CONFIG_DIR there).
 * Symlinks are resolved so a dir and its target count as one candidate.
 */
async function listClaudeConfigDirCandidates(): Promise<string[]> {
  const shellValues = await resolveLoginShellEnvVarValuesAsync({
    keys: ["CLAUDE_SECURESTORAGE_CONFIG_DIR", "CLAUDE_CONFIG_DIR"],
  });
  const rawCandidates = [
    process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR,
    shellValues.CLAUDE_SECURESTORAGE_CONFIG_DIR,
    process.env.CLAUDE_CONFIG_DIR,
    shellValues.CLAUDE_CONFIG_DIR,
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

export interface ClaudeOAuthCredentials {
  accessToken: string | null;
  /**
   * A refresh token is present, so the CLI can rotate the access token on its
   * own. Lets the usage fetcher distinguish "never logged in" (nothing to
   * repair) from "logged in but the access token is stale" (running the CLI
   * once will refresh it).
   */
  hasRefreshableCredentials: boolean;
}

const EMPTY_CREDENTIALS: ClaudeOAuthCredentials = {
  accessToken: null,
  hasRefreshableCredentials: false,
};

export function parseOAuthCredentials(raw: string): ClaudeOAuthCredentials {
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: string; refreshToken?: string };
    };
    const oauth = parsed?.claudeAiOauth;
    const accessToken = oauth?.accessToken;
    const refreshToken = oauth?.refreshToken;
    return {
      accessToken:
        typeof accessToken === "string" && accessToken.trim()
          ? accessToken
          : null,
      hasRefreshableCredentials:
        typeof refreshToken === "string" && refreshToken.trim() !== "",
    };
  } catch {
    return EMPTY_CREDENTIALS;
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

/**
 * Merges candidate reads: the first usable access token wins, but a
 * refresh-token-only hit is remembered so the caller still knows the user is
 * logged in and the CLI can rotate the token.
 */
function pickCredentials(
  reads: Iterable<ClaudeOAuthCredentials>,
): ClaudeOAuthCredentials {
  let hasRefreshableCredentials = false;
  for (const read of reads) {
    if (read.accessToken) {
      return read;
    }
    hasRefreshableCredentials ||= read.hasRefreshableCredentials;
  }
  return { accessToken: null, hasRefreshableCredentials };
}

/**
 * Keychain account-name candidates, matching the CLI's own resolution:
 * `$USER` (or `os.userInfo().username`) when it passes the CLI's
 * validation pattern, then the CLI's literal fallback account, then
 * `null` for a service-only lookup that still matches entries written
 * under any other account name.
 */
function listKeychainAccountCandidates(): (string | null)[] {
  const candidates: (string | null)[] = [];
  let osUser: string | undefined;
  try {
    osUser = process.env.USER || userInfo().username;
  } catch {
    osUser = undefined;
  }
  if (
    osUser &&
    MACOS_KEYCHAIN_ACCOUNT_PATTERN.test(osUser) &&
    osUser !== MACOS_KEYCHAIN_FALLBACK_ACCOUNT
  ) {
    candidates.push(osUser);
  }
  candidates.push(MACOS_KEYCHAIN_FALLBACK_ACCOUNT);
  candidates.push(null);
  return candidates;
}

async function readMacKeychainCredentials(
  configDirs: string[],
): Promise<ClaudeOAuthCredentials> {
  if (process.platform !== "darwin") {
    return EMPTY_CREDENTIALS;
  }
  const accounts = listKeychainAccountCandidates();
  let accumulated = EMPTY_CREDENTIALS;
      for (const service of listKeychainServiceCandidates(configDirs)) {
        for (const account of accounts) {
          try {
            const read = parseOAuthCredentials(
              await new Promise<string>((resolve) => execFile(
                "security",
                account === null
                  ? ["find-generic-password", "-s", service, "-w"]
                  : ["find-generic-password", "-s", service, "-a", account, "-w"],
                { encoding: "utf8", timeout: 5_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 },
                (error, stdout) => resolve(error ? "" : stdout),
              )),
            );
            accumulated = pickCredentials([accumulated, read]);
            if (accumulated.accessToken) return accumulated;
          } catch {
            // Keychain entry missing, access denied, or `security` unavailable —
            // try the next candidate, then the credentials file, then the CLI.
          }
        }
      }
  return accumulated;
}

function readCredentialsFileCredentials(
  configDirs: string[],
): ClaudeOAuthCredentials {
  return pickCredentials(
    (function* () {
      for (const configDir of configDirs) {
        try {
          yield parseOAuthCredentials(
            readFileSync(path.join(configDir, ".credentials.json"), "utf8"),
          );
        } catch {
          // Missing/unreadable in this candidate dir — try the next one.
        }
      }
    })(),
  );
}

/**
 * Read-only lookup of the Claude Code CLI's own OAuth credentials.
 *
 * Deliberately does not refresh or write back credentials — Stave has no
 * business owning the CLI's login state, and the CLI itself (or a live
 * `claude` terminal) may be rotating these tokens concurrently. When the token
 * is stale the caller instead runs the CLI (which rotates its own credentials
 * as a side effect) and re-reads them here.
 */
export async function readClaudeOAuthCredentials(): Promise<ClaudeOAuthCredentials> {
  const configDirs = await listClaudeConfigDirCandidates();
  return pickCredentials([
    await readMacKeychainCredentials(configDirs),
    readCredentialsFileCredentials(configDirs),
  ]);
}

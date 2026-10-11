import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { resolveLoginShellEnvVarValue } from "../providers/executable-path";

/** The record `setup-sharing.ts` keeps in an account folder while sharing is on. */
export const SETUP_SHARING_LEDGER_NAME = ".stave-shared-setup.json";

/**
 * Claude keeps user and local MCP servers in `.claude.json`, next to the
 * sign-in, so setup sharing never links or copies that file. A managed account
 * that shares System default's setup still needs those servers, so Stave reads
 * only System default's `mcpServers` maps at launch and hands them to the
 * account's session. Nothing is written into the account folder.
 */

function canonicalOrResolved(target: string) {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/** Mirrors `getClaudeStateFilePath` in `mcp-config-refresh.ts`, which lists this module's result. */
function claudeStateFilePath(configDir: string | undefined) {
  return configDir && path.isAbsolute(configDir) ? path.join(configDir, ".claude.json") : path.join(homedir(), ".claude.json");
}

/** True while the account folder shares System default's setup. */
function sharesSystemSetup(accountDir: string) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(accountDir, SETUP_SHARING_LEDGER_NAME), "utf8"));
    return typeof parsed === "object" && parsed !== null && (parsed as { version?: unknown }).version === 1;
  } catch {
    return false;
  }
}

/** The `CLAUDE_CONFIG_DIR` System default runs with, or undefined when unset. */
function systemClaudeConfigDir() {
  return (
    resolveLoginShellEnvVarValue({ key: "CLAUDE_CONFIG_DIR" })?.trim() ||
    process.env.CLAUDE_CONFIG_DIR?.trim() ||
    undefined
  );
}

/**
 * System default's `.claude.json` when `claudeConfigDir` is a managed account
 * that shares System default's setup. Null for System default itself, for an
 * account that does not share, and for a path that resolves to the account's
 * own state file.
 */
export function resolveSharedClaudeMcpStateFile(args: {
  claudeConfigDir?: string;
  systemConfigDir?: () => string | undefined;
}): string | null {
  const accountDir = args.claudeConfigDir?.trim();
  if (!accountDir || !path.isAbsolute(accountDir)) return null;
  if (!sharesSystemSetup(accountDir)) return null;
  const sourceFile = claudeStateFilePath((args.systemConfigDir ?? systemClaudeConfigDir)());
  const accountFile = claudeStateFilePath(accountDir);
  if (canonicalOrResolved(sourceFile) === canonicalOrResolved(accountFile)) return null;
  if (canonicalOrResolved(path.dirname(sourceFile)) === canonicalOrResolved(accountDir)) return null;
  return sourceFile;
}

/** Stave registers its own server per session; a copy from another config folder is stale. */
export const NEVER_SHARED_MCP_SERVER_NAMES: ReadonlySet<string> = new Set(["stave-local-mcp"]);

/**
 * System default's `.claude.json` for a configuration folder path as setup
 * sharing records it: the folder's own file, or `~/.claude.json` when the
 * folder is the unset default `~/.claude`.
 */
export function claudeMcpStateFileForSystemDir(systemDir: string) {
  const inFolder = path.join(systemDir, ".claude.json");
  if (path.resolve(systemDir) !== path.join(homedir(), ".claude")) return inFolder;
  try {
    readFileSync(inFolder);
    return inFolder;
  } catch {
    return path.join(homedir(), ".claude.json");
  }
}

/** True when the state file names at least one MCP server an account could take. */
export function hasShareableClaudeMcpServers(stateFile: string) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFile, "utf8"));
    const record = (value: unknown) =>
      typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    const names = (value: unknown) => Object.keys(record(value) ?? {});
    const root = record(parsed);
    const projectNames = Object.values(record(root?.projects) ?? {}).flatMap((project) => names(record(project)?.mcpServers));
    return [...names(root?.mcpServers), ...projectNames].some((name) => !NEVER_SHARED_MCP_SERVER_NAMES.has(name));
  } catch {
    return false;
  }
}

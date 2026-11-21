import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CLAUDE_SONNET_MODEL } from "../../src/lib/providers/model-catalog";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "../../src/lib/providers/provider-accounts";
import { readClaudeAccountMcpStatus } from "./mcp-status-cache";
import { getProviderAccountRegistry, systemDirectory } from "./registry";
import {
  claudeMcpStateFileForSystemDir,
  NEVER_SHARED_MCP_SERVER_NAMES,
  readAccountMcpOptions,
  resolveSharedClaudeMcpStateFile,
} from "./shared-mcp";

/**
 * MCP work a Claude account cannot do itself, handed to a subagent on the
 * account that can.
 *
 * Some MCP servers follow the sign-in and cannot be shared as configuration:
 * claude.ai connectors an organization installs for its members, and servers
 * whose OAuth sign-in was done on one account only. An account that turned on
 * `delegateMcpWork` is told which servers its other Claude accounts can use
 * and it cannot, and may start a subagent on one of those accounts for just
 * that step. Each account calls the server with its own sign-in; no credential
 * leaves its account folder.
 *
 * Only server names are read. A recent status reading from a turn on the
 * account wins (`mcp-status-cache.ts`); without one, the `mcpServers` keys and
 * connector names in the account's `.claude.json`, minus the names in its
 * needs-sign-in cache.
 */

/** The model a subagent on another account runs MCP work with: enough for tool calls, light on that account's usage. */
export const MCP_DELEGATION_MODEL = DEFAULT_CLAUDE_SONNET_MODEL;

/** Claude Code's record of servers that still need a sign-in on this account. */
const NEEDS_AUTH_CACHE_NAME = "mcp-needs-auth-cache.json";
const MAX_SERVERS_PER_ACCOUNT = 40;

export interface McpDelegationAccount {
  id: string;
  label: string;
  /** Servers this account can use and the calling account cannot. */
  servers: string[];
}

export interface McpDelegationDirectory {
  /** Every provider account, as the registry lists them. */
  profiles: readonly ProviderAccountProfile[];
  /** A managed Claude account's folder, or null when it cannot be resolved. */
  resolveDirectory: (profileId: string) => string | null;
  /** System default's Claude configuration folder. */
  systemDirectory: () => string;
  /** Tests only: the `CLAUDE_CONFIG_DIR` System default runs with, instead of the login shell's. */
  sharedSystemConfigDir?: () => string | undefined;
  /**
   * The servers Claude Code last reported as connected on an account, when
   * this process has a recent reading (`mcp-status-cache.ts`). Preferred over
   * the config files, which cannot tell a removed connector or an expired
   * sign-in.
   */
  connectedServers?: (profileId: string) => readonly string[] | null;
}

function readRecord(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function serverNamesIn(stateFile: string, includeConnectors: boolean) {
  const state = readRecord(stateFile);
  const servers = state?.mcpServers;
  const names = typeof servers === "object" && servers !== null && !Array.isArray(servers) ? Object.keys(servers) : [];
  const connectors = includeConnectors && Array.isArray(state?.claudeAiMcpEverConnected)
    ? state.claudeAiMcpEverConnected.filter((name): name is string => typeof name === "string")
    : [];
  return [...names, ...connectors];
}

/** The MCP servers a Claude account folder can use now, by name. */
function usableServerNames(args: {
  stateFile: string;
  configDir: string;
  managedDir?: string;
  sharedSystemConfigDir?: () => string | undefined;
}): Set<string> {
  const names = new Set(serverNamesIn(args.stateFile, true));
  // System default's configured servers reach an account that shares them; its connectors do not.
  const shared = args.managedDir ? resolveSharedClaudeMcpStateFile({ claudeConfigDir: args.managedDir, systemConfigDir: args.sharedSystemConfigDir })
    : null;
  if (shared) for (const name of serverNamesIn(shared, false)) names.add(name);
  for (const name of Object.keys(readRecord(path.join(args.configDir, NEEDS_AUTH_CACHE_NAME)) ?? {})) names.delete(name);
  for (const name of NEVER_SHARED_MCP_SERVER_NAMES) names.delete(name);
  return names;
}

export function claudeSignInAccounts(directory: McpDelegationDirectory) {
  return directory.profiles.filter((profile) => profile.providerId === "claude-code" && !profile.gateway);
}

export function usableServersOf(profile: ProviderAccountProfile, directory: McpDelegationDirectory): Set<string> | null {
  let configDir: string | null;
  try {
    configDir = profile.id === SYSTEM_ACCOUNT_PROFILE_ID ? directory.systemDirectory() : directory.resolveDirectory(profile.id);
  } catch {
    configDir = null;
  }
  if (!configDir) return null;
  const connected = directory.connectedServers?.(profile.id);
  if (connected) return new Set(connected.filter((name) => !NEVER_SHARED_MCP_SERVER_NAMES.has(name)));
  return profile.id === SYSTEM_ACCOUNT_PROFILE_ID
    ? usableServerNames({ stateFile: claudeMcpStateFileForSystemDir(configDir), configDir })
    : usableServerNames({ stateFile: path.join(configDir, ".claude.json"), configDir, managedDir: configDir, sharedSystemConfigDir: directory.sharedSystemConfigDir });
}

/** The sign-in account that may delegate and the accounts it could delegate to, or null. */
function delegationParties(accountProfileId: string, directory: McpDelegationDirectory, preview: boolean) {
  if (accountProfileId === SYSTEM_ACCOUNT_PROFILE_ID) return null;
  const accounts = claudeSignInAccounts(directory);
  const caller = accounts.find((profile) => profile.id === accountProfileId);
  if (!caller) return null;
  let callerDir: string | null;
  try {
    callerDir = directory.resolveDirectory(caller.id);
  } catch {
    callerDir = null;
  }
  if (!callerDir || (!preview && !readAccountMcpOptions(callerDir).delegateMcpWork)) return null;
  return { caller, others: accounts.filter((profile) => profile.id !== caller.id) };
}

/**
 * The other Claude accounts that can use MCP servers `accountProfileId`
 * cannot, with those servers. Empty unless that account is a sign-in account
 * with its own folder that turned `delegateMcpWork` on. `preview` skips that
 * last check, so Settings can show what turning the option on would hand over.
 */
export function listMcpDelegationAccounts(
  accountProfileId: string,
  directory: McpDelegationDirectory,
  options: { preview?: boolean; includeEmpty?: boolean } = {},
): McpDelegationAccount[] {
  const parties = delegationParties(accountProfileId, directory, options.preview === true);
  if (!parties) return [];
  const own = usableServersOf(parties.caller, directory) ?? new Set<string>();
  return parties.others.flatMap((profile) => {
    const servers = [...(usableServersOf(profile, directory) ?? [])].filter((name) => !own.has(name)).sort();
    return servers.length > 0 || options.includeEmpty ? [{ id: profile.id, label: profile.label, servers: servers.slice(0, MAX_SERVERS_PER_ACCOUNT) }] : [];
  });
}

/** How a subagent doing an MCP step ends its answer; the calling session is told the same form. */
const MCP_DELEGATION_RESULT_FORM = [
  "status: ok | partial | needs_auth | missing_connector | failed",
  "results: one line per item, each a link, an id, or a short excerpt with its source link",
  "error: only when status is not ok: the server, what failed, and what the user has to do",
  "note: one line",
].join("\n");

/**
 * What a session on the calling account reads about its other accounts.
 * Model-facing, so not localized. Null when there is nothing to delegate.
 */
export function buildMcpDelegationPrompt(accounts: readonly McpDelegationAccount[], caller: "claude-code" | "codex" = "claude-code"): string | null {
  if (accounts.length === 0) return null;
  return [
    caller === "codex" ? "MCP servers available through a Claude account:" : "MCP servers on your other Claude accounts:",
    "The user enabled delegating individual MCP steps to the signed-in Claude accounts listed below.",
    ...accounts.map((account) => `- account ${JSON.stringify(account.id)}${caller === "codex" ? "" : ` (${account.label})`}: ${account.servers.slice(0, MAX_SERVERS_PER_ACCOUNT).join(", ")}`),
    "How: call `stave_delegate_task` with `account` (an account id above), `server` (the server the step needs, as named above) and a self-contained `prompt`: the goal, the exact inputs, the file paths it needs, and what to return. Omit `model`, `provider` and `workspace`. The call waits for the answer and returns it in `child.result`.",
    "When:",
    "- Finish local work first (write, check and save files here), then delegate only the step that needs the server, for example the upload of a finished document.",
    "- A lookup you need in the middle of a task (an issue, a thread, a company document) can be delegated as soon as you need the answer; continue with the result.",
    "- Put related calls for the same account into one delegation instead of several small ones.",
    "- When a skill, command or instruction tells you to call a tool of one of these servers, delegate that step and pass along its exact steps and arguments. Do not report the tool as missing.",
    "For a follow-up on the same item, continue the same subagent with `stave_follow_up_delegated_task`.",
    "Never hand over the whole task, and do not ask the user before delegating.",
    `The subagent runs in this workspace on ${MCP_DELEGATION_MODEL}, so it can read files you wrote. Its answer ends in this form:`,
    MCP_DELEGATION_RESULT_FORM,
    "On `needs_auth` or `missing_connector`, tell the user which account and server to fix and do not retry. Stave refuses the call while that account's usage is critical or exhausted; then tell the user which step is still open.",
  ].join("\n");
}

/**
 * System instructions for a subagent on the selected account. Model-facing.
 */
export function buildMcpDelegationBrief(args: { accountLabel: string; server?: string }): string {
  const server = args.server?.trim();
  return [
    `You are doing one MCP step for another task belonging to the same user. You run on the ${args.accountLabel} account because it can use an MCP server the other account cannot.`,
    server
      ? `Use the MCP server "${server}" for this step. Its tools may appear under a slightly different name (for example with a "claude.ai " prefix or as mcp__<server>__<tool>); use the matching one.`
      : "Use the MCP server the request names.",
    "Do only this step. Read files in this workspace when the request points at them; do not change them unless the request says so. Do not start subagents.",
    "If the server asks you to sign in on this account, stop with status needs_auth. If the server or the tool is not available in this session, stop with status missing_connector. Do not work around either.",
    "End your answer in exactly this form, so the caller can continue without asking again:",
    MCP_DELEGATION_RESULT_FORM,
  ].join("\n");
}

export type McpDelegationTarget =
  | { ok: true; accountProfileId: string; label: string }
  | { ok: false; message: string };

/**
 * The account a `stave_delegate_task` call named in `account`, by id or
 * label: any other signed-in Claude account, once the calling account turned
 * the option on. Which servers each account has is advice for the model, not
 * a gate: the process that checks this may hold older readings than the
 * session that chose the account. Model-facing refusals, so not localized.
 */
export function resolveMcpDelegationTarget(args: {
  callerAccountProfileId: string;
  requested: string;
  directory: McpDelegationDirectory;
}): McpDelegationTarget {
  const parties = delegationParties(args.callerAccountProfileId, args.directory, false);
  if (!parties || parties.others.length === 0)
    return { ok: false, message: "This account cannot hand MCP work to another Claude account: the option is off in Settings > Accounts, or there is no other signed-in Claude account. Omit `account`." };
  const requested = args.requested.trim();
  const target = parties.others.find((account) => account.id === requested) ??
    parties.others.find((account) => account.label.toLowerCase() === requested.toLowerCase());
  if (!target)
    return { ok: false, message: `\`account\` must be one of: ${parties.others.map((account) => `"${account.id}" (${account.label})`).join(", ")}.` };
  return { ok: true, accountProfileId: target.id, label: target.label };
}

/** The registry-backed directory both the session prompt and the delegation tool read; null when accounts are unavailable. */
export function currentMcpDelegationDirectory(): McpDelegationDirectory | null {
  try {
    const registry = getProviderAccountRegistry();
    return {
      profiles: registry.list(),
      resolveDirectory: (profileId) => registry.resolveDirectory({ providerId: "claude-code", profileId }),
      systemDirectory: () => systemDirectory("claude-code"),
      connectedServers: (profileId) => readClaudeAccountMcpStatus(profileId)?.connected ?? null,
    };
  } catch {
    return null;
  }
}

/** The note a Claude session on `accountProfileId` gets about its other accounts, or null. */
export function currentMcpDelegationPrompt(accountProfileId: string): string | null {
  if (accountProfileId === SYSTEM_ACCOUNT_PROFILE_ID) return null;
  const directory = currentMcpDelegationDirectory();
  if (!directory) return null;
  try {
    return buildMcpDelegationPrompt(listMcpDelegationAccounts(accountProfileId, directory));
  } catch {
    return null;
  }
}

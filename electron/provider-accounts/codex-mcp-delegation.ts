import type { CodexMcpDelegationSettings } from "../../src/lib/providers/codex-mcp-delegation-settings";
import { buildMcpDelegationPrompt, claudeSignInAccounts, currentMcpDelegationDirectory, usableServersOf, type McpDelegationDirectory, type McpDelegationTarget } from "./mcp-delegation";

function normalizeMcpName(name: string) {
  return name.normalize("NFKC").trim().toLowerCase().replace(/^claude\.ai\s+/, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function selectedClaudeAccount(settings: CodexMcpDelegationSettings, directory: McpDelegationDirectory) {
  return claudeSignInAccounts(directory).find((profile) => profile.id === settings.claudeAccountProfileId);
}

export function codexMcpDelegationCandidates(settings: CodexMcpDelegationSettings, codexMcpNames: readonly string[], directory: McpDelegationDirectory) {
  const profile = selectedClaudeAccount(settings, directory);
  if (!profile) return null;
  const usable = usableServersOf(profile, directory);
  if (!usable) return null;
  const codexNames = new Set(codexMcpNames.map(normalizeMcpName));
  const servers = [...usable].filter((name) => !codexNames.has(normalizeMcpName(name))).sort();
  return { id: profile.id, label: profile.label, servers };
}

export function resolveCodexMcpDelegationTarget(settings: CodexMcpDelegationSettings, requested: string, directory: McpDelegationDirectory): McpDelegationTarget {
  if (!settings.enabled) return { ok: false, message: "Allow Codex to delegate MCP steps in Settings > Accounts before using `account`." };
  const profile = selectedClaudeAccount(settings, directory);
  if (!profile) return { ok: false, message: "The Claude account selected for Codex MCP delegation is unavailable. Select a Claude account in Settings > Accounts." };
  if (requested.trim() !== profile.id && requested.trim().toLowerCase() !== profile.label.toLowerCase())
    return { ok: false, message: `Codex can delegate MCP work to account "${profile.id}" (${profile.label}).` };
  return { ok: true, accountProfileId: profile.id, label: profile.label };
}

export function buildCodexMcpDelegationPrompt(settings: CodexMcpDelegationSettings, codexMcpNames: readonly string[], directory: McpDelegationDirectory) {
  if (!settings.enabled) return null;
  const account = codexMcpDelegationCandidates(settings, codexMcpNames, directory);
  return account?.servers.length ? buildMcpDelegationPrompt([account], "codex") : null;
}

/** Primary turns with a Stave tool grant share this source with Settings and admission. */
export async function currentCodexMcpDelegationPrompt(readCodexNames: () => Promise<string[]>) {
  try {
    const { ensureHostServicePersistenceReady } = await import("../host-service/persistence");
    const settings = ensureHostServicePersistenceReady().delegationPolicies.loadCodexMcpDelegation();
    if (!settings.enabled) return null;
    const directory = currentMcpDelegationDirectory();
    return directory ? buildCodexMcpDelegationPrompt(settings, await readCodexNames(), directory) : null;
  } catch {
    return null;
  }
}

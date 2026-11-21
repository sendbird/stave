import { setTimeout as delay } from "node:timers/promises";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../../src/lib/providers/provider-accounts";
import { getProviderAccountRegistry } from "../provider-accounts/registry";
import type { McpServerStatus } from "@anthropic-ai/claude-agent-sdk";
import { recordClaudeAccountMcpStatus, removeClaudeAccountMcpStatus } from "../provider-accounts/mcp-status-cache";
import { currentProviderAccountId } from "../provider-accounts/runtime-scope";

/**
 * What a turn's MCP readiness probe makes of the CLI's server statuses.
 *
 * Used by: `claude-sdk-runtime.ts` (`waitForClaudeMcpReadiness`).
 */

export interface ClaudeMcpReadinessSummary {
  /** Servers still handshaking. */
  pending: string[];
  /** Servers that reached a terminal state without becoming usable. */
  unavailable: Array<{ name: string; status: string; error?: string }>;
}

export function summarizeClaudeMcpReadiness(servers: readonly McpServerStatus[]): ClaudeMcpReadinessSummary {
  const pending: string[] = [];
  const unavailable: ClaudeMcpReadinessSummary["unavailable"] = [];
  for (const server of servers) {
    if (server.status === "pending") {
      pending.push(server.name);
      continue;
    }
    // `disabled` is a deliberate user choice, not a failure to report.
    if (server.status === "failed" || server.status === "needs-auth") {
      unavailable.push({
        name: server.name,
        status: server.status,
        ...(server.error ? { error: server.error } : {}),
      });
    }
  }
  return { pending, unavailable };
}

/**
 * The summary, after noting the statuses for the account this turn runs on:
 * other accounts' sessions read them to learn which servers work there
 * (`provider-accounts/mcp-status-cache.ts`).
 */
export function observeClaudeMcpReadiness(servers: readonly McpServerStatus[]): ClaudeMcpReadinessSummary {
  const summary = summarizeClaudeMcpReadiness(servers);
  if (summary.pending.length > 0) return summary;
  const profileId = currentProviderAccountId("claude-code");
  const userDataPath = process.env.STAVE_USER_DATA_PATH;
  if (!userDataPath || profileId === SYSTEM_ACCOUNT_PROFILE_ID) {
    recordClaudeAccountMcpStatus(profileId, servers);
    return summary;
  }
  try {
    const registry = getProviderAccountRegistry();
    const stillExists = () => registry.list().some((profile) => profile.id === profileId && profile.providerId === "claude-code" && !profile.gateway);
    if (stillExists()) {
      recordClaudeAccountMcpStatus(profileId, servers);
      // Account removal can happen in main while the host writes a reading.
      if (!stillExists()) removeClaudeAccountMcpStatus(profileId, userDataPath);
    }
  } catch {
    // Readings are advisory and must not interrupt a turn.
  }
  return summary;
}

/** Allow remote connector discovery to populate before accepting the first settled status. */
export async function readSettledClaudeMcpStatus(
  read: () => Promise<McpServerStatus[]>,
  signal: AbortSignal,
) {
  await delay(1_500, undefined, { signal });
  let servers = await read();
  while (servers.some((server) => server.status === "pending")) {
    try {
      await delay(250, undefined, { signal });
      servers = await read();
    } catch (error) {
      if (!signal.aborted) throw error;
      break;
    }
  }
  return servers;
}

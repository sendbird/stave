import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export const CONNECTED_TOOL_IDS = [
  "slack",
  "atlassian",
  "figma",
  "github",
] as const;

export type ConnectedToolId = (typeof CONNECTED_TOOL_IDS)[number];

export type ConnectedToolState =
  | "ready"
  | "needs-auth"
  | "disabled"
  | "error"
  | "unsupported"
  | "unknown";

export interface ConnectedToolStatusEntry {
  id: ConnectedToolId;
  label: string;
  state: ConnectedToolState;
  available: boolean;
  detail: string;
}

export interface ConnectedToolStatusRequest {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
  toolIds?: ConnectedToolId[];
}

export interface ConnectedToolStatusResponse {
  ok: boolean;
  providerId: ProviderId;
  detail: string;
  tools: ConnectedToolStatusEntry[];
}

export function getConnectedToolLabel(toolId: ConnectedToolId) {
  switch (toolId) {
    case "slack":
      return "Slack";
    case "atlassian":
      return "Atlassian (Jira/Confluence)";
    case "figma":
      return "Figma";
    case "github":
      return "GitHub";
  }
}

export function normalizeConnectedToolIds(toolIds?: readonly ConnectedToolId[]) {
  if (!toolIds || toolIds.length === 0) {
    return [...CONNECTED_TOOL_IDS];
  }

  return toolIds.filter((toolId, index, entries) => entries.indexOf(toolId) === index);
}

/**
 * Keywords used to recognise a connector across the many names the same
 * integration ships under.
 *
 * Matching on the bare tool id reported connected connectors as `unsupported`,
 * because neither Claude's account connectors (`claude_ai_Figma`,
 * `claude_ai_Slack`) nor Codex's marketplace plugins (`slack@openai-curated`,
 * `atlassian-rovo@openai-curated`) name their server after the tool id. Every
 * keyword is >= 4 characters and unique to one connector, so substring
 * matching stays unambiguous.
 */
const CONNECTED_TOOL_NAME_KEYWORDS: Record<ConnectedToolId, readonly string[]> = {
  slack: ["slack"],
  atlassian: ["atlassian", "jira", "confluence", "rovo"],
  figma: ["figma"],
  github: ["github"],
};

export function matchesConnectedTool(args: { toolId: ConnectedToolId; serverName: string }) {
  const normalized = args.serverName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return CONNECTED_TOOL_NAME_KEYWORDS[args.toolId].some((keyword) => normalized.includes(keyword));
}

/**
 * Picks the most usable server for a connector.
 *
 * A connector can legitimately be configured more than once — say a local
 * `figma` stdio server alongside the `claude_ai_Figma` account connector. The
 * capability is available if *any* of them is up, so the caller ranks
 * candidates (lower is better) and the best one wins.
 */
export function pickConnectedToolServer<T extends { name: string }>(args: {
  toolId: ConnectedToolId;
  servers: readonly T[];
  rank: (server: T) => number;
}): T | undefined {
  let best: T | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const server of args.servers) {
    if (!matchesConnectedTool({ toolId: args.toolId, serverName: server.name })) {
      continue;
    }
    const rank = args.rank(server);
    if (rank < bestRank) {
      best = server;
      bestRank = rank;
    }
  }
  return best;
}

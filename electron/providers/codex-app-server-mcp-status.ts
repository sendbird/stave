import {
  getConnectedToolLabel,
  pickConnectedToolServer,
  type ConnectedToolId,
  type ConnectedToolStatusEntry,
} from "../../src/lib/providers/connected-tool-status";

export interface CodexMcpServerStatus {
  name: string;
  authStatus?: string | null;
}

/** Lower is better — see `pickConnectedToolServer`. */
const CODEX_MCP_AUTH_STATUS_RANK: Record<string, number> = {
  oAuth: 0,
  bearerToken: 0,
  notLoggedIn: 1,
  unsupported: 2,
};

export function createCodexConnectedToolStatusEntry(args: {
  id: ConnectedToolId;
  state: ConnectedToolStatusEntry["state"];
  available: boolean;
  detail: string;
}) {
  return {
    id: args.id,
    label: getConnectedToolLabel(args.id),
    state: args.state,
    available: args.available,
    detail: args.detail,
  } satisfies ConnectedToolStatusEntry;
}

export function mapCodexMcpServerStatus(args: {
  toolId: ConnectedToolId;
  servers: CodexMcpServerStatus[];
}) {
  const server = pickConnectedToolServer({
    toolId: args.toolId,
    servers: args.servers,
    rank: (candidate) =>
      CODEX_MCP_AUTH_STATUS_RANK[candidate.authStatus ?? ""] ?? 99,
  });
  if (!server) {
    return createCodexConnectedToolStatusEntry({
      id: args.toolId,
      state: "unsupported",
      available: false,
      detail: `${getConnectedToolLabel(args.toolId)} is not configured for Codex.`,
    });
  }

  switch (server.authStatus) {
    case "oAuth":
    case "bearerToken":
      return createCodexConnectedToolStatusEntry({
        id: args.toolId,
        state: "ready",
        available: true,
        detail: `${getConnectedToolLabel(args.toolId)} is ready for Codex via "${server.name}".`,
      });
    case "notLoggedIn":
      return createCodexConnectedToolStatusEntry({
        id: args.toolId,
        state: "needs-auth",
        available: false,
        detail: `${getConnectedToolLabel(args.toolId)} needs authentication in Codex.`,
      });
    case "unsupported":
    default:
      return createCodexConnectedToolStatusEntry({
        id: args.toolId,
        state: "unknown",
        available: true,
        detail: `${getConnectedToolLabel(args.toolId)} auth state is ${server.authStatus ?? "unknown"} in Codex.`,
      });
  }
}

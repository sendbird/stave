import {
  getConnectedToolLabel,
  normalizeConnectedToolIds,
  pickConnectedToolServer,
  type ConnectedToolId,
  type ConnectedToolStatusEntry,
  type ConnectedToolStatusRequest,
  type ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";
import { reloadClaudePlugins } from "./claude-sdk-runtime";
import { getCodexConnectedToolStatus } from "./codex-app-server-runtime";
import type { ProviderId, StreamTurnArgs } from "./types";

function createStatusEntry(args: {
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

/** Lower is better — see `pickConnectedToolServer`. */
const CLAUDE_MCP_STATUS_RANK: Record<string, number> = {
  connected: 0,
  pending: 1,
  "needs-auth": 2,
  failed: 3,
  disabled: 4,
};

function mapClaudeMcpStatus(args: {
  toolId: ConnectedToolId;
  providerId: ProviderId;
  reload: NonNullable<Awaited<ReturnType<typeof reloadClaudePlugins>>["reload"]>;
}) {
  const server = pickConnectedToolServer({
    toolId: args.toolId,
    servers: args.reload.mcpServers,
    rank: (candidate) => CLAUDE_MCP_STATUS_RANK[candidate.status] ?? 99,
  });
  if (!server) {
    return createStatusEntry({
      id: args.toolId,
      state: "unsupported",
      available: false,
      detail: `${getConnectedToolLabel(args.toolId)} is not configured for ${args.providerId}.`,
    });
  }

  switch (server.status) {
    case "connected":
      return createStatusEntry({
        id: args.toolId,
        state: "ready",
        available: true,
        detail: `${getConnectedToolLabel(args.toolId)} is connected for Claude via "${server.name}".`,
      });
    case "needs-auth":
      return createStatusEntry({
        id: args.toolId,
        state: "needs-auth",
        available: false,
        detail: server.error?.trim() || `${getConnectedToolLabel(args.toolId)} needs authentication in Claude.`,
      });
    case "disabled":
      return createStatusEntry({
        id: args.toolId,
        state: "disabled",
        available: false,
        detail: server.error?.trim() || `${getConnectedToolLabel(args.toolId)} is disabled in Claude.`,
      });
    case "failed":
      return createStatusEntry({
        id: args.toolId,
        state: "error",
        available: false,
        detail: server.error?.trim() || `${getConnectedToolLabel(args.toolId)} failed to load in Claude.`,
      });
    case "pending":
    default:
      return createStatusEntry({
        id: args.toolId,
        state: "unknown",
        // Not `available`: a pending connector's tools are genuinely absent
        // right now, which is exactly the window this preflight exists to warn
        // about.
        available: false,
        detail: `${getConnectedToolLabel(args.toolId)} ("${server.name}") is still connecting in Claude, so its tools are not available yet.`,
      });
  }
}

async function getClaudeConnectedToolStatus(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  toolIds?: ConnectedToolId[];
}): Promise<ConnectedToolStatusResponse> {
  const toolIds = normalizeConnectedToolIds(args.toolIds);
  const reloadResult = await reloadClaudePlugins({
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
  });

  if (!reloadResult.ok || !reloadResult.reload) {
    return {
      ok: false,
      providerId: "claude-code",
      detail: reloadResult.detail,
      tools: toolIds.map((toolId) => createStatusEntry({
        id: toolId,
        state: "error",
        available: false,
        detail: reloadResult.detail,
      })),
    };
  }

  return {
    ok: true,
    providerId: "claude-code",
    detail: reloadResult.detail,
    tools: toolIds.map((toolId) => mapClaudeMcpStatus({
      toolId,
      providerId: "claude-code",
      reload: reloadResult.reload,
    })),
  };
}

export async function getProviderConnectedToolStatus(
  args: ConnectedToolStatusRequest,
): Promise<ConnectedToolStatusResponse> {
  if (args.providerId === "claude-code") {
    return getClaudeConnectedToolStatus({
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
      toolIds: args.toolIds,
    });
  }

  if (args.providerId === "codex") {
    return getCodexConnectedToolStatus({
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
      toolIds: args.toolIds,
    });
  }

  const toolIds = normalizeConnectedToolIds(args.toolIds);
  return {
    ok: false,
    providerId: args.providerId,
    detail: `${args.providerId} does not support connected-tool preflight.`,
    tools: toolIds.map((toolId) => createStatusEntry({
      id: toolId,
      state: "unsupported",
      available: false,
      detail: `${getConnectedToolLabel(toolId)} is not supported by ${args.providerId}.`,
    })),
  };
}

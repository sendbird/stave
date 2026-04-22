import {
  getConnectedToolLabel,
  normalizeConnectedToolIds,
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

function mapClaudeMcpStatus(args: {
  toolId: ConnectedToolId;
  providerId: ProviderId;
  reload: NonNullable<Awaited<ReturnType<typeof reloadClaudePlugins>>["reload"]>;
}) {
  if (args.toolId === "github") {
    return createStatusEntry({
      id: "github",
      state: "unknown",
      available: true,
      detail: "GitHub tool status is not exposed by the Claude plugin reload snapshot.",
    });
  }

  const serverName = args.toolId === "atlassian" ? "atlassian" : args.toolId;
  const server = args.reload.mcpServers.find((candidate) => candidate.name.trim().toLowerCase() === serverName);
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
        detail: `${getConnectedToolLabel(args.toolId)} is connected for Claude.`,
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
        available: true,
        detail: `${getConnectedToolLabel(args.toolId)} is still pending in Claude.`,
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

function getUnsupportedProviderToolStatus(args: {
  providerId: ProviderId;
  toolIds?: ConnectedToolId[];
}): ConnectedToolStatusResponse {
  const toolIds = normalizeConnectedToolIds(args.toolIds);
  return {
    ok: true,
    providerId: args.providerId,
    detail: `${args.providerId} does not support connected-tool preflight.`,
    tools: toolIds.map((toolId) => createStatusEntry({
      id: toolId,
      state: "unknown",
      available: true,
      detail: "Stave Auto does not expose deterministic connected-tool preflight. Muse will fall through to the routed provider.",
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

  return getUnsupportedProviderToolStatus({
    providerId: args.providerId,
    toolIds: args.toolIds,
  });
}

/**
 * Claude side of MCP App views (MCP Apps UI extension), against
 * `@anthropic-ai/claude-agent-sdk` 0.3.284:
 *
 * - `query.mcpServerStatus()` lists each server's tools with the MCP Apps
 *   members of their `_meta` (`ui.resourceUri`, `ui.visibility`, the
 *   deprecated `ui/resourceUri`) when the CLI advertises
 *   `mcp_tool_ui_meta_v1` in `system/init.capabilities`.
 * - `query.readMcpResource(serverName, uri)` (alpha, `ui://` only) reads the
 *   view when the CLI advertises `mcp_read_resource_v1`.
 *
 * The SDK has no host API to call an external server's tools or read its
 * other resources, and the query closes with the turn, so a Claude view can
 * show its call's input and result but its `tools/call` and `resources/read`
 * requests are refused (and the view's `ui/initialize` result says so).
 */
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  buildClaudeMcpToolName,
  readMcpAppToolDescriptors,
  readMcpAppToolUiMeta,
} from "../../src/lib/mcp-app/mcp-app-view";
import type { BridgeEvent } from "./types";
import {
  buildMcpAppViewToolResultEvent,
  captureMcpAppView,
  createMcpAppViewCaptureTracker,
} from "./mcp-app-view-capture";

export const CLAUDE_MCP_APP_CAPABILITIES = [
  "mcp_tool_ui_meta_v1",
  "mcp_read_resource_v1",
] as const;

type ClaudeMcpAppQuery = Pick<Query, "mcpServerStatus" | "readMcpResource">;
type ServerStatus = Awaited<ReturnType<Query["mcpServerStatus"]>>[number];

/** The server and tool behind a Claude tool name, matched against live status. */
export function findClaudeMcpAppTool(statuses: readonly ServerStatus[], toolName: string) {
  for (const server of statuses) {
    for (const tool of server.tools ?? []) {
      if (buildClaudeMcpToolName(server.name, tool.name) === toolName) {
        return { server, tool };
      }
    }
  }
  return null;
}

/**
 * Per-turn capture. `observe` sees every SDK message with the events it
 * mapped to; a completed `mcp__<server>__<tool>` call whose tool declares a
 * view is captured in the background, and `settle` holds the turn's `done`
 * until every capture finished or timed out.
 */
export function createClaudeMcpAppViewCapture(args: {
  enabled: boolean;
  workspaceId: string | null;
  taskId: string | null;
  getQuery: () => ClaudeMcpAppQuery | null;
  emit: (event: BridgeEvent) => void;
}) {
  const tracker = createMcpAppViewCaptureTracker();
  const calls = new Map<string, { toolName: string; input: string }>();
  let supported = false;
  let statuses: Promise<ServerStatus[]> | null = null;

  async function resolveTool(query: ClaudeMcpAppQuery, toolName: string) {
    statuses ??= query.mcpServerStatus();
    let match = findClaudeMcpAppTool(await statuses, toolName);
    if (!match) {
      // A server that connected mid-turn: refresh once.
      statuses = query.mcpServerStatus();
      match = findClaudeMcpAppTool(await statuses, toolName);
    }
    return match;
  }

  function capture(toolUseId: string, call: { toolName: string; input: string }, output: string) {
    const query = args.getQuery();
    if (!query) return;
    tracker.track(
      (async () => {
        const match = await resolveTool(query, call.toolName);
        const ui = match ? readMcpAppToolUiMeta(match.tool._meta) : null;
        if (!match || !ui) return;
        const reference = await captureMcpAppView({
          provider: "claude-code",
          server: match.server.name,
          tool: match.tool.name,
          toolUseId,
          resourceUri: ui.resourceUri,
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          toolInput: call.input,
          toolResult: { content: [{ type: "text", text: output }] },
          readResource: (uri) => query.readMcpResource(match.server.name, uri),
          listAppTools: async () => readMcpAppToolDescriptors(match.server.tools),
        });
        if (reference) {
          args.emit(buildMcpAppViewToolResultEvent({ toolUseId, output, reference }));
        }
      })(),
    );
  }

  return {
    hasPending: tracker.hasPending,
    settle: tracker.settle,
    observe(message: SDKMessage, events: readonly BridgeEvent[]) {
      if (!args.enabled) return;
      if (message.type === "system" && message.subtype === "init") {
        const capabilities = (message as { capabilities?: unknown }).capabilities;
        supported =
          Array.isArray(capabilities) &&
          CLAUDE_MCP_APP_CAPABILITIES.every((capability) => capabilities.includes(capability));
      }
      if (!supported) return;
      for (const event of events) {
        if (event.type === "tool" && event.toolUseId && event.toolName.startsWith("mcp__")) {
          calls.set(event.toolUseId, { toolName: event.toolName, input: event.input });
        } else if (event.type === "tool_result" && !event.isPartial) {
          const call = calls.get(event.tool_use_id);
          calls.delete(event.tool_use_id);
          if (call && !event.isError) capture(event.tool_use_id, call, event.output);
        }
      }
    },
  };
}

import {
  MCP_APP_MAX_HTML_BYTES,
  normalizeMcpAppToolResult,
} from "../../src/lib/mcp-app/mcp-app-view";
import {
  getMcpAppViewStore,
  type McpAppViewRecord,
  type McpAppViewStore,
} from "../main/mcp-app/mcp-app-view-store";
import type { CodexMcpAppClient } from "./codex-mcp-app-views";
import type {
  McpAppViewRequestArgs,
  McpAppViewRequestResponse,
} from "../../src/lib/mcp-app/mcp-app-bridge";

const TOOL_CALL_TIMEOUT_MS = 120_000;
const RESOURCE_READ_TIMEOUT_MS = 20_000;

/**
 * Runs a request a view made against its own server. The server, thread and
 * App Server come from the view's stored record, never from the renderer, so
 * a view can reach only the server whose tool produced it. `tools/call` is
 * re-checked here against the tool's declared visibility; the renderer has
 * already asked the user for any tool that is not read-only.
 *
 * Only Codex can run these: its App Server keeps the thread and exposes
 * `mcpServer/tool/call` and `mcpServer/resource/read`. Claude's SDK has no
 * such host API, so Claude views are refused.
 */
export async function handleMcpAppViewRequest(
  args: McpAppViewRequestArgs,
  deps: {
    store?: Pick<McpAppViewStore, "describe">;
    getCodexClient: (record: McpAppViewRecord) => CodexMcpAppClient;
  },
): Promise<McpAppViewRequestResponse> {
  const record = await (deps.store ?? getMcpAppViewStore()).describe(args.viewId);
  if (!record) return { ok: false, error: "This view is no longer available." };
  if (record.provider !== "codex" || !record.threadId) {
    return { ok: false, error: "This provider cannot run requests for MCP App views." };
  }
  try {
    const client = deps.getCodexClient(record);
    if (args.method === "tools/call") {
      const name = args.params.name ?? "";
      const tool = record.appTools.find((entry) => entry.name === name);
      if (!tool || !tool.visibility.includes("app")) {
        return { ok: false, error: `Tool ${name} is not available to apps.` };
      }
      const response = await client.request(
        "mcpServer/tool/call",
        {
          threadId: record.threadId,
          server: record.server,
          tool: name,
          arguments: args.params.arguments ?? {},
        },
        { timeoutMs: TOOL_CALL_TIMEOUT_MS },
      );
      const result = normalizeMcpAppToolResult(response);
      return result ? { ok: true, result } : { ok: false, error: "The tool returned no usable result." };
    }
    const uri = args.params.uri ?? "";
    const response = await client.request<{ contents?: unknown }>(
      "mcpServer/resource/read",
      { threadId: record.threadId, server: record.server, uri },
      { timeoutMs: RESOURCE_READ_TIMEOUT_MS },
    );
    const contents = Array.isArray(response?.contents) ? response.contents : [];
    if (JSON.stringify(contents).length > MCP_APP_MAX_HTML_BYTES) {
      return { ok: false, error: "The resource is too large." };
    }
    return { ok: true, result: { contents } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : "The request failed.",
    };
  }
}

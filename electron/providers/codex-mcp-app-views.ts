/**
 * Codex side of MCP App views (MCP Apps UI extension). Verified against the
 * codex-cli 0.159.3 generated App Server schema:
 *
 * - `initialize` `capabilities.extensions` is an open object of "MCP extension
 *   settings declared by the app-server client"; Stave declares
 *   `io.modelcontextprotocol/ui` there only while views are enabled.
 * - `mcpToolCall` thread items carry `mcpAppUi { resourceUri,
 *   preferredModelDisplayMode }` and the legacy `mcpAppResourceUri`,
 *   "captured from the invoked descriptor; absent in older history" — which
 *   is why the view is captured when the call completes.
 * - `mcpServer/resource/read { threadId, server, uri }` reads the view, and
 *   `mcpServer/tool/call { threadId, server, tool, arguments }` runs a tool a
 *   view asks for.
 * - `mcpServerStatus/list { threadId, serverName, detail }` lists the
 *   server's tools with their `_meta` and `annotations`.
 */
import {
  isMcpAppResourceUri,
  MCP_APP_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  readMcpAppToolDescriptors,
  type McpAppToolDescriptor,
} from "../../src/lib/mcp-app/mcp-app-view";
import type { BridgeEvent } from "./types";
import {
  buildMcpAppViewToolResultEvent,
  captureMcpAppView,
  createMcpAppViewCaptureTracker,
} from "./mcp-app-view-capture";

export interface CodexMcpAppClient {
  request<T = unknown>(
    method: string,
    params: unknown,
    options?: { timeoutMs?: number },
  ): Promise<T>;
}

let advertiseMcpApps = false;

/**
 * Records the user's setting from a turn's runtime options and reports whether
 * a running App Server advertised something else at `initialize`, so the
 * caller restarts it. Turns that do not carry the option leave it unchanged.
 */
export function noteCodexMcpAppViewsSetting(args: {
  enabled: boolean | undefined;
  advertised: boolean | null;
}): boolean {
  if (typeof args.enabled === "boolean") advertiseMcpApps = args.enabled;
  return args.advertised !== null && args.advertised !== advertiseMcpApps;
}

/** The `initialize` capabilities this App Server process starts with. */
export function buildCodexMcpAppInitializeCapabilities(
  enabled: boolean = advertiseMcpApps,
): { extensions?: Record<string, unknown> } {
  return enabled
    ? { extensions: { [MCP_APP_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] } } }
    : {};
}

type CodexMcpAppItem = {
  id?: unknown;
  server?: unknown;
  tool?: unknown;
  status?: unknown;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
  mcpAppUi?: { resourceUri?: unknown } | null;
  mcpAppResourceUri?: unknown;
};

/** The view a completed `mcpToolCall` item names, preferring `mcpAppUi`. */
export function readCodexMcpAppResourceUri(item: CodexMcpAppItem): string | null {
  const preferred = item.mcpAppUi?.resourceUri;
  if (isMcpAppResourceUri(preferred)) return preferred;
  return isMcpAppResourceUri(item.mcpAppResourceUri) ? item.mcpAppResourceUri : null;
}

export async function listCodexMcpAppTools(args: {
  client: CodexMcpAppClient;
  threadId: string;
  server: string;
  timeoutMs?: number;
}): Promise<McpAppToolDescriptor[]> {
  const response = await args.client.request<{ data?: unknown[] }>(
    "mcpServerStatus/list",
    { threadId: args.threadId, serverName: args.server, detail: "toolsAndAuthOnly" },
    { timeoutMs: args.timeoutMs ?? 20_000 },
  );
  const status = (response?.data ?? []).find(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      (entry as { name?: unknown }).name === args.server,
  ) as { tools?: unknown } | undefined;
  return readMcpAppToolDescriptors(status?.tools);
}

/**
 * Per-turn capture: completed `mcpToolCall` items that name a view are read
 * and stored while the turn continues; `settle` lets the turn hold `done`
 * until every capture finished or timed out.
 */
export function createCodexMcpAppViewCapture(args: {
  enabled: boolean;
  client: CodexMcpAppClient;
  threadId: string;
  workspaceId: string | null;
  taskId: string | null;
  executablePath: string;
  accountProfileId: string | null;
  emit: (event: BridgeEvent) => void;
}) {
  const tracker = createMcpAppViewCaptureTracker();
  return {
    hasPending: tracker.hasPending,
    settle: tracker.settle,
    observeCompleted(item: CodexMcpAppItem, resultEvent: BridgeEvent | undefined) {
      if (!args.enabled || item.status !== "completed" || item.error) return;
      if (resultEvent?.type !== "tool_result" || resultEvent.isError) return;
      const resourceUri = readCodexMcpAppResourceUri(item);
      const server = typeof item.server === "string" ? item.server : "";
      const tool = typeof item.tool === "string" ? item.tool : "";
      const toolUseId = typeof item.id === "string" ? item.id : "";
      if (!resourceUri || !server || !tool || !toolUseId) return;
      tracker.track(
        captureMcpAppView({
          provider: "codex",
          server,
          tool,
          toolUseId,
          resourceUri,
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          threadId: args.threadId,
          executablePath: args.executablePath,
          accountProfileId: args.accountProfileId,
          toolInput: item.arguments,
          toolResult: item.result,
          readResource: (uri) =>
            args.client.request(
              "mcpServer/resource/read",
              { threadId: args.threadId, server, uri },
              { timeoutMs: 20_000 },
            ),
          listAppTools: () =>
            listCodexMcpAppTools({ client: args.client, threadId: args.threadId, server }),
        }).then((reference) => {
          if (!reference) return;
          args.emit(
            buildMcpAppViewToolResultEvent({
              toolUseId,
              output: resultEvent.output,
              reference,
            }),
          );
        }),
      );
    },
  };
}

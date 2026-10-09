/**
 * The renderer bridge for MCP App views (`window.api.mcpApp`): what the
 * frame host learns about a stored view, and the requests it can relay to the
 * view's own server. Shared by preload, the IPC handlers, the host service,
 * and the renderer.
 */
import type { McpAppCsp } from "./mcp-app-csp";
import type {
  McpAppPermissions,
  McpAppToolDescriptor,
  McpAppViewProvider,
} from "./mcp-app-view";

export interface McpAppViewDescription {
  provider: McpAppViewProvider;
  server: string;
  tool: string;
  resourceUri: string;
  csp: McpAppCsp;
  permissions: McpAppPermissions;
  prefersBorder: boolean | null;
  appTools: McpAppToolDescriptor[];
  toolInput: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  /** What the host can relay for this view: only Codex views reach their server. */
  capabilities: { serverTools: boolean; serverResources: boolean };
  /**
   * The view's HTML, only from hosts that cannot serve the render scheme (the
   * browser-only preview). The desktop app loads the view by URL instead.
   */
  html?: string;
}

export type McpAppViewDescribeResponse =
  | { ok: true; exists: true; view: McpAppViewDescription }
  | { ok: true; exists: false }
  | { ok: false; error: string };

export type McpAppViewRequestMethod = "tools/call" | "resources/read";

export interface McpAppViewRequestArgs {
  viewId: string;
  method: McpAppViewRequestMethod;
  params: { name?: string; arguments?: Record<string, unknown>; uri?: string };
}

export type McpAppViewRequestResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface McpAppBridgeApi {
  describe: (args: { viewId: string }) => Promise<McpAppViewDescribeResponse>;
  request: (args: McpAppViewRequestArgs) => Promise<McpAppViewRequestResponse>;
}

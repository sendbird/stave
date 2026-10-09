/**
 * The host side of one MCP App view's JSON-RPC conversation over
 * `postMessage` (MCP Apps UI extension, spec 2026-01-26).
 *
 * Lifecycle: the view sends `ui/initialize`; the host answers with its
 * capabilities and `hostContext`; the view sends
 * `ui/notifications/initialized`; only then does the host send anything of
 * its own, starting with the tool input and result. Before teardown the host
 * sends `ui/resource-teardown`.
 *
 * Every message is untrusted. The caller only passes messages whose source is
 * the view's own frame window; this module refuses oversized messages, caps
 * requests in flight, answers unknown methods with -32601, gates `tools/call`
 * on the target tool's visibility and the user's confirmation, and never acts
 * on a request before the handshake.
 *
 * It is pure: the frame host supplies `post` and the handlers, so the tests
 * drive the whole protocol without a browser.
 */
import type { McpAppHostContext } from "./mcp-app-host-context";
import { describeMcpAppPermissions, type McpAppCsp } from "./mcp-app-csp";
import {
  MCP_APP_MAX_IN_FLIGHT_REQUESTS,
  MCP_APP_MAX_MESSAGE_CHARS,
  MCP_APP_MAX_MODEL_CONTEXT_CHARS,
  MCP_APP_MAX_USER_MESSAGE_CHARS,
  MCP_APP_PROTOCOL_VERSION,
  type McpAppDisplayMode,
  type McpAppPermissions,
  type McpAppToolDescriptor,
} from "./mcp-app-view";

export const MCP_APP_ERROR = {
  refused: -32000,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export const MCP_APP_METHOD = {
  initialize: "ui/initialize",
  initialized: "ui/notifications/initialized",
  ping: "ping",
  sizeChanged: "ui/notifications/size-changed",
  openLink: "ui/open-link",
  requestDisplayMode: "ui/request-display-mode",
  message: "ui/message",
  updateModelContext: "ui/update-model-context",
  toolsCall: "tools/call",
  resourcesRead: "resources/read",
  log: "notifications/message",
  toolInput: "ui/notifications/tool-input",
  toolResult: "ui/notifications/tool-result",
  hostContextChanged: "ui/notifications/host-context-changed",
  teardown: "ui/resource-teardown",
} as const;

type JsonRpcId = string | number;

export interface McpAppHostCapabilities {
  /** The host can proxy `tools/call` to the view's own server. */
  serverTools: boolean;
  /** The host can proxy `resources/read` to the view's own server. */
  serverResources: boolean;
}

export interface McpAppHostHandlers {
  /** Opens an http(s) link; false when the reader did not just click in the view. */
  openLink(url: string): boolean | Promise<boolean>;
  /** Applies a display mode and returns the mode now in effect. */
  requestDisplayMode(mode: McpAppDisplayMode): McpAppDisplayMode;
  /** Asks the reader, then queues the text as their next message; false when declined. */
  sendMessage(text: string): Promise<boolean>;
  /** Replaces this view's context for the agent's next turn (empty clears it). */
  updateModelContext(text: string): void;
  /** Asks the reader to allow a tool call that is not read-only. */
  confirmToolCall(args: {
    tool: McpAppToolDescriptor;
    arguments: Record<string, unknown>;
  }): Promise<boolean>;
  callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  readResource(uri: string): Promise<unknown>;
  sizeChanged(size: { height: number; width?: number }): void;
  log?(params: unknown): void;
}

export interface McpAppHostSessionOptions {
  hostContext: () => McpAppHostContext;
  capabilities: McpAppHostCapabilities;
  csp: McpAppCsp;
  permissions: McpAppPermissions;
  toolInput: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  /** Tools on the view's server, with their visibility and read-only hint. */
  appTools: readonly McpAppToolDescriptor[];
  post(message: unknown): void;
  handlers: McpAppHostHandlers;
  hostVersion?: string;
}

export type McpAppHostPhase = "waiting" | "initializing" | "ready" | "closed";

export interface McpAppHostSession {
  readonly phase: McpAppHostPhase;
  /** Handles one message the view's own frame window posted. */
  receive(data: unknown): void;
  /** Sends changed context fields, once the view is initialized. */
  updateHostContext(partial: Partial<McpAppHostContext>): void;
  /** Sends `ui/resource-teardown` and waits briefly for the answer. */
  teardown(reason: string, timeoutMs?: number): Promise<void>;
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    (typeof value === "string" && value.length > 0 && value.length <= 200) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function measure(data: unknown): number | null {
  try {
    return JSON.stringify(data)?.length ?? 0;
  } catch {
    return null;
  }
}

function readTexts(content: unknown): string[] {
  const blocks = Array.isArray(content) ? content : [content];
  return blocks.flatMap((block) =>
    isRecord(block) && block.type === "text" && typeof block.text === "string"
      ? [block.text]
      : [],
  );
}

function isExternalHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function createMcpAppHostSession(options: McpAppHostSessionOptions): McpAppHostSession {
  let phase: McpAppHostPhase = "waiting";
  let inFlight = 0;
  let viewDisplayModes: McpAppDisplayMode[] | null = null;
  let nextHostRequestId = 1;
  const pendingHostRequests = new Map<JsonRpcId, () => void>();

  const post = (message: Record<string, unknown>) => {
    if (phase === "closed") return;
    options.post({ jsonrpc: "2.0", ...message });
  };
  const respond = (id: JsonRpcId, result: unknown) => post({ id, result });
  const fail = (id: JsonRpcId, code: number, message: string) =>
    post({ id, error: { code, message } });

  function hostCapabilities() {
    return {
      openLinks: {},
      logging: {},
      ...(options.capabilities.serverTools ? { serverTools: {} } : {}),
      ...(options.capabilities.serverResources ? { serverResources: {} } : {}),
      sandbox: {
        permissions: describeMcpAppPermissions(options.permissions),
        csp: { ...options.csp },
      },
    };
  }

  function handleInitialize(params: Record<string, unknown>) {
    if (phase !== "waiting") throw new RpcError(MCP_APP_ERROR.invalidRequest, "Already initialized.");
    const appCapabilities = isRecord(params.appCapabilities) ? params.appCapabilities : {};
    if (Array.isArray(appCapabilities.availableDisplayModes)) {
      viewDisplayModes = appCapabilities.availableDisplayModes.filter(
        (mode): mode is McpAppDisplayMode => mode === "inline" || mode === "fullscreen",
      );
    }
    phase = "initializing";
    return {
      protocolVersion: MCP_APP_PROTOCOL_VERSION,
      hostInfo: { name: "Stave", version: options.hostVersion ?? "1" },
      hostCapabilities: hostCapabilities(),
      hostContext: options.hostContext(),
    };
  }

  function handleInitialized() {
    if (phase !== "initializing") return;
    phase = "ready";
    if (options.toolInput) {
      post({ method: MCP_APP_METHOD.toolInput, params: { arguments: options.toolInput } });
    }
    if (options.toolInput && options.toolResult) {
      post({ method: MCP_APP_METHOD.toolResult, params: options.toolResult });
    }
  }

  async function handleToolsCall(params: Record<string, unknown>) {
    if (!options.capabilities.serverTools) {
      throw new RpcError(
        MCP_APP_ERROR.refused,
        "This host cannot call tools on the view's server for this provider.",
      );
    }
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments === undefined ? {} : params.arguments;
    if (!name || !isRecord(args)) {
      throw new RpcError(MCP_APP_ERROR.invalidParams, "tools/call needs a name and object arguments.");
    }
    const tool = options.appTools.find((entry) => entry.name === name);
    if (!tool || !tool.visibility.includes("app")) {
      throw new RpcError(MCP_APP_ERROR.refused, `Tool ${name} is not available to apps.`);
    }
    if (!tool.readOnlyHint) {
      const allowed = await options.handlers.confirmToolCall({ tool, arguments: args });
      if (!allowed) throw new RpcError(MCP_APP_ERROR.refused, "Tool call denied by the user.");
    }
    return await options.handlers.callTool({ name, arguments: args });
  }

  async function handleResourcesRead(params: Record<string, unknown>) {
    if (!options.capabilities.serverResources) {
      throw new RpcError(
        MCP_APP_ERROR.refused,
        "This host cannot read resources from the view's server for this provider.",
      );
    }
    const uri = typeof params.uri === "string" ? params.uri : "";
    if (!uri || uri.length > 2_048) {
      throw new RpcError(MCP_APP_ERROR.invalidParams, "resources/read needs a uri.");
    }
    return await options.handlers.readResource(uri);
  }

  async function handleMessage(params: Record<string, unknown>) {
    if (params.role !== "user") {
      throw new RpcError(MCP_APP_ERROR.invalidParams, "ui/message accepts only the user role.");
    }
    const text = readTexts(params.content).join("\n\n").trim();
    if (!text) throw new RpcError(MCP_APP_ERROR.invalidParams, "ui/message needs text content.");
    if (text.length > MCP_APP_MAX_USER_MESSAGE_CHARS) {
      throw new RpcError(MCP_APP_ERROR.refused, "The message is too long.");
    }
    const sent = await options.handlers.sendMessage(text);
    if (!sent) throw new RpcError(MCP_APP_ERROR.refused, "Message sending denied.");
    return {};
  }

  function handleUpdateModelContext(params: Record<string, unknown>) {
    const parts = readTexts(params.content);
    if (params.structuredContent !== undefined) {
      parts.push(JSON.stringify(params.structuredContent));
    }
    const text = parts.join("\n\n").trim();
    if (text.length > MCP_APP_MAX_MODEL_CONTEXT_CHARS) {
      throw new RpcError(MCP_APP_ERROR.refused, "Context update is too large.");
    }
    options.handlers.updateModelContext(text);
    return {};
  }

  async function handleOpenLink(params: Record<string, unknown>) {
    const url = typeof params.url === "string" ? params.url : "";
    if (!url || url.length > 4_096 || !isExternalHttpUrl(url)) {
      throw new RpcError(MCP_APP_ERROR.invalidParams, "Invalid URL.");
    }
    const opened = await options.handlers.openLink(url);
    if (!opened) throw new RpcError(MCP_APP_ERROR.refused, "Link opening denied.");
    return {};
  }

  function handleRequestDisplayMode(params: Record<string, unknown>) {
    const requested = params.mode;
    const current = options.hostContext().displayMode;
    if (requested !== "inline" && requested !== "fullscreen") return { mode: current };
    if (viewDisplayModes && !viewDisplayModes.includes(requested)) return { mode: current };
    const mode = options.handlers.requestDisplayMode(requested);
    if (mode !== current && phase === "ready") {
      post({ method: MCP_APP_METHOD.hostContextChanged, params: { displayMode: mode } });
    }
    return { mode };
  }

  async function dispatchRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === MCP_APP_METHOD.initialize) return handleInitialize(params);
    if (method === MCP_APP_METHOD.ping) return {};
    if (phase === "waiting") {
      throw new RpcError(MCP_APP_ERROR.invalidRequest, "Send ui/initialize first.");
    }
    switch (method) {
      case MCP_APP_METHOD.openLink:
        return handleOpenLink(params);
      case MCP_APP_METHOD.requestDisplayMode:
        return handleRequestDisplayMode(params);
      case MCP_APP_METHOD.message:
        return handleMessage(params);
      case MCP_APP_METHOD.updateModelContext:
        return handleUpdateModelContext(params);
      case MCP_APP_METHOD.toolsCall:
        return handleToolsCall(params);
      case MCP_APP_METHOD.resourcesRead:
        return handleResourcesRead(params);
      default:
        throw new RpcError(MCP_APP_ERROR.methodNotFound, `Method not found: ${method}`);
    }
  }

  function handleNotification(method: string, params: Record<string, unknown>) {
    if (method === MCP_APP_METHOD.initialized) {
      handleInitialized();
      return;
    }
    if (method === MCP_APP_METHOD.sizeChanged) {
      const height = params.height;
      const width = params.width;
      if (typeof height === "number" && Number.isFinite(height) && height >= 0) {
        options.handlers.sizeChanged({
          height,
          ...(typeof width === "number" && Number.isFinite(width) && width >= 0 ? { width } : {}),
        });
      }
      return;
    }
    if (method === MCP_APP_METHOD.log) options.handlers.log?.(params);
    // Every other notification is ignored.
  }

  function handleRequest(id: JsonRpcId, method: string, params: Record<string, unknown>) {
    if (inFlight >= MCP_APP_MAX_IN_FLIGHT_REQUESTS) {
      fail(id, MCP_APP_ERROR.refused, "Too many requests in flight.");
      return;
    }
    inFlight += 1;
    void (async () => {
      try {
        respond(id, (await dispatchRequest(method, params)) ?? {});
      } catch (error) {
        if (error instanceof RpcError) {
          fail(id, error.code, error.message);
        } else {
          fail(id, MCP_APP_ERROR.internal, error instanceof Error ? error.message : "Request failed.");
        }
      } finally {
        inFlight -= 1;
      }
    })();
  }

  return {
    get phase() {
      return phase;
    },

    receive(data) {
      if (phase === "closed" || !isRecord(data) || data.jsonrpc !== "2.0") return;
      const size = measure(data);
      const id = isJsonRpcId(data.id) ? data.id : null;
      if (size === null || size > MCP_APP_MAX_MESSAGE_CHARS) {
        if (id !== null && typeof data.method === "string") {
          fail(id, MCP_APP_ERROR.invalidRequest, "Message too large.");
        }
        return;
      }
      if (typeof data.method !== "string") {
        // A response to one of the host's own requests.
        if (id !== null && ("result" in data || "error" in data)) {
          const resolve = pendingHostRequests.get(id);
          pendingHostRequests.delete(id);
          resolve?.();
        }
        return;
      }
      const params = isRecord(data.params) ? data.params : {};
      if (id === null) {
        handleNotification(data.method, params);
      } else {
        handleRequest(id, data.method, params);
      }
    },

    updateHostContext(partial) {
      if (phase !== "ready") return;
      post({ method: MCP_APP_METHOD.hostContextChanged, params: partial });
    },

    teardown(reason, timeoutMs = 500) {
      if (phase === "closed") return Promise.resolve();
      if (phase !== "ready") {
        phase = "closed";
        return Promise.resolve();
      }
      const id = `stave-host-${nextHostRequestId++}`;
      return new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          pendingHostRequests.delete(id);
          phase = "closed";
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        pendingHostRequests.set(id, finish);
        post({ id, method: MCP_APP_METHOD.teardown, params: { reason } });
      });
    },
  };
}

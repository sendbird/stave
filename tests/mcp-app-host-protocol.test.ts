import { describe, expect, test } from "bun:test";
import { EMPTY_MCP_APP_CSP } from "@/lib/mcp-app/mcp-app-csp";
import {
  buildMcpAppHostContext,
  buildMcpAppStyleVariables,
} from "@/lib/mcp-app/mcp-app-host-context";
import {
  createMcpAppHostSession,
  MCP_APP_ERROR,
  type McpAppHostHandlers,
  type McpAppHostSessionOptions,
} from "@/lib/mcp-app/mcp-app-host-protocol";
import {
  MCP_APP_MAX_IN_FLIGHT_REQUESTS,
  MCP_APP_MAX_MESSAGE_CHARS,
  MCP_APP_PROTOCOL_VERSION,
  type McpAppDisplayMode,
} from "@/lib/mcp-app/mcp-app-view";
import {
  resetMcpAppModelContextForTests,
  setMcpAppModelContext,
  takeMcpAppModelContextParts,
} from "@/lib/mcp-app/mcp-app-model-context";

type Posted = { id?: unknown; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string } };

function setup(overrides: Partial<McpAppHostSessionOptions> & { handlers?: Partial<McpAppHostHandlers> } = {}) {
  const posted: Posted[] = [];
  const calls: string[] = [];
  let displayMode: McpAppDisplayMode = "inline";
  const handlers: McpAppHostHandlers = {
    openLink: () => true,
    requestDisplayMode: (mode) => {
      displayMode = mode;
      return mode;
    },
    sendMessage: async (text) => {
      calls.push(`message:${text}`);
      return true;
    },
    updateModelContext: (text) => calls.push(`context:${text}`),
    confirmToolCall: async ({ tool }) => {
      calls.push(`confirm:${tool.name}`);
      return true;
    },
    callTool: async ({ name, arguments: args }) => {
      calls.push(`call:${name}:${JSON.stringify(args)}`);
      return { content: [{ type: "text", text: "done" }] };
    },
    readResource: async (uri) => ({ contents: [{ uri, text: "r" }] }),
    sizeChanged: ({ height }) => calls.push(`size:${height}`),
    ...overrides.handlers,
  };
  const session = createMcpAppHostSession({
    hostContext: () =>
      buildMcpAppHostContext({
        theme: { appearance: "dark", variables: { "--background": "#000", "--foreground": "#fff" } },
        displayMode,
        maxHeight: 2_000,
        locale: "en",
        platform: "desktop",
        tool: { name: "forecast", callId: "call-1" },
      }),
    capabilities: { serverTools: true, serverResources: true },
    csp: EMPTY_MCP_APP_CSP,
    permissions: {},
    toolInput: { city: "Seoul" },
    toolResult: { content: [{ type: "text", text: "Sunny" }] },
    appTools: [
      { name: "refresh", readOnlyHint: true, visibility: ["app"] },
      { name: "save", readOnlyHint: false, visibility: ["model", "app"] },
      { name: "model_only", readOnlyHint: true, visibility: ["model"] },
    ],
    post: (message) => posted.push(message as Posted),
    ...overrides,
    handlers,
  });
  const request = (id: number, method: string, params: unknown = {}) =>
    session.receive({ jsonrpc: "2.0", id, method, params });
  const notify = (method: string, params: unknown = {}) =>
    session.receive({ jsonrpc: "2.0", method, params });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const response = (id: number) => posted.find((message) => message.id === id);
  const handshake = async () => {
    request(1, "ui/initialize", { appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] } });
    await flush();
    notify("ui/notifications/initialized");
  };
  return { session, posted, calls, request, notify, flush, response, handshake };
}

describe("MCP App host protocol", () => {
  test("initialize answers with capabilities and context, then tool data follows initialized", async () => {
    const { posted, request, notify, flush, response } = setup();
    request(1, "ui/initialize", { appInfo: { name: "weather" }, appCapabilities: {} });
    await flush();
    const result = response(1)?.result as Record<string, any>;
    expect(result.protocolVersion).toBe(MCP_APP_PROTOCOL_VERSION);
    expect(result.hostCapabilities).toMatchObject({ openLinks: {}, serverTools: {}, serverResources: {} });
    expect(result.hostContext).toMatchObject({
      theme: "dark",
      displayMode: "inline",
      platform: "desktop",
      locale: "en",
      toolInfo: { id: "call-1", tool: { name: "forecast" } },
    });
    expect(result.hostContext.styles.variables["--color-background-primary"]).toBe("#000");
    // Nothing of the host's own goes out before `initialized`.
    expect(posted.filter((message) => message.method)).toHaveLength(0);
    notify("ui/notifications/initialized");
    expect(posted.filter((message) => message.method).map((message) => message.method)).toEqual([
      "ui/notifications/tool-input",
      "ui/notifications/tool-result",
    ]);
    expect(posted.find((message) => message.method === "ui/notifications/tool-input")?.params).toEqual({
      arguments: { city: "Seoul" },
    });
  });

  test("requests before initialize are refused, and initialize only runs once", async () => {
    const { request, flush, response } = setup();
    request(1, "ui/message", { role: "user", content: { type: "text", text: "hi" } });
    request(2, "ping");
    await flush();
    expect(response(1)?.error?.code).toBe(MCP_APP_ERROR.invalidRequest);
    expect(response(2)?.result).toEqual({});
    request(3, "ui/initialize");
    request(4, "ui/initialize");
    await flush();
    expect(response(3)?.result).toBeDefined();
    expect(response(4)?.error?.code).toBe(MCP_APP_ERROR.invalidRequest);
  });

  test("unknown methods get -32601 and unknown notifications are ignored", async () => {
    const { handshake, request, notify, flush, response, posted } = setup();
    await handshake();
    const before = posted.length;
    notify("ui/notifications/something-new");
    expect(posted.length).toBe(before);
    request(9, "sampling/createMessage");
    await flush();
    expect(response(9)?.error?.code).toBe(MCP_APP_ERROR.methodNotFound);
  });

  test("oversized messages are refused and malformed ones ignored", async () => {
    const { handshake, session, flush, response, calls } = setup();
    await handshake();
    session.receive({
      jsonrpc: "2.0",
      id: 5,
      method: "ui/update-model-context",
      params: { content: [{ type: "text", text: "x".repeat(MCP_APP_MAX_MESSAGE_CHARS) }] },
    });
    session.receive({ jsonrpc: "1.0", id: 6, method: "ping" });
    session.receive("ping");
    await flush();
    expect(response(5)?.error?.message).toBe("Message too large.");
    expect(response(6)).toBeUndefined();
    expect(calls.some((call) => call.startsWith("context:"))).toBe(false);
  });

  test(`at most ${MCP_APP_MAX_IN_FLIGHT_REQUESTS} requests wait at once`, async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { handshake, request, flush, posted } = setup({
      handlers: { readResource: async () => gate.then(() => ({ contents: [] })) },
    });
    await handshake();
    for (let id = 100; id < 100 + MCP_APP_MAX_IN_FLIGHT_REQUESTS + 2; id += 1) {
      request(id, "resources/read", { uri: "ui://weather/data" });
    }
    await flush();
    const refused = posted.filter((message) => message.error?.message === "Too many requests in flight.");
    expect(refused).toHaveLength(2);
    release();
    await flush();
    await flush();
    expect(posted.filter((message) => typeof message.id === "number" && message.id >= 100 && message.result)).toHaveLength(
      MCP_APP_MAX_IN_FLIGHT_REQUESTS,
    );
  });

  test("tools/call needs app visibility, and asks the user unless the tool is read-only", async () => {
    const { handshake, request, flush, response, calls } = setup();
    await handshake();
    request(10, "tools/call", { name: "refresh", arguments: { a: 1 } });
    request(11, "tools/call", { name: "save", arguments: {} });
    request(12, "tools/call", { name: "model_only" });
    request(13, "tools/call", { name: "not_listed" });
    request(14, "tools/call", { name: "refresh", arguments: [1] });
    await flush();
    expect(response(10)?.result).toEqual({ content: [{ type: "text", text: "done" }] });
    expect(calls).toContain('call:refresh:{"a":1}');
    expect(calls).not.toContain("confirm:refresh");
    expect(calls).toContain("confirm:save");
    expect(response(11)?.result).toBeDefined();
    expect(response(12)?.error?.code).toBe(MCP_APP_ERROR.refused);
    expect(response(13)?.error?.code).toBe(MCP_APP_ERROR.refused);
    expect(response(14)?.error?.code).toBe(MCP_APP_ERROR.invalidParams);
    expect(calls.some((call) => call.startsWith("call:model_only"))).toBe(false);
  });

  test("a declined confirmation never calls the tool", async () => {
    const { handshake, request, flush, response, calls } = setup({
      handlers: { confirmToolCall: async () => false },
    });
    await handshake();
    request(20, "tools/call", { name: "save", arguments: {} });
    await flush();
    expect(response(20)?.error?.message).toBe("Tool call denied by the user.");
    expect(calls.some((call) => call.startsWith("call:save"))).toBe(false);
  });

  test("a host without server access (Claude) refuses tools/call and resources/read and says so", async () => {
    const { request, notify, flush, response, calls } = setup({
      capabilities: { serverTools: false, serverResources: false },
    });
    request(1, "ui/initialize");
    await flush();
    const capabilities = (response(1)?.result as Record<string, any>).hostCapabilities;
    expect(capabilities.serverTools).toBeUndefined();
    expect(capabilities.serverResources).toBeUndefined();
    notify("ui/notifications/initialized");
    request(2, "tools/call", { name: "refresh" });
    request(3, "resources/read", { uri: "ui://weather/data" });
    await flush();
    expect(response(2)?.error?.code).toBe(MCP_APP_ERROR.refused);
    expect(response(3)?.error?.code).toBe(MCP_APP_ERROR.refused);
    expect(calls.some((call) => call.startsWith("call:"))).toBe(false);
  });

  test("messages, context, links, display mode, and size reach their handlers", async () => {
    const opened: string[] = [];
    const { handshake, request, notify, flush, response, calls, posted } = setup({
      handlers: {
        openLink: (url) => {
          opened.push(url);
          return true;
        },
      },
    });
    await handshake();
    request(30, "ui/message", { role: "user", content: [{ type: "text", text: "Book it" }] });
    request(31, "ui/message", { role: "assistant", content: { type: "text", text: "x" } });
    request(32, "ui/update-model-context", { structuredContent: { selected: "Tuesday" } });
    request(33, "ui/open-link", { url: "https://example.com/a" });
    request(34, "ui/open-link", { url: "javascript:alert(1)" });
    request(35, "ui/request-display-mode", { mode: "fullscreen" });
    request(36, "ui/request-display-mode", { mode: "pip" });
    notify("ui/notifications/size-changed", { width: 300, height: 480 });
    await flush();
    expect(calls).toContain("message:Book it");
    expect(response(31)?.error?.code).toBe(MCP_APP_ERROR.invalidParams);
    expect(calls).toContain('context:{"selected":"Tuesday"}');
    expect(opened).toEqual(["https://example.com/a"]);
    expect(response(34)?.error?.code).toBe(MCP_APP_ERROR.invalidParams);
    expect(response(35)?.result).toEqual({ mode: "fullscreen" });
    expect(response(36)?.result).toEqual({ mode: "fullscreen" });
    expect(posted.some((message) => message.method === "ui/notifications/host-context-changed")).toBe(true);
    expect(calls).toContain("size:480");
  });

  test("a view that does not list a display mode is never switched to it", async () => {
    const { request, notify, flush, response } = setup();
    request(1, "ui/initialize", { appCapabilities: { availableDisplayModes: ["inline"] } });
    await flush();
    notify("ui/notifications/initialized");
    request(2, "ui/request-display-mode", { mode: "fullscreen" });
    await flush();
    expect(response(2)?.result).toEqual({ mode: "inline" });
  });

  test("context updates over the cap are refused; a declined message is an error", async () => {
    const { handshake, request, flush, response } = setup({
      handlers: { sendMessage: async () => false },
    });
    await handshake();
    request(40, "ui/update-model-context", { content: [{ type: "text", text: "x".repeat(17_000) }] });
    request(41, "ui/message", { role: "user", content: { type: "text", text: "hello" } });
    await flush();
    expect(response(40)?.error?.message).toBe("Context update is too large.");
    expect(response(41)?.error?.message).toBe("Message sending denied.");
  });

  test("teardown asks the view and resolves on its answer or after a timeout", async () => {
    const { handshake, session, posted } = setup();
    await handshake();
    const done = session.teardown("closing", 1_000);
    const teardown = posted.find((message) => message.method === "ui/resource-teardown");
    expect(teardown?.params).toEqual({ reason: "closing" });
    session.receive({ jsonrpc: "2.0", id: teardown?.id, result: {} });
    await done;
    expect(session.phase).toBe("closed");
    const after = posted.length;
    session.receive({ jsonrpc: "2.0", id: 99, method: "ping" });
    expect(posted.length).toBe(after);

    const second = setup();
    await second.handshake();
    await second.session.teardown("closing", 5);
    expect(second.session.phase).toBe("closed");
  });
});

describe("host context and model context", () => {
  test("maps Stave tokens to the extension's variable names", () => {
    expect(
      buildMcpAppStyleVariables({
        appearance: "light",
        variables: { "--background": "white", "--muted-foreground": "gray", "--radius": "8px", "--evil": "x" },
      }),
    ).toEqual({
      "--color-background-primary": "white",
      "--color-text-inverse": "white",
      "--color-text-secondary": "gray",
      "--color-text-tertiary": "gray",
      "--color-text-disabled": "gray",
      "--border-radius-md": "8px",
    });
  });

  test("each view keeps only its latest context, taken once by the next turn as untrusted data", () => {
    resetMcpAppModelContextForTests();
    setMcpAppModelContext({ taskId: "t", viewId: "v1", server: "weather", tool: "forecast", text: "first" });
    setMcpAppModelContext({ taskId: "t", viewId: "v1", server: "weather", tool: "forecast", text: "second" });
    setMcpAppModelContext({ taskId: "t", viewId: "v2", server: "weather", tool: "map", text: "map state" });
    setMcpAppModelContext({ taskId: "t", viewId: "v2", server: "weather", tool: "map", text: "" });
    const parts = takeMcpAppModelContextParts("t");
    expect(parts).toHaveLength(1);
    expect(parts[0]?.content).toContain("Untrusted data");
    expect(parts[0]?.content).toContain("second");
    expect(parts[0]?.content).not.toContain("first");
    expect(takeMcpAppModelContextParts("t")).toEqual([]);
  });
});

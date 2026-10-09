import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MCP_APP_EXTENSION_ID, MCP_APP_MIME_TYPE } from "@/lib/mcp-app/mcp-app-view";

const actualChildProcess = await import("node:child_process");

type Message = { id?: number; method?: string; params?: Record<string, unknown> };

const VIEW_HTML = "<!doctype html><p>forecast view</p>";

class FakeStream extends EventEmitter {
  setEncoding(_encoding: string) {}
}

/** A Codex App Server that runs one turn with one MCP call whose tool declares a view. */
class FakeAppServer extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  killed = false;
  pid = 4242;
  received: Message[] = [];

  stdin = {
    write: (payload: string) => {
      for (const line of payload.split("\n").filter((entry) => entry.trim())) {
        const message = JSON.parse(line) as Message;
        this.received.push(message);
        if (message.id == null || !message.method) continue;
        this.answer(message);
      }
      return true;
    },
  };

  kill() {
    this.killed = true;
    return true;
  }

  private answer(message: Message) {
    const id = message.id!;
    switch (message.method) {
      case "account/read":
        return this.respond(id, { account: { type: "chatgpt" }, requiresOpenaiAuth: true });
      case "config/read":
        return this.respond(id, { config: {}, origins: {}, layers: [] });
      case "thread/start":
      case "thread/resume":
        return this.respond(id, { thread: { id: "thread-1" } });
      case "model/list":
        return this.respond(id, { data: [], nextCursor: null });
      case "mcpServerStatus/list":
        return this.respond(id, {
          data: [
            {
              name: "weather",
              tools: {
                forecast: { name: "forecast", inputSchema: {}, _meta: { ui: { resourceUri: "ui://weather/forecast" } } },
                refresh: {
                  name: "refresh",
                  inputSchema: {},
                  annotations: { readOnlyHint: true },
                  _meta: { ui: { visibility: ["app"] } },
                },
              },
            },
          ],
        });
      case "mcpServer/resource/read":
        return this.respond(id, {
          contents: [
            {
              uri: "ui://weather/forecast",
              mimeType: MCP_APP_MIME_TYPE,
              text: VIEW_HTML,
              _meta: { ui: { csp: { connectDomains: ["https://api.weather.example"] } } },
            },
          ],
        });
      case "mcpServer/tool/call":
        return this.respond(id, { content: [{ type: "text", text: "refreshed" }], isError: false });
      case "turn/start":
        this.respond(id, { turn: { id: "turn-1" } });
        queueMicrotask(() => this.runTurn());
        return;
      default:
        return this.respond(id, {});
    }
  }

  private runTurn() {
    const envelope = { threadId: "thread-1", turnId: "turn-1" };
    const item = {
      id: "mcp-call-1",
      type: "mcpToolCall",
      server: "weather",
      tool: "forecast",
      arguments: { city: "Seoul" },
      status: "inProgress",
      mcpAppUi: { resourceUri: "ui://weather/forecast", preferredModelDisplayMode: "inline" },
      mcpAppResourceUri: "ui://weather/forecast",
    };
    this.emitJson({ jsonrpc: "2.0", method: "item/started", params: { ...envelope, item } });
    this.emitJson({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        ...envelope,
        item: {
          ...item,
          status: "completed",
          result: { content: [{ type: "text", text: "Sunny" }], structuredContent: { temp: 21 } },
        },
      },
    });
    this.emitJson({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { ...envelope, turn: { id: "turn-1", status: "completed" } },
    });
  }

  private respond(id: number, result: unknown) {
    this.emitJson({ jsonrpc: "2.0", id, result });
  }

  private emitJson(message: unknown) {
    this.stdout.emit("data", `${JSON.stringify(message)}\n`);
  }
}

const servers: FakeAppServer[] = [];
let userData = "";
const previousUserData = process.env.STAVE_USER_DATA_PATH;

mock.module("../electron/main/browser/secret-service", () => ({
  resolveBoundSecretEnv: async () => ({}),
}));
mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: () => {
    const server = new FakeAppServer();
    servers.push(server);
    return server;
  },
}));

beforeAll(async () => {
  userData = await mkdtemp(path.join(tmpdir(), "stave-codex-mcp-app-"));
  process.env.STAVE_USER_DATA_PATH = userData;
});

afterAll(async () => {
  if (previousUserData === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = previousUserData;
  await rm(userData, { recursive: true, force: true });
});

afterEach(() => {
  servers.length = 0;
});

async function runTurn(mcpAppViews: boolean, executable: string) {
  const runtime = await import(
    `../electron/providers/codex-app-server-runtime?mcp-app=${Date.now()}-${Math.random()}`
  );
  try {
    const events = await runtime.streamCodexWithAppServer({
      providerId: "codex",
      taskId: `task-${executable}`,
      workspaceId: "ws-1",
      prompt: "Show the forecast",
      cwd: process.cwd(),
      runtimeOptions: { codexBinaryPath: executable, mcpAppViews },
    });
    return { runtime, events: (events ?? []) as Array<Record<string, any>> };
  } finally {
    // Keep the runtime for the caller's proxy check; it disposes clients itself.
  }
}

function initializeParams(server: FakeAppServer) {
  return server.received.find((message) => message.method === "initialize")?.params as
    | { capabilities?: Record<string, unknown> }
    | undefined;
}

describe("Codex MCP App views", () => {
  test("disabled: initialize declares no extension and the call stays a plain row", async () => {
    const { runtime, events } = await runTurn(false, "/tmp/fake-codex-mcp-app-off");
    try {
      const capabilities = initializeParams(servers[0]!)?.capabilities ?? {};
      expect(capabilities.experimentalApi).toBe(true);
      expect(capabilities.extensions).toBeUndefined();
      expect(servers[0]!.received.some((message) => message.method === "mcpServer/resource/read")).toBe(false);
      const results = events.filter((event) => event.type === "tool_result");
      expect(results).toHaveLength(1);
      expect(results[0]?.mcpAppView).toBeUndefined();
    } finally {
      runtime.disposeAllCodexAppServerClients();
    }
  });

  test("enabled: declares the extension, captures the view before done, and proxies view tool calls", async () => {
    const { runtime, events } = await runTurn(true, "/tmp/fake-codex-mcp-app-on");
    try {
      const server = servers.at(-1)!;
      expect(initializeParams(server)?.capabilities?.extensions).toEqual({
        [MCP_APP_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] },
      });
      expect(server.received.find((message) => message.method === "mcpServer/resource/read")?.params).toEqual({
        threadId: "thread-1",
        server: "weather",
        uri: "ui://weather/forecast",
      });

      const results = events.filter((event) => event.type === "tool_result");
      expect(results).toHaveLength(2);
      const withView = results[1]!;
      expect(withView).toMatchObject({
        tool_use_id: "mcp-call-1",
        mcpAppView: { version: 1, provider: "codex", server: "weather", tool: "forecast", resourceUri: "ui://weather/forecast" },
      });
      expect(withView.output).toBe(results[0]!.output);
      // The view lands before the turn's done.
      const doneIndex = events.findIndex((event) => event.type === "done");
      expect(events.indexOf(withView)).toBeLessThan(doneIndex);

      const { getMcpAppViewStore } = await import("../electron/main/mcp-app/mcp-app-view-store");
      const stored = await getMcpAppViewStore().read(withView.mcpAppView.viewId);
      expect(stored?.html).toBe(VIEW_HTML);
      expect(stored?.record).toMatchObject({
        threadId: "thread-1",
        toolInput: { city: "Seoul" },
        toolResult: { content: [{ type: "text", text: "Sunny" }], structuredContent: { temp: 21 } },
        csp: { connectDomains: ["https://api.weather.example"] },
      });
      expect(stored?.record.appTools).toEqual([
        { name: "forecast", readOnlyHint: false, visibility: ["model", "app"] },
        { name: "refresh", readOnlyHint: true, visibility: ["app"] },
      ]);

      const { handleMcpAppViewRequest } = await import("../electron/providers/mcp-app-view-requests");
      const response = await handleMcpAppViewRequest(
        { viewId: withView.mcpAppView.viewId, method: "tools/call", params: { name: "refresh", arguments: {} } },
        {
          getCodexClient: (record) =>
            runtime.getCodexAppServerClientFromRuntimeOptions({
              runtimeOptions: { codexBinaryPath: record.executablePath ?? undefined },
            }),
        },
      );
      expect(response).toEqual({ ok: true, result: { content: [{ type: "text", text: "refreshed" }], isError: false } });
      expect(servers.flatMap((entry) => entry.received).find((message) => message.method === "mcpServer/tool/call")?.params).toEqual({
        threadId: "thread-1",
        server: "weather",
        tool: "refresh",
        arguments: {},
      });
    } finally {
      runtime.disposeAllCodexAppServerClients();
    }
  });
});

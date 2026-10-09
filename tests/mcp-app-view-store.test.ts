import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createMcpAppViewStore,
  type McpAppViewPublishInput,
  type McpAppViewStore,
} from "../electron/main/mcp-app/mcp-app-view-store";
import { respondToMcpAppViewRequest } from "../electron/main/mcp-app/mcp-app-view-protocol";
import { handleMcpAppViewRequest } from "../electron/providers/mcp-app-view-requests";
import { captureMcpAppView } from "../electron/providers/mcp-app-view-capture";
import { normalizeMcpAppCsp } from "@/lib/mcp-app/mcp-app-csp";
import { buildMcpAppViewUrl, MCP_APP_MIME_TYPE } from "@/lib/mcp-app/mcp-app-view";
import { buildInlineRenderUrl } from "@/lib/inline-render/inline-render";

let root: string;
let store: McpAppViewStore;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "stave-mcp-app-"));
  store = createMcpAppViewStore({ rootDir: () => root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function input(overrides: Partial<McpAppViewPublishInput> = {}): McpAppViewPublishInput {
  return {
    workspaceId: "ws-1",
    provider: "codex",
    server: "weather",
    tool: "forecast",
    resourceUri: "ui://weather/forecast",
    toolUseId: "call-1",
    taskId: "task-1",
    threadId: "thread-1",
    executablePath: "/tmp/codex",
    accountProfileId: null,
    csp: normalizeMcpAppCsp({ connectDomains: ["https://api.example.com"] }),
    permissions: {},
    prefersBorder: null,
    appTools: [
      { name: "refresh", readOnlyHint: true, visibility: ["app"] },
      { name: "hidden", readOnlyHint: true, visibility: ["model"] },
    ],
    toolInput: { city: "Seoul" },
    toolResult: { content: [{ type: "text", text: "Sunny" }] },
    html: "<p>view</p>",
    ...overrides,
  };
}

describe("MCP App view store and scheme", () => {
  test("stores the view as returned and serves it under its declared CSP", async () => {
    const reference = await store.publish(input());
    expect(reference).toMatchObject({ version: 1, provider: "codex", server: "weather", tool: "forecast" });
    const view = await store.read(reference.viewId);
    expect(view?.html).toBe("<p>view</p>");
    expect(view?.record.appTools).toHaveLength(2);

    const response = await respondToMcpAppViewRequest({
      url: buildMcpAppViewUrl(reference.viewId),
      method: "GET",
      store,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html><p>view</p>");
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("sandbox allow-scripts allow-forms");
    expect(csp).toContain("connect-src https://api.example.com");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("'self'");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("refuses other methods, unknown ids, and inline render urls", async () => {
    const reference = await store.publish(input());
    const url = buildMcpAppViewUrl(reference.viewId);
    expect((await respondToMcpAppViewRequest({ url, method: "POST", store })).status).toBe(405);
    expect(
      (
        await respondToMcpAppViewRequest({
          url: buildInlineRenderUrl({ renderId: reference.viewId, networkPolicy: "open" }),
          method: "GET",
          store,
        })
      ).status,
    ).toBe(404);
  });

  test("a tampered record cannot widen the CSP", async () => {
    const reference = await store.publish(input());
    const [workspaceKey, ...rest] = reference.viewId.split("-");
    const recordPath = path.join(root, workspaceKey!, `${rest.join("-")}.json`);
    const record = JSON.parse(await Bun.file(recordPath).text());
    record.csp = { connectDomains: ["*", "'unsafe-eval'"], resourceDomains: ["https://ok.example.com"] };
    await writeFile(recordPath, JSON.stringify(record));
    const response = await respondToMcpAppViewRequest({
      url: buildMcpAppViewUrl(reference.viewId),
      method: "GET",
      store,
    });
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("https://ok.example.com");
  });

  test("removing a workspace removes its views", async () => {
    const reference = await store.publish(input());
    await store.removeWorkspace("ws-1");
    expect(await store.read(reference.viewId)).toBeNull();
  });
});

describe("view capture", () => {
  test("captures the view, its declared CSP, and the call's data", async () => {
    const reference = await captureMcpAppView({
      provider: "codex",
      server: "weather",
      tool: "forecast",
      toolUseId: "call-1",
      resourceUri: "ui://weather/forecast",
      workspaceId: "ws-1",
      taskId: "task-1",
      threadId: "thread-1",
      toolInput: { city: "Seoul" },
      toolResult: { content: [{ type: "text", text: "Sunny" }], structuredContent: { temp: 21 } },
      readResource: async () => ({
        contents: [
          {
            uri: "ui://weather/forecast",
            mimeType: MCP_APP_MIME_TYPE,
            text: "<p>forecast</p>",
            _meta: { ui: { csp: { resourceDomains: ["https://cdn.example.com", "*"] } } },
          },
        ],
      }),
      listAppTools: async () => [{ name: "refresh", readOnlyHint: true, visibility: ["app"] }],
      store,
    });
    expect(reference).not.toBeNull();
    const view = await store.read(reference!.viewId);
    expect(view?.html).toBe("<p>forecast</p>");
    expect(view?.record.csp.resourceDomains).toEqual(["https://cdn.example.com"]);
    expect(view?.record.toolResult).toEqual({
      content: [{ type: "text", text: "Sunny" }],
      structuredContent: { temp: 21 },
    });
  });

  test("leaves the row plain when the resource is wrong or too slow", async () => {
    const base = {
      provider: "codex" as const,
      server: "weather",
      tool: "forecast",
      toolUseId: "call-1",
      resourceUri: "ui://weather/forecast",
      workspaceId: "ws-1",
      taskId: "task-1",
      toolInput: {},
      toolResult: null,
      listAppTools: async () => [],
      store,
    };
    expect(
      await captureMcpAppView({
        ...base,
        readResource: async () => ({ contents: [{ uri: "ui://weather/forecast", mimeType: "text/html", text: "<p></p>" }] }),
      }),
    ).toBeNull();
    expect(
      await captureMcpAppView({
        ...base,
        timeoutMs: 10,
        readResource: () => new Promise(() => {}),
      }),
    ).toBeNull();
  });
});

describe("view requests", () => {
  test("Codex requests go to the record's own server and thread, gated on visibility", async () => {
    const reference = await store.publish(input());
    const requests: Array<{ method: string; params: unknown }> = [];
    const client = {
      request: async (method: string, params: unknown) => {
        requests.push({ method, params });
        return method === "mcpServer/tool/call"
          ? { content: [{ type: "text", text: "refreshed" }], isError: false }
          : { contents: [{ uri: "ui://weather/data", text: "{}" }] };
      },
    };
    const deps = { store, getCodexClient: () => client };
    expect(
      await handleMcpAppViewRequest(
        { viewId: reference.viewId, method: "tools/call", params: { name: "refresh", arguments: { a: 1 } } },
        deps,
      ),
    ).toEqual({ ok: true, result: { content: [{ type: "text", text: "refreshed" }], isError: false } });
    expect(requests[0]).toEqual({
      method: "mcpServer/tool/call",
      params: { threadId: "thread-1", server: "weather", tool: "refresh", arguments: { a: 1 } },
    });
    expect(
      await handleMcpAppViewRequest(
        { viewId: reference.viewId, method: "tools/call", params: { name: "hidden" } },
        deps,
      ),
    ).toEqual({ ok: false, error: "Tool hidden is not available to apps." });
    expect(
      await handleMcpAppViewRequest(
        { viewId: reference.viewId, method: "resources/read", params: { uri: "ui://weather/data" } },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(requests.at(-1)).toEqual({
      method: "mcpServer/resource/read",
      params: { threadId: "thread-1", server: "weather", uri: "ui://weather/data" },
    });
    expect(requests).toHaveLength(2);
  });

  test("Claude views and unknown views are refused without reaching any client", async () => {
    const reference = await store.publish(input({ provider: "claude-code", threadId: null }));
    let reached = false;
    const deps = {
      store,
      getCodexClient: () => {
        reached = true;
        return { request: async () => ({}) };
      },
    };
    expect(
      await handleMcpAppViewRequest(
        { viewId: reference.viewId, method: "tools/call", params: { name: "refresh" } },
        deps,
      ),
    ).toEqual({ ok: false, error: "This provider cannot run requests for MCP App views." });
    expect(
      await handleMcpAppViewRequest(
        { viewId: "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100", method: "tools/call", params: { name: "refresh" } },
        deps,
      ),
    ).toEqual({ ok: false, error: "This view is no longer available." });
    expect(reached).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  buildClaudeMcpToolName,
  buildMcpAppViewUrl,
  isMcpAppViewUrl,
  MCP_APP_MIME_TYPE,
  normalizeMcpAppToolInput,
  normalizeMcpAppToolResult,
  parseMcpAppViewUrl,
  readMcpAppResourceUiMeta,
  readMcpAppToolDescriptors,
  readMcpAppToolUiMeta,
  readMcpAppViewFromToolPart,
  readMcpAppViewReference,
  selectMcpAppHtmlContent,
  type McpAppViewReference,
} from "@/lib/mcp-app/mcp-app-view";
import { McpAppViewReferenceSchema } from "@/lib/mcp-app/mcp-app-schemas";
import { mergeToolResultIntoPart } from "@/store/provider-message.utils";

const VIEW_ID = "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100";

const reference = (overrides: Partial<McpAppViewReference> = {}): McpAppViewReference => ({
  version: 1,
  viewId: VIEW_ID,
  provider: "codex",
  server: "weather",
  tool: "forecast",
  resourceUri: "ui://weather/forecast",
  ...overrides,
});

describe("tool metadata", () => {
  test("reads the view from `_meta.ui.resourceUri`", () => {
    expect(
      readMcpAppToolUiMeta({ ui: { resourceUri: "ui://weather/forecast", visibility: ["app"] } }),
    ).toEqual({ resourceUri: "ui://weather/forecast", visibility: ["app"] });
  });

  test("reads the deprecated flat `ui/resourceUri` key", () => {
    expect(readMcpAppToolUiMeta({ "ui/resourceUri": "ui://weather/forecast" })).toEqual({
      resourceUri: "ui://weather/forecast",
      visibility: ["model", "app"],
    });
  });

  test("prefers the nested key and defaults visibility to both", () => {
    expect(
      readMcpAppToolUiMeta({
        ui: { resourceUri: "ui://nested/view" },
        "ui/resourceUri": "ui://flat/view",
      }),
    ).toEqual({ resourceUri: "ui://nested/view", visibility: ["model", "app"] });
  });

  test("ignores anything that is not a ui:// resource", () => {
    expect(readMcpAppToolUiMeta(undefined)).toBeNull();
    expect(readMcpAppToolUiMeta({ ui: { resourceUri: "https://example.com/view" } })).toBeNull();
    expect(readMcpAppToolUiMeta({ ui: { resourceUri: "ui://" } })).toBeNull();
    expect(readMcpAppToolUiMeta({ ui: { resourceUri: "ui://a b" } })).toBeNull();
  });

  test("describes tools with their read-only hint from either annotation form", () => {
    expect(
      readMcpAppToolDescriptors({
        refresh: { name: "refresh", annotations: { readOnlyHint: true }, _meta: { ui: { visibility: ["app"] } } },
        save: { name: "save", title: "Save forecast" },
        claude: { name: "claude_style", annotations: { readOnly: true } },
        bogus: { title: "no name" },
      }),
    ).toEqual([
      { name: "refresh", readOnlyHint: true, visibility: ["app"] },
      { name: "save", title: "Save forecast", readOnlyHint: false, visibility: ["model", "app"] },
      { name: "claude_style", readOnlyHint: true, visibility: ["model", "app"] },
    ]);
  });
});

describe("resource content", () => {
  test("selects the HTML for the requested uri with the extension's mime type", () => {
    const selection = selectMcpAppHtmlContent(
      [
        { uri: "ui://other", mimeType: MCP_APP_MIME_TYPE, text: "<p>other</p>" },
        {
          uri: "ui://weather/forecast",
          mimeType: "text/html; profile=mcp-app",
          text: "<p>view</p>",
          _meta: { ui: { csp: { connectDomains: ["https://api.example.com"] }, permissions: { camera: {} }, prefersBorder: false } },
        },
      ],
      "ui://weather/forecast",
    );
    expect(selection).toEqual({
      ok: true,
      html: "<p>view</p>",
      meta: {
        csp: {
          connectDomains: ["https://api.example.com"],
          resourceDomains: undefined,
          frameDomains: undefined,
          baseUriDomains: undefined,
        },
        permissions: { camera: true },
        prefersBorder: false,
      },
    });
  });

  test("decodes a base64 blob", () => {
    const blob = Buffer.from("<p>héllo</p>", "utf8").toString("base64");
    const selection = selectMcpAppHtmlContent(
      [{ uri: "ui://v", mimeType: MCP_APP_MIME_TYPE, blob }],
      "ui://v",
    );
    expect(selection.ok && selection.html).toBe("<p>héllo</p>");
  });

  test("refuses plain HTML, missing content, and oversized views", () => {
    expect(
      selectMcpAppHtmlContent([{ uri: "ui://v", mimeType: "text/html", text: "<p></p>" }], "ui://v"),
    ).toEqual({ ok: false, reason: "mime" });
    expect(selectMcpAppHtmlContent([], "ui://v")).toEqual({ ok: false, reason: "missing" });
    expect(
      selectMcpAppHtmlContent(
        [{ uri: "ui://v", mimeType: MCP_APP_MIME_TYPE, text: "x".repeat(101) }],
        "ui://v",
        100,
      ),
    ).toEqual({ ok: false, reason: "too-large" });
    expect(
      selectMcpAppHtmlContent(
        [{ uri: "ui://v", mimeType: MCP_APP_MIME_TYPE, blob: "x".repeat(1_000) }],
        "ui://v",
        100,
      ),
    ).toEqual({ ok: false, reason: "too-large" });
  });

  test("reads only declared permission objects", () => {
    expect(
      readMcpAppResourceUiMeta({ ui: { permissions: { camera: {}, microphone: true, clipboardWrite: {} } } })
        .permissions,
    ).toEqual({ camera: true, clipboardWrite: true });
  });
});

describe("tool part reference", () => {
  test("a reference must name the part's own server and tool", () => {
    expect(
      readMcpAppViewFromToolPart({ toolName: "weather:forecast", mcpAppView: reference() }),
    ).toEqual(reference());
    // Another server's view on this row is a spoof and shows nothing.
    expect(
      readMcpAppViewFromToolPart({
        toolName: "weather:forecast",
        mcpAppView: reference({ server: "bank", tool: "transfer" }),
      }),
    ).toBeNull();
    expect(
      readMcpAppViewFromToolPart({
        toolName: "mcp__stave-local-mcp__stave_render_html",
        mcpAppView: reference(),
      }),
    ).toBeNull();
  });

  test("matches Claude's normalised tool names", () => {
    const claude = reference({ provider: "claude-code", server: "my server.io", tool: "show" });
    expect(buildClaudeMcpToolName("my server.io", "show")).toBe("mcp__my_server_io__show");
    expect(
      readMcpAppViewFromToolPart({ toolName: "mcp__my_server_io__show", mcpAppView: claude }),
    ).toEqual(claude);
  });

  test("rejects malformed references", () => {
    expect(readMcpAppViewReference({ ...reference(), viewId: "../../etc" })).toBeNull();
    expect(readMcpAppViewReference({ ...reference(), provider: "cursor" })).toBeNull();
    expect(readMcpAppViewReference({ ...reference(), resourceUri: "https://x" })).toBeNull();
    expect(McpAppViewReferenceSchema.parse({ bogus: true })).toBeUndefined();
    expect(McpAppViewReferenceSchema.parse(reference())).toEqual(reference());
  });

  test("a follow-up result attaches the view to its part and later results keep it", () => {
    const part = {
      type: "tool_use" as const,
      toolUseId: "call-1",
      toolName: "weather:forecast",
      input: "{}",
      state: "output-available" as const,
      output: "Sunny",
    };
    const withView = mergeToolResultIntoPart({
      part,
      event: { tool_use_id: "call-1", output: "Sunny", mcpAppView: reference() },
    });
    expect(withView).toMatchObject({ mcpAppView: reference(), output: "Sunny" });
    const replayed = mergeToolResultIntoPart({
      part: withView,
      event: { tool_use_id: "call-1", output: "Sunny" },
    });
    expect(replayed).toMatchObject({ mcpAppView: reference() });
  });
});

describe("urls and payloads", () => {
  test("view urls round-trip and never parse as other paths", () => {
    const url = buildMcpAppViewUrl(VIEW_ID);
    expect(url).toBe(`stave-render://frame/mcp-app/${VIEW_ID}`);
    expect(parseMcpAppViewUrl(url)).toEqual({ viewId: VIEW_ID });
    expect(isMcpAppViewUrl(url)).toBe(true);
    expect(parseMcpAppViewUrl(`stave-render://frame/${VIEW_ID}`)).toBeNull();
    expect(parseMcpAppViewUrl(`stave-render://frame/mcp-app/../${VIEW_ID}`)).toBeNull();
    expect(parseMcpAppViewUrl(`https://frame/mcp-app/${VIEW_ID}`)).toBeNull();
  });

  test("tool input and result take the shapes the view notifications need", () => {
    expect(normalizeMcpAppToolInput('{"city":"Seoul"}')).toEqual({ city: "Seoul" });
    expect(normalizeMcpAppToolInput("[1]")).toBeNull();
    expect(
      normalizeMcpAppToolResult({ content: [], structuredContent: { t: 1 }, isError: false, extra: 1 }),
    ).toEqual({ content: [], structuredContent: { t: 1 }, isError: false });
    expect(normalizeMcpAppToolResult({ structuredContent: {} })).toBeNull();
  });
});

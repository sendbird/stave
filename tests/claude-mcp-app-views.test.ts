import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  createClaudeMcpAppViewCapture,
  readClaudeMcpStructuredContent,
} from "../electron/providers/claude-mcp-app-views";
import type { BridgeEvent } from "../electron/providers/types";
import { getMcpAppViewStore } from "../electron/main/mcp-app/mcp-app-view-store";
import { MCP_APP_MIME_TYPE } from "@/lib/mcp-app/mcp-app-view";

let userData = "";
const previousUserData = process.env.STAVE_USER_DATA_PATH;

beforeAll(async () => {
  userData = await mkdtemp(path.join(tmpdir(), "stave-claude-mcp-app-"));
  process.env.STAVE_USER_DATA_PATH = userData;
});

afterAll(async () => {
  if (previousUserData === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = previousUserData;
  await rm(userData, { recursive: true, force: true });
});

const init = (capabilities: string[]) =>
  ({ type: "system", subtype: "init", capabilities }) as unknown as SDKMessage;
const other = { type: "user" } as unknown as SDKMessage;

function fakeQuery() {
  const reads: Array<[string, string]> = [];
  return {
    reads,
    query: {
      mcpServerStatus: async () => [
        {
          name: "weather app",
          status: "connected" as const,
          tools: [
            { name: "forecast", _meta: { ui: { resourceUri: "ui://weather/forecast" } } },
            { name: "plain" },
          ],
        },
      ],
      readMcpResource: async (server: string, uri: string) => {
        reads.push([server, uri]);
        return { contents: [{ uri, mimeType: MCP_APP_MIME_TYPE, text: "<p>view</p>" }] };
      },
    },
  };
}

function run(capabilities: string[], events: BridgeEvent[], message: SDKMessage = other) {
  const emitted: BridgeEvent[] = [];
  const fake = fakeQuery();
  const capture = createClaudeMcpAppViewCapture({
    enabled: true,
    workspaceId: "ws-1",
    taskId: "task-1",
    getQuery: () => fake.query as never,
    emit: (event) => emitted.push(event),
  });
  capture.observe(init(capabilities), []);
  capture.observe(message, events);
  return { capture, emitted, reads: fake.reads };
}

const call = (toolName: string, output = "Sunny"): BridgeEvent[] => [
  { type: "tool", toolUseId: "toolu_1", toolName, input: '{"city":"Seoul"}', state: "input-available" },
  { type: "tool_result", tool_use_id: "toolu_1", output },
];

async function storedToolResult(event: BridgeEvent | undefined) {
  const viewId = (event as { mcpAppView?: { viewId: string } } | undefined)?.mcpAppView?.viewId;
  if (!viewId) throw new Error("no view captured");
  return (await getMcpAppViewStore().read(viewId))?.record.toolResult;
}

describe("Claude MCP App view capture", () => {
  test("captures a declared view through the live query", async () => {
    const { capture, emitted, reads } = run(
      ["mcp_tool_ui_meta_v1", "mcp_read_resource_v1"],
      call("mcp__weather_app__forecast"),
    );
    await capture.settle();
    expect(reads).toEqual([["weather app", "ui://weather/forecast"]]);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_1",
      output: "Sunny",
      mcpAppView: { provider: "claude-code", server: "weather app", tool: "forecast" },
    });
    // Plain text stays text only.
    expect(await storedToolResult(emitted[0])).toEqual({ content: [{ type: "text", text: "Sunny" }] });
  });

  test("offers a JSON object output to the view as structuredContent", async () => {
    const output = '{"issues":{"nodes":[{"key":"DFE-1"}]}}';
    const { capture, emitted } = run(
      ["mcp_tool_ui_meta_v1", "mcp_read_resource_v1"],
      call("mcp__weather_app__forecast", output),
    );
    await capture.settle();
    expect(await storedToolResult(emitted[0])).toEqual({
      content: [{ type: "text", text: output }],
      structuredContent: { issues: { nodes: [{ key: "DFE-1" }] } },
    });
  });

  test("hands the view the server's structuredContent the SDK message carries", async () => {
    // The shape a live SDK 0.3.312 turn reported: the text the model read,
    // here a large-result notice, next to the server's structuredContent.
    const notice = "Error: result (309,412 characters) exceeds maximum allowed tokens.";
    const message = {
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: notice }] },
      parent_tool_use_id: null,
      tool_use_result: { content: notice, structuredContent: { issues: { nodes: [{ key: "DFE-9" }] } } },
    } as unknown as SDKMessage;
    const { capture, emitted } = run(
      ["mcp_tool_ui_meta_v1", "mcp_read_resource_v1"],
      call("mcp__weather_app__forecast", notice),
      message,
    );
    await capture.settle();
    expect(await storedToolResult(emitted[0])).toEqual({
      content: [{ type: "text", text: notice }],
      structuredContent: { issues: { nodes: [{ key: "DFE-9" }] } },
    });
  });

  test("reads structuredContent only from a user message with exactly one tool result", () => {
    const message = (content: unknown[], toolUseResult: unknown) =>
      ({ type: "user", message: { role: "user", content }, tool_use_result: toolUseResult }) as unknown as SDKMessage;
    const one = [{ type: "tool_result", tool_use_id: "toolu_1" }];
    expect(readClaudeMcpStructuredContent(message(one, { structuredContent: { a: 1 } }))).toEqual({
      toolUseId: "toolu_1",
      structuredContent: { a: 1 },
    });
    expect(readClaudeMcpStructuredContent(message(one, "text"))).toBeNull();
    expect(readClaudeMcpStructuredContent(message(one, { structuredContent: [1] }))).toBeNull();
    expect(
      readClaudeMcpStructuredContent(
        message([...one, { type: "tool_result", tool_use_id: "toolu_2" }], { structuredContent: { a: 1 } }),
      ),
    ).toBeNull();
    expect(readClaudeMcpStructuredContent(other)).toBeNull();
  });

  test("does nothing without both CLI capabilities, for tools without a view, or for errors", async () => {
    const missing = run(["mcp_tool_ui_meta_v1"], call("mcp__weather_app__forecast"));
    await missing.capture.settle();
    expect(missing.reads).toEqual([]);

    const plain = run(["mcp_tool_ui_meta_v1", "mcp_read_resource_v1"], call("mcp__weather_app__plain"));
    await plain.capture.settle();
    expect(plain.reads).toEqual([]);
    expect(plain.emitted).toEqual([]);

    const failed = run(["mcp_tool_ui_meta_v1", "mcp_read_resource_v1"], [
      { type: "tool", toolUseId: "toolu_1", toolName: "mcp__weather_app__forecast", input: "{}", state: "input-available" },
      { type: "tool_result", tool_use_id: "toolu_1", output: "boom", isError: true },
    ]);
    await failed.capture.settle();
    expect(failed.reads).toEqual([]);
  });
});

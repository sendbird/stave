import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createClaudeMcpAppViewCapture } from "../electron/providers/claude-mcp-app-views";
import type { BridgeEvent } from "../electron/providers/types";
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

function run(capabilities: string[], events: BridgeEvent[]) {
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
  capture.observe(other, events);
  return { capture, emitted, reads: fake.reads };
}

const call = (toolName: string): BridgeEvent[] => [
  { type: "tool", toolUseId: "toolu_1", toolName, input: '{"city":"Seoul"}', state: "input-available" },
  { type: "tool_result", tool_use_id: "toolu_1", output: "Sunny" },
];

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

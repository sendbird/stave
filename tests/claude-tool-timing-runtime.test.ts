import { afterAll, describe, expect, mock, test } from "bun:test";
import type { BridgeEvent } from "../electron/providers/types";

/**
 * The Claude runtime stamps each tool call's observed start and end on the
 * events it emits and returns, through a full `streamClaudeWithSdk` turn whose
 * SDK stream is a stand-in: a tool_use in one assistant message, its
 * tool_result in the next user message, then the result. The Codex runtime's
 * stamping is covered the same way in `codex-app-server-mcp-lifecycle.test.ts`.
 */

const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualStaveLocalMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init", session_id: "session-1", permissionMode: "default", tools: ["Read"], mcp_servers: [] };
      yield {
        type: "assistant",
        uuid: "assistant-1",
        session_id: "session-1",
        parent_tool_use_id: null,
        message: { content: [{ type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: "/tmp/a.ts" } }] },
      };
      // A real tool takes time; the end must not be the start.
      await new Promise((resolve) => setTimeout(resolve, 15));
      yield {
        type: "user",
        session_id: "session-1",
        parent_tool_use_id: null,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "export const a = 1;" }] },
      };
      yield { type: "result", subtype: "success", is_error: false, result: "Done.", stop_reason: "end_turn", session_id: "session-1",
        duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    close: () => {},
    mcpServerStatus: async () => [],
  }),
}));
mock.module("../electron/providers/cli-path-env", () => ({
  ...actualCliPathEnv,
  buildClaudeCliEnv: () => ({ PATH: "/tmp/bin" }),
}));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualStaveLocalMcpManifest,
  readStaveLocalMcpManifest: async () => null,
}));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");
afterAll(() => mock.restore());

describe("Claude runtime tool timing", () => {
  test("stamps the call's start on its tool event and its end on its result", async () => {
    const emitted: BridgeEvent[] = [];
    const before = Date.now();
    const returned = await streamClaudeWithSdk({
      providerId: "claude-code",
      cwd: process.cwd(),
      prompt: "Read a.ts",
      onEvent: (event) => { emitted.push(event); },
    });
    const after = Date.now();

    const tool = emitted.find((event) => event.type === "tool");
    const result = emitted.find((event) => event.type === "tool_result");
    // Read the stamps before any matcher touches the objects.
    const startedAt = tool?.type === "tool" ? tool.startedAt : undefined;
    const completedAt = result?.type === "tool_result" ? result.completedAt : undefined;
    expect(tool?.type === "tool" ? tool.toolUseId : null).toBe("toolu_read");
    expect(typeof startedAt).toBe("number");
    expect(typeof completedAt).toBe("number");
    expect(startedAt! >= before).toBe(true);
    expect(completedAt! > startedAt!).toBe(true);
    expect(completedAt! <= after).toBe(true);
    // The collected events the turn returns carry the same times.
    const returnedTool = returned.find((event) => event.type === "tool");
    const returnedResult = returned.find((event) => event.type === "tool_result");
    expect(returnedTool?.type === "tool" ? returnedTool.startedAt : null).toBe(startedAt!);
    expect(returnedResult?.type === "tool_result" ? returnedResult.completedAt : null).toBe(completedAt!);
  });
});

import { afterAll, describe, expect, mock, test } from "bun:test";

/**
 * The Claude runtime tells the host its provider accepted the turn's prompt
 * once the SDK input queue took it, which is when the host records the
 * subagent answers the prompt carries. A native slash command goes alone,
 * without the turn's context, so it never counts. The Codex side is covered in
 * `codex-auto-review-turn.test.ts`.
 */

const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualStaveLocalMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init", session_id: "session-1", permissionMode: "default", tools: [], mcp_servers: [] };
      yield { type: "result", subtype: "success", is_error: false, result: "Done.", stop_reason: "end_turn", session_id: "session-1",
        duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    close: () => {},
    mcpServerStatus: async () => [],
  }),
}));
mock.module("../electron/providers/cli-path-env", () => ({ ...actualCliPathEnv, buildClaudeCliEnv: () => ({ PATH: "/tmp/bin" }) }));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({ ...actualStaveLocalMcpManifest, readStaveLocalMcpManifest: async () => null }));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");
afterAll(() => mock.restore());

describe("Claude prompt acceptance", () => {
  for (const [label, prompt, expected] of [
    ["an ordinary prompt counts once the SDK took it", "Summarize the answers.", 1],
    ["a native slash command never counts", "/compact", 0],
  ] as const) {
    test(label, async () => {
      let accepted = 0;
      await streamClaudeWithSdk({
        providerId: "claude-code", cwd: process.cwd(), taskId: `task-${expected}`, prompt,
        conversation: {
          target: { providerId: "claude-code" }, mode: "chat", history: [],
          input: { role: "user", providerId: "user", content: prompt, parts: [{ type: "text", text: prompt }] },
          contextParts: [{ type: "retrieved_context", sourceId: "stave:delegated-tasks", title: "Subagent results", content: "ANSWER" }],
        } as never,
        onPromptAccepted: () => { accepted += 1; },
      });
      expect(accepted).toBe(expected);
    });
  }
});

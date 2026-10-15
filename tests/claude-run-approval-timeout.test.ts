import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { BridgeEvent } from "../electron/providers/types";

// Native provider callbacks are synchronous requests: when Claude's native
// Auto hands a call to Stave in an agent run and nobody answers, the request is
// denied after the decision timeout exactly as in any other turn.
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal; suggestions: unknown[]; toolUseID: string },
) => Promise<{ behavior: string; message?: string }>;

const decisions: Array<{ behavior: string; message?: string }> = [];
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualStaveLocalMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: { canUseTool: CanUseTool } }) => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init", session_id: "session-1", permissionMode: "auto", tools: [], mcp_servers: [] };
      decisions.push(await args.options.canUseTool("Bash", { command: "rm -rf build" }, {
        signal: new AbortController().signal, suggestions: [], toolUseID: "tool-1",
      }));
      yield { type: "result", subtype: "success", is_error: false, result: "", session_id: "session-1",
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

const originalTimeout = process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS;
beforeEach(() => { process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS = "25"; });
afterEach(() => {
  decisions.length = 0;
  if (originalTimeout === undefined) delete process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS;
  else process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS = originalTimeout;
});
afterAll(() => mock.restore());

for (const agentRunStage of [{ agentRunId: "run", stageId: "work", attempt: 1 }, undefined]) {
  test(`${agentRunStage ? "an agent run" : "an ordinary turn"}: an unanswered Claude approval is denied after the decision timeout`, async () => {
    const events: BridgeEvent[] = [];
    await streamClaudeWithSdk({
      providerId: "claude-code", cwd: process.cwd(), taskId: `task-${agentRunStage ? "run" : "chat"}`, prompt: "Work",
      runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: agentRunStage ? "auto" : "default" },
      ...(agentRunStage ? { agentRunStage } : {}),
      registerApprovalResponder: () => {},
      onEvent: (event) => { events.push(event); },
    });
    expect(events.filter((event) => event.type === "approval")).toHaveLength(1);
    expect(decisions).toEqual([expect.objectContaining({ behavior: "deny", message: expect.stringContaining("Denied automatically") })]);
    expect(events.some((event) => event.type === "error" && event.message.includes("did not receive"))).toBe(true);
  }, 10_000);
}

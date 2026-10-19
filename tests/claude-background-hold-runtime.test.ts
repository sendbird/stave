import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { BridgeEvent } from "../electron/providers/types";

// Claude Code 2.1.302 keeps a closed-input session open after `result` while
// a `run_in_background` shell runs. The Stave turn must still end.
let closeCount = 0;
let backgroundTasks: Array<{ task_id: string; task_type: string; description: string }> = [];
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualStaveLocalMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => {
    let releaseHeldStream: () => void = () => {};
    const closed = new Promise<void>((resolve) => {
      releaseHeldStream = resolve;
    });
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init", session_id: "session-1", permissionMode: "default", tools: [], mcp_servers: [] };
        yield { type: "system", subtype: "background_tasks_changed", tasks: backgroundTasks, session_id: "session-1" };
        yield { type: "result", subtype: "success", is_error: false, result: "STARTED", stop_reason: "end_turn", session_id: "session-1",
          duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
        // The CLI waits for the shell; only closing the query ends the stream.
        await closed;
      },
      close: () => {
        closeCount += 1;
        releaseHeldStream();
      },
      mcpServerStatus: async () => [],
    };
  },
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

afterEach(() => {
  closeCount = 0;
  backgroundTasks = [];
});
afterAll(() => mock.restore());

test("a turn the CLI holds open for a background shell ends as completed after the grace", async () => {
  backgroundTasks = [{ task_id: "b8g1s28ij", task_type: "local_bash", description: "Start local dev server for staging repro" }];
  const events: BridgeEvent[] = [];
  const started = Date.now();
  await streamClaudeWithSdk({
    providerId: "claude-code", cwd: process.cwd(), taskId: "task-background-hold", prompt: "Start the dev server",
    runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: "default" },
    onEvent: (event) => { events.push(event); },
  });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(4_500);
  expect(elapsed).toBeLessThan(12_000);
  expect(closeCount).toBeGreaterThanOrEqual(1);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
  const notice = events.find((event) => event.type === "system" && event.content.includes("background work was still running"));
  expect(notice).toBeDefined();
  expect(notice && "content" in notice ? notice.content : "").toContain("Start local dev server for staging repro");
}, 20_000);

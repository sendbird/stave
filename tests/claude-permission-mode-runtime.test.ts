import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { BridgeEvent } from "../electron/providers/types";

let abortAfterInit = false;
let abortTurn: (() => void) | undefined;
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init", session_id: "mode-session", permissionMode: "auto", tools: [], mcp_servers: [] };
      if (abortAfterInit) abortTurn?.();
      yield { type: "system", subtype: "status", session_id: "mode-session", status: "compacting", permissionMode: "default" };
      yield { type: "system", subtype: "status", session_id: "mode-session", status: null, permissionMode: "default" };
      yield { type: "system", subtype: "status", session_id: "mode-session", status: "requesting", permissionMode: "auto" };
      yield { type: "result", subtype: "success", is_error: false, result: "Done", stop_reason: "end_turn", session_id: "mode-session",
        duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    close() {},
    mcpServerStatus: async () => [],
  }),
}));
mock.module("../electron/providers/cli-path-env", () => ({
  ...actualCliPathEnv,
  buildClaudeCliEnv: () => ({ PATH: "/tmp/bin" }),
}));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualMcpManifest,
  readStaveLocalMcpManifest: async () => null,
}));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");

afterEach(() => { abortAfterInit = false; abortTurn = undefined; });
afterAll(() => mock.restore());

async function runTurn(taskId: string, secondaryReadOnly = false) {
  const events: BridgeEvent[] = [];
  await streamClaudeWithSdk({
    providerId: "claude-code", cwd: process.cwd(), taskId, prompt: "Observe runtime state",
    ...(secondaryReadOnly ? { executionPolicy: "secondary-read-only" as const } : {}),
    runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: "auto" },
    registerAbort: (abort) => { abortTurn = abort; },
    onEvent: (event) => { events.push(event); },
  });
  return events;
}

function modeNotices(events: BridgeEvent[]) {
  return events.filter((event) => event.type === "system" && event.content.startsWith("Claude permission mode changed"));
}

test("the stream observes effective mode changes while preserving compaction and terminal events", async () => {
  const events = await runTurn("task-mode-runtime");
  expect(modeNotices(events)).toEqual([
    { type: "system", content: "Claude permission mode changed from auto to default." },
    { type: "system", content: "Claude permission mode changed from default to auto." },
  ]);
  expect(events).toContainEqual({ type: "system", content: "Compacting conversation context…" });
  expect(events).toContainEqual({ type: "system", content: "Sending request to model…" });
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
});

test("Stop prevents late status messages from announcing effective mode changes", async () => {
  abortAfterInit = true;
  const events = await runTurn("task-mode-runtime-stopped");
  expect(modeNotices(events)).toEqual([]);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "user_abort" });
});

test("secondary read-only analysis does not announce primary-session permission state", async () => {
  const events = await runTurn("task-mode-runtime-secondary", true);
  expect(modeNotices(events)).toEqual([]);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
});

import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BridgeEvent } from "../electron/providers/types";

/**
 * A background call that only writes text from content Stave passes in
 * (`runtimeOptions.toolsDisabled`: the turn summary, agent drafting,
 * instruction suggestions) runs through a full provider turn with no tool at
 * all. Claude's turn is captured at the SDK's `query`; Codex's at the
 * `thread/start` a stand-in App Server receives. Only the asserted fields are
 * handed to `expect`, so a failure never prints the account environment.
 */

const claudeOptions: Array<Record<string, unknown>> = [];
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualStaveLocalMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: Record<string, unknown> }) => {
    claudeOptions.push(args.options);
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init", session_id: "session-1", permissionMode: "dontAsk", tools: [], mcp_servers: [] };
        yield { type: "result", subtype: "success", is_error: false, result: "A summary.", stop_reason: "end_turn", session_id: "session-1",
          duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
      },
      close: () => {},
      mcpServerStatus: async () => [],
    };
  },
}));
mock.module("../electron/providers/cli-path-env", () => ({
  ...actualCliPathEnv,
  buildClaudeCliEnv: () => ({ PATH: "/tmp/bin" }),
}));
// A configured Stave Local MCP server, which a tool-less turn must not get either.
mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualStaveLocalMcpManifest,
  readStaveLocalMcpManifest: async () => ({ url: "http://127.0.0.1:9/mcp", token: "test-token", pid: 1, version: 1 }),
}));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");
const { disposeAllCodexAppServerClients, streamCodexWithAppServer } = await import("../electron/providers/codex-app-server-runtime");
const { providerRuntime } = await import("../electron/providers/runtime");
const { requestInlineCompletion } = await import("../electron/providers/inline-completion");

const directories: string[] = [];
afterEach(() => {
  claudeOptions.length = 0;
  disposeAllCodexAppServerClients();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
afterAll(() => mock.restore());

function pick(source: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source?.[key]]));
}

const CLAUDE_TOOLLESS = {
  tools: [],
  allowedTools: [],
  skills: [],
  plugins: [],
  agents: {},
  mcpServers: {},
  strictMcpConfig: true,
  settingSources: [],
};

/** The read-only options the background lanes send today, plus `toolsDisabled` when asked. */
function claudeLaneOptions(toolsDisabled: boolean) {
  return {
    claudeBinaryPath: "/tmp/bin/claude",
    claudeAllowedTools: [],
    claudeMaxTurns: 1,
    claudePermissionMode: "dontAsk" as const,
    claudeAgentProgressSummaries: false,
    chatStreamingEnabled: false,
    ...(toolsDisabled ? { toolsDisabled: true } : {}),
  };
}

describe("a tool-less Claude turn", () => {
  test("has no tool, MCP server, setting source, skill, plugin or agent", async () => {
    const events: BridgeEvent[] = [];
    await streamClaudeWithSdk({
      providerId: "claude-code", cwd: process.cwd(), prompt: "Summarize this turn.",
      runtimeOptions: claudeLaneOptions(true),
      onEvent: (event) => { events.push(event); },
    });
    expect(claudeOptions).toHaveLength(1);
    expect(pick(claudeOptions[0], Object.keys(CLAUDE_TOOLLESS))).toEqual(CLAUDE_TOOLLESS);
    expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
  });

  test("an ordinary turn keeps its tools and MCP servers", async () => {
    await streamClaudeWithSdk({
      providerId: "claude-code", cwd: process.cwd(), prompt: "Summarize this turn.",
      runtimeOptions: claudeLaneOptions(false),
      onEvent: () => {},
    });
    expect(claudeOptions).toHaveLength(1);
    expect(claudeOptions[0]?.tools).toBeUndefined();
    expect(Object.keys((claudeOptions[0]?.mcpServers as Record<string, unknown> | undefined) ?? {})).not.toEqual([]);
  });
});

/** A stand-in Codex App Server with one configured MCP server; it records what `thread/start` asked for. */
function fakeCodex() {
  const cwd = mkdtempSync(join(tmpdir(), "stave-toolless-codex-"));
  directories.push(cwd);
  const executable = join(cwd, "codex");
  const receipts = join(cwd, "receipts.jsonl");
  writeFileSync(executable, `#!${process.execPath}
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("codex-cli 0.162.1"); process.exit(0); }
const send = (message) => console.log(JSON.stringify({ jsonrpc: "2.0", ...message }));
const KEYS = ["features.shell_tool", "features.unified_exec", "features.apps", "tools.view_image", "network_access", "web_search"];
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (!m.method || m.id == null) return;
  let result = {};
  if (m.method === "config/read") result = { config: { mcp_servers: { figma: { command: "figma-mcp" } } }, layers: [] };
  if (m.method === "mcpServerStatus/list") result = { data: [] };
  if (m.method === "account/read") result = { account: null, requiresOpenaiAuth: false };
  if (m.method === "thread/start" || m.method === "thread/resume") {
    const config = m.params.config ?? {};
    appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({ method: m.method,
      config: Object.fromEntries(KEYS.map((key) => [key, config[key]])),
      figmaEnabled: config.mcp_servers?.figma?.enabled ?? config["mcp_servers.figma.enabled"],
      staveLocal: Object.keys(config.mcp_servers ?? {}).some((name) => name.startsWith("stave")) }) + "\\n");
    result = { thread: { id: "thread-1" } };
  }
  if (m.method === "turn/start") result = { turn: { id: "turn-1" } };
  send({ id: m.id, result });
  if (m.method === "turn/start") setTimeout(() => send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } }), 10);
});
`);
  chmodSync(executable, 0o755);
  const starts = () => existsSync(receipts)
    ? readFileSync(receipts, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
  return { cwd, executable, starts };
}

function codexLaneOptions(executable: string, toolsDisabled: boolean) {
  return {
    codexBinaryPath: executable,
    codexApprovalPolicy: "never" as const,
    codexFileAccess: "read-only" as const,
    codexNetworkAccess: false,
    codexWebSearch: "disabled" as const,
    codexReasoningSummary: "none" as const,
    codexShowRawReasoning: false,
    chatStreamingEnabled: false,
    ...(toolsDisabled ? { toolsDisabled: true } : {}),
  };
}

describe("a tool-less Codex turn", () => {
  test("has no shell, exec, apps, image viewing, network, web search or MCP server", async () => {
    const server = fakeCodex();
    const events: BridgeEvent[] = [];
    await streamCodexWithAppServer({
      providerId: "codex", cwd: server.cwd, prompt: "Summarize this turn.",
      runtimeOptions: codexLaneOptions(server.executable, true),
      onEvent: (event) => { events.push(event); },
    });
    const starts = server.starts();
    expect(starts).toHaveLength(1);
    expect(starts[0]).toEqual({
      method: "thread/start",
      config: {
        "features.shell_tool": false,
        "features.unified_exec": false,
        "features.apps": false,
        "tools.view_image": false,
        network_access: false,
        web_search: "disabled",
      },
      figmaEnabled: false,
      staveLocal: false,
    });
    expect(events.filter((event) => event.type === "error")).toEqual([]);
  }, 20_000);

  test("an ordinary turn keeps its shell", async () => {
    const server = fakeCodex();
    await streamCodexWithAppServer({
      providerId: "codex", cwd: server.cwd, prompt: "Summarize this turn.",
      runtimeOptions: codexLaneOptions(server.executable, false),
      onEvent: () => {},
    });
    const starts = server.starts();
    expect(starts).toHaveLength(1);
    const config = (starts[0]?.config ?? {}) as Record<string, unknown>;
    expect(config["features.shell_tool"]).toBeUndefined();
  }, 20_000);
});

describe("a provider that cannot switch its tools off", () => {
  test("refuses a tool-less turn before it starts", async () => {
    const events = await providerRuntime.streamTurn({
      providerId: "cursor", prompt: "Summarize this turn.", runtimeOptions: { toolsDisabled: true },
    });
    const errors = events.flatMap((event) => (event.type === "error" ? [event.message] : []));
    expect(errors).toEqual(["This background call runs only on Claude or Codex, which can run it without tools."]);
    expect(events.at(-1)).toEqual({ type: "done", stop_reason: "runtime_failure" });
  }, 20_000);
});

describe("Claude inline completion", () => {
  test("has no tool and loads no MCP server, setting source, skill or plugin", async () => {
    await requestInlineCompletion({ prefix: "const total = ", suffix: "", filePath: "src/a.ts", language: "typescript" });
    expect(claudeOptions).toHaveLength(1);
    const keys = ["tools", "allowedTools", "mcpServers", "strictMcpConfig", "settingSources", "skills", "plugins"];
    expect(pick(claudeOptions[0], keys)).toEqual({
      tools: [], allowedTools: [], mcpServers: {}, strictMcpConfig: true, settingSources: [], skills: [], plugins: [],
    });
  });
});

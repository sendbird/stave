import { afterAll, expect, mock, test } from "bun:test";
import {
  makeClaudePluginEnvFixture,
  PLUGIN_ID,
} from "./fixtures/claude-plugin-env-fixture";

type EnvBuildArgs = { cwd?: string; mcpConfigPaths?: readonly string[]; enabledPlugins?: unknown };
type RefreshArgs = { provider: string; enabledPlugins?: unknown };

// Claude settings disable the plugin; Stave's `all` mode loads it anyway.
const fixture = makeClaudePluginEnvFixture({ enabled: false });
const envBuilds: EnvBuildArgs[] = [];
const refreshes: RefreshArgs[] = [];
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init", session_id: "plugin-session", tools: [], mcp_servers: [] };
      yield { type: "result", subtype: "success", is_error: false, result: "Done", stop_reason: "end_turn", session_id: "plugin-session",
        duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    close() {},
    mcpServerStatus: async () => [],
  }),
}));
mock.module("../electron/providers/cli-path-env", () => ({
  ...actualCliPathEnv,
  buildClaudeCliEnv: (args: EnvBuildArgs) => {
    envBuilds.push(args);
    return { PATH: "/tmp/bin", CLAUDE_CONFIG_DIR: fixture.configDir };
  },
  refreshMcpLoginShellEnv: async (args: RefreshArgs) => {
    refreshes.push(args);
    return [];
  },
}));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualMcpManifest,
  readStaveLocalMcpManifest: async () => null,
}));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");

afterAll(() => {
  mock.restore();
  fixture.cleanup();
});

async function runTurn(secondaryReadOnly = false) {
  await streamClaudeWithSdk({
    providerId: "claude-code",
    cwd: fixture.cwd,
    taskId: "task-plugin-mcp-tracking",
    prompt: "Check the plugin server",
    ...(secondaryReadOnly ? { executionPolicy: "secondary-read-only" as const } : {}),
    runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePluginMode: "all" },
    onEvent: () => {},
  });
}

/**
 * The env builds that feed the query. The turn's config-dir read skips MCP
 * discovery, and the diagnostics' version probe has no workspace.
 */
const queryEnvBuilds = () =>
  envBuilds.filter((args) => args.cwd === fixture.cwd && args.mcpConfigPaths === undefined);

test("a turn tracks and refreshes the MCP config of the plugins Stave loads", async () => {
  await runTurn();
  // A secondary turn's plugin-free path list is tracked in its own scope, so
  // alternating with it is not a config change.
  await runTurn(true);
  await runTurn();
  expect(refreshes).toEqual([]);

  // Editing the server of a plugin only Stave enables is an MCP config change.
  fixture.writeServer("https://remote.example.test/v2/mcp");
  await runTurn();
  expect(refreshes).toEqual([
    expect.objectContaining({ provider: "claude", enabledPlugins: { [PLUGIN_ID]: true } }),
  ]);
});

test("the query env uses the same plugin decision as tracking", async () => {
  envBuilds.length = 0;
  await runTurn();
  await runTurn(true);
  expect(queryEnvBuilds().map((args) => args.enabledPlugins)).toEqual([
    { [PLUGIN_ID]: true },
    false,
  ]);
});

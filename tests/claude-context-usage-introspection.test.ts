import { afterEach, describe, expect, mock, test } from "bun:test";

type QueryCall = { prompt: string; options: { cwd?: string; env?: Record<string, string> } };
const queryCalls: QueryCall[] = [];
let controlCalls = 0;
let closeCalls = 0;
let secretResolveCalls = 0;
let failControl = false;
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualLocalMcp = await import("../electron/main/stave-local-mcp-manifest");
const actualGatewayRuntime = await import("../electron/provider-accounts/gateway-runtime");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: QueryCall) => {
    queryCalls.push(args);
    return {
      getContextUsage: async () => {
        controlCalls += 1;
        if (failControl) throw new Error("context unavailable");
        return {
          categories: [{ id: "messages", name: "Conversation", kind: "used", tokens: 20, color: "blue" }],
          totalTokens: 20, maxTokens: 100, rawMaxTokens: 100, percentage: 20,
          model: "claude-test", memoryFiles: [], mcpTools: [],
        };
      },
      close: () => { closeCalls += 1; },
    };
  },
}));
mock.module("../electron/providers/cli-path-env", () => ({
  ...actualCliPathEnv,
  buildClaudeCliEnv: (args: { accountProfileId?: string }) => ({
    PATH: "/tmp/bin",
    CLAUDE_CONFIG_DIR: `/tmp/context-${args.accountProfileId ?? "system"}`,
  }),
}));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualLocalMcp,
  readStaveLocalMcpManifest: async () => null,
}));
mock.module("../electron/provider-accounts/gateway-runtime", () => ({
  ...actualGatewayRuntime,
  currentClaudeGateway: () => undefined,
  validateClaudeGatewayModel: (model?: string) => model,
}));
mock.module("../electron/main/browser/secret-service", () => ({
  resolveBoundSecretEnv: async () => {
    secretResolveCalls += 1;
    throw new Error("introspection must not resolve bound secrets");
  },
}));

const { getClaudeContextUsage } = await import("../electron/providers/claude-sdk-runtime");

afterEach(() => {
  queryCalls.length = 0;
  controlCalls = 0;
  closeCalls = 0;
  secretResolveCalls = 0;
  failControl = false;
  mock.restore();
});

describe("Claude context introspection", () => {
  test("preserves one explicit control read per account without model input or bound secrets", async () => {
    const results = await Promise.all(["account-a", "account-b"].map((account) =>
      getClaudeContextUsage({
        cwd: "/tmp/context-workspace",
        runtimeOptions: {
          claudeBinaryPath: "/tmp/bin/claude",
          claudeAccountProfileId: account,
          claudeSettingSources: [],
          boundSecretIds: ["secret-id"],
        },
      }),
    ));

    expect(results).toMatchObject([{ ok: true }, { ok: true }]);
    expect(results[0]?.usage?.categories[0]).toMatchObject({ id: "messages", kind: "used" });
    expect(queryCalls.map((call) => call.prompt)).toEqual(["", ""]);
    expect(queryCalls.map((call) => call.options.env?.CLAUDE_CONFIG_DIR).sort()).toEqual([
      "/tmp/context-account-a", "/tmp/context-account-b",
    ]);
    expect(controlCalls).toBe(2);
    expect(closeCalls).toBe(2);
    expect(secretResolveCalls).toBe(0);
  });

  test("reports a control failure and closes the introspection query", async () => {
    failControl = true;
    const result = await getClaudeContextUsage({
      cwd: "/tmp/context-workspace",
      runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudeSettingSources: [] },
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.detail).toContain("context unavailable");
    expect(controlCalls).toBe(1);
    expect(closeCalls).toBe(1);
    expect(secretResolveCalls).toBe(0);
  });
});

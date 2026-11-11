import { describe, expect, test } from "bun:test";
import {
  buildCodexConfigOverrides,
  buildCodexUnattendedAutomationMcpOverrides,
} from "../electron/providers/codex-app-server-runtime";
import {
  buildCodexNativeBrowserTurnConfigOverrides,
  buildCodexPluginConfigOverrides,
} from "../electron/providers/codex-runtime-config";

/**
 * Codex splits a config override key on `.` and uses each segment verbatim — it
 * never parses TOML quoting. A quoted segment therefore addresses an entry
 * whose name really does contain quote characters, which either fails config
 * load outright or, worse, silently succeeds against the wrong entry.
 *
 * Both were live, verified against codex-cli 0.146.0:
 *
 *   -c 'mcp_servers."foo".enabled=false'
 *     → failed to load configuration: invalid transport in `mcp_servers."foo"`
 *
 *   -c 'plugins."chrome@openai-bundled".enabled=false'
 *     → config gains `"\"chrome@openai-bundled\"": { enabled: false }` while the
 *       real `chrome@openai-bundled` stays `enabled: true`
 *
 * The second one meant the bundled plugins Stave disables on every Codex turn
 * had never actually been disabled. So: no override key may carry a quote.
 */

function assertNoQuotedKeys(overrides: Record<string, unknown>) {
  for (const key of Object.keys(overrides)) {
    expect(key).not.toContain('"');
  }
}

describe("Codex config override keys", () => {
  test("bundled plugin disables address the real plugin entries", () => {
    const overrides = buildCodexPluginConfigOverrides();

    expect(Object.keys(overrides).length).toBeGreaterThan(0);
    assertNoQuotedKeys(overrides);
    for (const [key, value] of Object.entries(overrides)) {
      expect(key).toMatch(/^plugins\.[^.]+\.enabled$/);
      expect(value).toBe(false);
    }
  });

  test("the native browser toggle addresses the real plugin entry", () => {
    expect(
      buildCodexNativeBrowserTurnConfigOverrides({
        requested: true,
        userEnabled: true,
      }),
    ).toEqual({
      "plugins.chrome@openai-bundled.enabled": true,
      "plugins.unified-computer-use@openai-bundled.enabled": true,
    });
    expect(
      buildCodexNativeBrowserTurnConfigOverrides({
        requested: false,
        userEnabled: true,
      }),
    ).toEqual({
      "plugins.chrome@openai-bundled.enabled": false,
      "plugins.unified-computer-use@openai-bundled.enabled": false,
    });
  });

  test("the unattended automation MCP URL addresses the real server entry", () => {
    const overrides = buildCodexUnattendedAutomationMcpOverrides({
      mcpUrl: "http://127.0.0.1:39517/mcp",
      authorizationToken: "authorization-placeholder",
    });

    assertNoQuotedKeys(overrides);
    expect(overrides).toEqual({
      "mcp_servers.stave-local.url":
        "http://127.0.0.1:39517/mcp?staveUnattendedAutomation=authorization-placeholder",
    });
  });

  test("no key produced for a real turn carries a quote", () => {
    const overrides = buildCodexConfigOverrides({
      cwd: "/workspace/stave",
      runtimeOptions: {
        codexNetworkAccess: false,
        codexWebSearch: "disabled",
        codexPlanMode: false,
      },
    });

    expect(overrides).toBeDefined();
    assertNoQuotedKeys(overrides ?? {});
  });
});

test("browse uses array values and reaches start and resume without native plugins", async () => {
  const { resolveBrowseCodexOverrides } = await import("../electron/providers/browse-browser");
  const { buildCodexThreadStartParams, buildCodexThreadResumeParams } = await import("../electron/providers/codex-app-server-params");
  const { buildCodexDeveloperInstructions } = await import("../electron/providers/codex-runtime-config");
  const args = { requested: true, backend: "browse", cwd: "/tmp/workspace", request: async () => ({ config: { mcp_servers: {} } }), resolveExecutable: () => "/tmp/bin/browse" };
  const overrides = await resolveBrowseCodexOverrides(args);
  expect(overrides).toEqual({ "mcp_servers.browse.command": "/tmp/bin/browse", "mcp_servers.browse.args": ["mcp"] });
  const configOverrides = { ...overrides, ...buildCodexNativeBrowserTurnConfigOverrides({ requested: false, userEnabled: true }) };
  const common = { cwd: args.cwd, runtimeOptions: { providerBrowserBackend: "browse" as const }, configOverrides };
  for (const params of [buildCodexThreadStartParams(common), buildCodexThreadResumeParams({ ...common, threadId: "thread" })]) {
    const config = params.config as Record<string, unknown>;
    expect(config["mcp_servers.browse.args"]).toEqual(["mcp"]);
    expect(config["plugins.chrome@openai-bundled.enabled"]).toBe(false);
    expect(config["plugins.unified-computer-use@openai-bundled.enabled"]).toBe(false);
  }
  expect(await resolveBrowseCodexOverrides({ ...args, requested: false })).toEqual({});
  expect(await resolveBrowseCodexOverrides({ ...args, backend: "native" })).toEqual({});
  expect(await resolveBrowseCodexOverrides({ ...args, resolveExecutable: () => null })).toEqual({});
  expect(await resolveBrowseCodexOverrides({ ...args, request: async () => ({ config: { mcp_servers: { browse: { command: "custom" } } } }) })).toEqual({});
  expect(await resolveBrowseCodexOverrides({ ...args, request: async () => { throw new Error("unavailable"); } })).toEqual({});
  expect(buildCodexDeveloperInstructions({})).toBe(buildCodexDeveloperInstructions({ runtimeOptions: { providerBrowserBackend: "native" } }));
  expect(buildCodexDeveloperInstructions(common)).toContain("session_adopt");
});

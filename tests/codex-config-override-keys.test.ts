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
    ).toEqual({ "plugins.chrome@openai-bundled.enabled": true });
    expect(
      buildCodexNativeBrowserTurnConfigOverrides({
        requested: false,
        userEnabled: true,
      }),
    ).toEqual({ "plugins.chrome@openai-bundled.enabled": false });
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

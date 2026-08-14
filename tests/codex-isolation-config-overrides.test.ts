import { describe, expect, test } from "bun:test";
import {
  buildCodexMcpDisableConfigOverrides,
  resolveCodexIsolationConfigOverrides,
} from "../electron/providers/codex-app-server-params";

/**
 * Codex splits a `thread/start` config override KEY on `.` and uses each
 * segment verbatim — TOML quoting is not interpreted. So
 * `mcp_servers."slack".enabled` does not disable `slack`; it invents a server
 * literally named `"slack"` (quote characters included) whose table has no
 * transport, and Codex refuses the whole config:
 *
 *     failed to load configuration: invalid transport in `mcp_servers."slack"`
 *
 * Every isolated Codex thread — Advisor, secondary read-only review — died on
 * that, verified against codex-cli 0.146.0. Nested tables must therefore travel
 * as a VALUE, which Codex parses as data.
 *
 * The second half of the failure is origin: Codex registers servers that have
 * no `mcp_servers` entry at all (the `codex_apps` plugin runtime). Writing
 * `enabled = false` for one of those synthesizes the same transport-less table,
 * so they are neutralized by turning the feature off instead.
 */

function createRequest(overrides: {
  servers?: unknown;
  config?: unknown;
  onRequest?: (method: string, params: unknown) => void;
}) {
  return async (method: string, params: unknown) => {
    overrides.onRequest?.(method, params);
    if (method === "mcpServerStatus/list") {
      return { data: overrides.servers ?? [] };
    }
    if (method === "config/read") {
      return { config: overrides.config ?? {} };
    }
    return {};
  };
}

describe("buildCodexMcpDisableConfigOverrides", () => {
  test("emits one nested mcp_servers table instead of quoted dotted keys", () => {
    expect(buildCodexMcpDisableConfigOverrides(["slack", "linear"])).toEqual({
      mcp_servers: {
        slack: { enabled: false },
        linear: { enabled: false },
      },
    });
  });

  test("addresses names a dotted override path cannot express", () => {
    // `mcp_servers.weird.name.enabled` would target `mcp_servers.weird`, and
    // Codex answers `invalid type: map, expected a string`.
    expect(buildCodexMcpDisableConfigOverrides(["weird.name"])).toEqual({
      mcp_servers: { "weird.name": { enabled: false } },
    });
  });

  test("emits nothing when there is nothing to disable", () => {
    expect(buildCodexMcpDisableConfigOverrides([])).toEqual({});
  });
});

describe("resolveCodexIsolationConfigOverrides", () => {
  test("disables every server the effective config declares", async () => {
    const overrides = await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "slack" }, { name: "linear" }],
        config: { mcp_servers: { slack: {}, linear: {} } },
      }),
      cwd: "/workspace/stave",
    });

    expect(overrides).toMatchObject({
      mcp_servers: {
        slack: { enabled: false },
        linear: { enabled: false },
      },
    });
  });

  test("disables a server that only a project config layer declares", async () => {
    // `mcpServerStatus/list` answers for the App Server's own working
    // directory and takes no cwd, so a server declared in the repo's
    // `.codex/config.toml` is absent from it while `config/read {cwd}` — which
    // merges the project layers between `cwd` and the repo root — has it.
    // Intersecting the two dropped exactly those servers, leaving them live in
    // a thread that advertises isolation.
    const overrides = await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "globalsrv" }],
        config: { mcp_servers: { globalsrv: {}, projsrv: {} } },
      }),
      cwd: "/workspace/stave",
    });

    expect(overrides.mcp_servers).toEqual({
      globalsrv: { enabled: false },
      projsrv: { enabled: false },
    });
  });

  test("skips Codex-injected servers that have no config entry", async () => {
    const overrides = await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "codex_apps" }, { name: "slack" }],
        config: { mcp_servers: { slack: {} } },
      }),
      cwd: "/workspace/stave",
    });

    // An `enabled = false` for `codex_apps` creates a table with no transport
    // and Codex rejects the entire configuration.
    expect(overrides.mcp_servers).toEqual({ slack: { enabled: false } });
  });

  test("turns off the apps feature so injected servers are never registered", async () => {
    const overrides = await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "codex_apps" }],
        config: { mcp_servers: {} },
      }),
      cwd: "/workspace/stave",
    });

    // The only lever that removes a plugin-runtime server from the catalog:
    // it also drops `read_mcp_resource` / `request_plugin_install` from the
    // isolated thread's tool set.
    expect(overrides["features.apps"]).toBe(false);
  });

  test("never emits a key containing a quote character", async () => {
    const overrides = await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "slack" }],
        config: { mcp_servers: { slack: {} } },
      }),
      cwd: "/workspace/stave",
    });

    for (const key of Object.keys(overrides)) {
      expect(key).not.toContain('"');
    }
  });

  test("resolves the config from the thread cwd so project layers count", async () => {
    const seen: Array<{ method: string; params: unknown }> = [];
    await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "slack" }],
        config: { mcp_servers: { slack: {} } },
        onRequest: (method, params) => seen.push({ method, params }),
      }),
      cwd: "/workspace/stave",
    });

    expect(seen).toContainEqual({
      method: "config/read",
      params: { cwd: "/workspace/stave" },
    });
  });

  test("never consults the cwd-blind MCP catalog", async () => {
    const seen: string[] = [];
    await resolveCodexIsolationConfigOverrides({
      request: createRequest({
        servers: [{ name: "slack" }],
        config: { mcp_servers: { slack: {} } },
        onRequest: (method) => seen.push(method),
      }),
      cwd: "/workspace/stave",
    });

    // It answers for the App Server's own directory, so anything it adds is
    // either already in the config or unnameable, and anything it removes is a
    // project-layer server that must still be disabled.
    expect(seen).not.toContain("mcpServerStatus/list");
  });

  test("fails closed when a configured server has no usable name", async () => {
    await expect(
      resolveCodexIsolationConfigOverrides({
        request: createRequest({
          config: { mcp_servers: { slack: {}, "  ": {} } },
        }),
        cwd: "/workspace/stave",
      }),
    ).rejects.toThrow();
  });

  test("fails closed when the effective config cannot be read", async () => {
    await expect(
      resolveCodexIsolationConfigOverrides({
        request: createRequest({
          servers: [{ name: "slack" }],
          config: "not-a-config",
        }),
        cwd: "/workspace/stave",
      }),
    ).rejects.toThrow();
  });
});

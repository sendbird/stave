import { describe, expect, test } from "bun:test";
import type { StaveLocalMcpManifest } from "@/lib/local-mcp";
import { mergeCodexTurnConfigOverrides } from "../electron/providers/codex-app-server-config-overrides";
import {
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
} from "../electron/providers/codex-app-server-params";

const manifest: StaveLocalMcpManifest = {
  version: 1,
  name: "stave-local-mcp",
  mode: "local-only",
  url: "http://127.0.0.1:39517/mcp",
  healthUrl: "http://127.0.0.1:39517/health",
  token: "manifest-token-must-not-enter-config",
  host: "127.0.0.1",
  port: 39517,
  pid: 1,
  appVersion: "1.0.0",
  startedAt: "2026-01-01T00:00:00.000Z",
  stdioProxyScript: "/tmp/stave-proxy.mjs",
};

describe("Codex turn-scoped Local MCP", () => {
  test("attaches without CLI registration on both start and resume", async () => {
    const configOverrides = await mergeCodexTurnConfigOverrides({
      staveLocalMcpManifest: manifest,
      secondaryReadOnly: false,
      secretShellOverrides: {},
      base: { "plugins.example.enabled": false },
    });
    const expected = {
      "mcp_servers.stave-local.url": manifest.url,
      "mcp_servers.stave-local.enabled": true,
      "mcp_servers.stave-local.bearer_token_env_var": "STAVE_LOCAL_MCP_TOKEN",
      "mcp_servers.stave-local.tool_timeout_sec": 1860,
      "plugins.example.enabled": false,
    };
    for (const params of [
      buildCodexThreadStartParams({ cwd: "/tmp/project", configOverrides }),
      buildCodexThreadResumeParams({
        threadId: "existing-thread",
        cwd: "/tmp/project",
        configOverrides,
      }),
    ]) {
      expect(params.config).toMatchObject(expected);
      expect(JSON.stringify(params)).not.toContain(manifest.token);
    }
  });

  test("does not re-enable MCP on secondary runs, even with automation authorization", async () => {
    const base = { mcp_servers: { "stave-local": { enabled: false } } };
    expect(
      await mergeCodexTurnConfigOverrides({
        base,
        staveLocalMcpManifest: manifest,
        secondaryReadOnly: true,
        secretShellOverrides: {},
        unattendedAutomationAuthorizationToken: "automation-placeholder",
      }),
    ).toEqual(base);
  });

  test("an absent manifest leaves unrelated overrides intact", async () => {
    const args = {
      staveLocalMcpManifest: null,
      secondaryReadOnly: false,
      secretShellOverrides: {},
    };
    expect(await mergeCodexTurnConfigOverrides(args)).toBeUndefined();
    const base = { "plugins.example.enabled": false };
    expect(await mergeCodexTurnConfigOverrides({ ...args, base })).toEqual(base);
  });

  test("uses the current endpoint and keeps automation authorization turn-scoped", async () => {
    const args = {
      staveLocalMcpManifest: { ...manifest, url: "http://127.0.0.1:41234/mcp" },
      secondaryReadOnly: false,
      secretShellOverrides: {},
    };
    const automated = await mergeCodexTurnConfigOverrides({
      ...args,
      unattendedAutomationAuthorizationToken: "automation-placeholder",
    });
    expect(automated?.["mcp_servers.stave-local.url"]).toBe(
      "http://127.0.0.1:41234/mcp?staveUnattendedAutomation=automation-placeholder",
    );
    const interactive = await mergeCodexTurnConfigOverrides(args);
    expect(interactive?.["mcp_servers.stave-local.url"]).toBe(
      args.staveLocalMcpManifest.url,
    );
  });
});

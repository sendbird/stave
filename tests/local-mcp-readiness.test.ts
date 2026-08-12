import { describe, expect, test } from "bun:test";
import {
  describeLocalMcpBlock,
  resolveLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import type { StaveLocalMcpStatus } from "@/lib/local-mcp";

function status(
  overrides: {
    enabled?: boolean;
    running?: boolean;
    manifest?: boolean;
    codexInstalled?: boolean;
    codexMatchesManifest?: boolean;
  } = {},
): StaveLocalMcpStatus {
  const {
    enabled = true,
    running = true,
    manifest = true,
    codexInstalled = true,
    codexMatchesManifest = true,
  } = overrides;
  return {
    config: {
      enabled,
      port: 39_517,
      token: "token",
      claudeCodeAutoRegister: true,
      codexAutoRegister: true,
      configVersion: 2,
    },
    running,
    manifest: manifest
      ? ({
          version: 1,
          name: "stave-local-mcp",
          mode: "local-only",
          url: "http://127.0.0.1:39517",
          healthUrl: "http://127.0.0.1:39517/health",
          token: "token",
          host: "127.0.0.1",
          port: 39_517,
          pid: 1,
          appVersion: "0.0.0",
          startedAt: "2026-01-01T00:00:00.000Z",
          stdioProxyScript: "/tmp/proxy.js",
        } as StaveLocalMcpStatus["manifest"])
      : null,
    manifestPaths: [],
    configPath: "/tmp/config.json",
    claudeCodeRegistration: {
      autoRegister: true,
      configPath: "/tmp/claude.json",
      installed: true,
      matchesCurrentManifest: true,
      transportType: "http",
      url: "http://127.0.0.1:39517",
      detail: "",
    },
    codexRegistration: {
      autoRegister: true,
      configPath: "/tmp/codex.toml",
      installed: codexInstalled,
      matchesCurrentManifest: codexMatchesManifest,
      url: "http://127.0.0.1:39517",
      bearerTokenEnvVar: "STAVE_TOKEN",
      detail: "",
    },
  };
}

describe("local MCP readiness", () => {
  test("an unread status is unknown, not broken", () => {
    // A pill that warned before the first IPC read would cry wolf on every
    // mount, which is worse than the silence it is meant to fix.
    const readiness = resolveLocalMcpReadiness({
      status: null,
      primaryProviderId: "claude-code",
    });

    expect(readiness.state).toBe("unknown");
    expect(readiness.detail).toBeNull();
    expect(
      describeLocalMcpBlock({ readiness, capability: "Advisor consults" }),
    ).toBeNull();
  });

  test("a running server with a manifest is ready for both providers", () => {
    for (const primaryProviderId of ["claude-code", "codex"] as const) {
      expect(
        resolveLocalMcpReadiness({ status: status(), primaryProviderId }).state,
      ).toBe("ready");
    }
  });

  test("a disabled server blocks every provider and names the switch", () => {
    const readiness = resolveLocalMcpReadiness({
      status: status({ enabled: false }),
      primaryProviderId: "claude-code",
    });

    expect(readiness.reason).toBe("server-disabled");
    expect(
      describeLocalMcpBlock({ readiness, capability: "Advisor consults" }),
    ).toContain("Settings → Developer");
  });

  test("an enabled but dead server is reported as stopped, not disabled", () => {
    expect(
      resolveLocalMcpReadiness({
        status: status({ running: false }),
        primaryProviderId: "claude-code",
      }).reason,
    ).toBe("server-stopped");
    // Claude resolves its embedded server from the manifest file, so a missing
    // manifest is the same outage even when the process claims to be running.
    expect(
      resolveLocalMcpReadiness({
        status: status({ manifest: false }),
        primaryProviderId: "claude-code",
      }).reason,
    ).toBe("server-stopped");
  });

  test("a stale Codex registration blocks Codex primaries only", () => {
    for (const overrides of [
      { codexInstalled: false },
      { codexMatchesManifest: false },
    ]) {
      expect(
        resolveLocalMcpReadiness({
          status: status(overrides),
          primaryProviderId: "codex",
        }).reason,
      ).toBe("codex-not-registered");
      // Claude reaches the same server directly, so it is unaffected.
      expect(
        resolveLocalMcpReadiness({
          status: status(overrides),
          primaryProviderId: "claude-code",
        }).state,
      ).toBe("ready");
    }
  });

  test("the capability is named in the sentence, so one resolver serves both", () => {
    const readiness = resolveLocalMcpReadiness({
      status: status({ enabled: false }),
      primaryProviderId: "claude-code",
    });

    expect(
      describeLocalMcpBlock({ readiness, capability: "Delegated child tasks" }),
    ).toContain("Delegated child tasks");
  });
});

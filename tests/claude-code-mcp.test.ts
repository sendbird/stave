import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StaveLocalMcpManifest } from "@/lib/local-mcp";
import {
  getClaudeCodeMcpRegistrationStatus,
  syncClaudeCodeMcpRegistration,
} from "../electron/main/claude-code-mcp";

const tempDirs: string[] = [];

function createTempSettingsPath(initial?: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "stave-claude-mcp-"));
  tempDirs.push(dir);
  const settingsPath = path.join(dir, "settings.json");
  if (initial) {
    writeFileSync(settingsPath, `${JSON.stringify(initial, null, 2)}\n`);
  }
  return settingsPath;
}

function createManifest(): StaveLocalMcpManifest {
  return {
    version: 1,
    name: "stave-local-mcp",
    mode: "local-only",
    url: "http://127.0.0.1:43127/mcp",
    healthUrl: "http://127.0.0.1:43127/health",
    token: "test-token",
    host: "127.0.0.1",
    port: 43127,
    pid: 1234,
    appVersion: "1.0.0",
    startedAt: "2026-04-06T00:00:00.000Z",
    stdioProxyScript: "/tmp/stave-mcp-stdio-proxy.mjs",
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Claude Code MCP registration sync", () => {
  test("installs the managed Stave entry without overwriting unrelated settings", async () => {
    const settingsPath = createTempSettingsPath({
      theme: "dark",
      mcpServers: {
        github: {
          transport: {
            type: "http",
            url: "https://api.githubcopilot.com/mcp/",
            headers: {
              Authorization: "Bearer $GITHUB_MCP_TOKEN",
            },
          },
        },
      },
    });
    const manifest = createManifest();

    const status = await syncClaudeCodeMcpRegistration({
      autoRegister: true,
      manifest,
      settingsPath,
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(true);
    expect(status.matchesCurrentManifest).toBe(true);

    const saved = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    expect(saved.theme).toBe("dark");
    expect(saved.mcpServers).toEqual({
      github: {
        transport: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
          headers: {
            Authorization: "Bearer $GITHUB_MCP_TOKEN",
          },
        },
      },
      "stave-local-mcp": {
        transport: {
          type: "http",
          url: manifest.url,
          headers: {
            Authorization: `Bearer ${manifest.token}`,
          },
        },
      },
    });
  });

  test("removes only the managed Stave entry when auto-registration is turned off", async () => {
    const settingsPath = createTempSettingsPath({
      mcpServers: {
        github: {
          transport: {
            type: "http",
            url: "https://api.githubcopilot.com/mcp/",
          },
        },
        "stave-local-mcp": {
          transport: {
            type: "http",
            url: "http://127.0.0.1:43127/mcp",
            headers: {
              Authorization: "Bearer old-token",
            },
          },
        },
      },
    });

    const status = await syncClaudeCodeMcpRegistration({
      autoRegister: false,
      manifest: null,
      settingsPath,
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(false);

    const saved = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(saved.mcpServers).toEqual({
      github: {
        transport: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
        },
      },
    });
  });

  test("reports stale registrations when the saved entry no longer matches the running manifest", async () => {
    const settingsPath = createTempSettingsPath({
      mcpServers: {
        "stave-local-mcp": {
          transport: {
            type: "http",
            url: "http://127.0.0.1:43127/mcp",
            headers: {
              Authorization: "Bearer old-token",
            },
          },
        },
      },
    });

    const status = await getClaudeCodeMcpRegistrationStatus({
      autoRegister: true,
      manifest: createManifest(),
      settingsPath,
    });

    expect(status.installed).toBe(true);
    expect(status.matchesCurrentManifest).toBe(false);
    expect(status.detail).toContain("stale");
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StaveLocalMcpManifest } from "@/lib/local-mcp";
import {
  getCodexMcpRegistrationStatus,
  syncCodexMcpRegistration,
} from "../electron/main/codex-mcp";

const tempDirs: string[] = [];

function createTempConfigPath(initial?: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "stave-codex-mcp-"));
  tempDirs.push(dir);
  const configPath = path.join(dir, "config.toml");
  if (initial !== undefined) {
    writeFileSync(configPath, initial);
  }
  return configPath;
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

describe("Codex MCP registration sync", () => {
  test("installs the managed Stave block without overwriting unrelated config", async () => {
    const configPath = createTempConfigPath([
      "model = \"gpt-5.4\"",
      "",
      "[mcp_servers.github]",
      "url = \"https://example.com/mcp\"",
      "",
    ].join("\n"));

    const status = await syncCodexMcpRegistration({
      autoRegister: true,
      manifest: createManifest(),
      configPath,
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(true);
    expect(status.matchesCurrentManifest).toBe(true);

    const saved = readFileSync(configPath, "utf8");
    expect(saved).toContain("model = \"gpt-5.4\"");
    expect(saved).toContain("[mcp_servers.github]");
    expect(saved).toContain("[mcp_servers.stave-local]");
    expect(saved).toContain("url = \"http://127.0.0.1:43127/mcp\"");
    expect(saved).toContain("bearer_token_env_var = \"STAVE_LOCAL_MCP_TOKEN\"");
  });

  test("removes only the managed Stave block when auto-registration is turned off", async () => {
    const configPath = createTempConfigPath([
      "[mcp_servers.github]",
      "url = \"https://example.com/mcp\"",
      "",
      "[mcp_servers.stave-local]",
      "url = \"http://127.0.0.1:43127/mcp\"",
      "bearer_token_env_var = \"STAVE_LOCAL_MCP_TOKEN\"",
      "",
    ].join("\n"));

    const status = await syncCodexMcpRegistration({
      autoRegister: false,
      manifest: null,
      configPath,
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(false);

    const saved = readFileSync(configPath, "utf8");
    expect(saved).toContain("[mcp_servers.github]");
    expect(saved).not.toContain("[mcp_servers.stave-local]");
  });

  test("reports stale registrations when the saved block no longer matches the running manifest", async () => {
    const configPath = createTempConfigPath([
      "[mcp_servers.stave-local]",
      "url = \"http://127.0.0.1:9999/mcp\"",
      "bearer_token_env_var = \"STAVE_LOCAL_MCP_TOKEN\"",
      "",
    ].join("\n"));

    const status = await getCodexMcpRegistrationStatus({
      autoRegister: true,
      manifest: createManifest(),
      configPath,
    });

    expect(status.installed).toBe(true);
    expect(status.matchesCurrentManifest).toBe(false);
    expect(status.detail).toContain("stale");
  });
});

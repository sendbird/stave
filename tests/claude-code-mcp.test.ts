import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StaveLocalMcpManifest } from "@/lib/local-mcp";
import {
  getClaudeCodeMcpRegistrationStatus,
  getClaudeCodeUserConfigPath,
  getLegacyClaudeCodeSettingsPaths,
  removeLegacyClaudeCodeSettingsEntry,
  syncClaudeCodeMcpRegistration,
} from "../electron/main/claude-code-mcp";

const tempDirs: string[] = [];

function createTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "stave-claude-mcp-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: Record<string, unknown>) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

/** `.claude.json` is the CLI's user-scope config; `settings.json` is legacy. */
function createTempConfigPath(initial?: Record<string, unknown>) {
  const configPath = path.join(createTempDir(), ".claude.json");
  if (initial) {
    writeJson(configPath, initial);
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

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

afterEach(() => {
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Claude Code MCP registration sync", () => {
  test("installs a flat user-scope entry without overwriting unrelated state", async () => {
    const configPath = createTempConfigPath({
      numStartups: 12,
      hasCompletedOnboarding: true,
      mcpServers: {
        github: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
          headers: {
            Authorization: "Bearer $GITHUB_MCP_TOKEN",
          },
        },
      },
    });
    const manifest = createManifest();

    const status = await syncClaudeCodeMcpRegistration({
      autoRegister: true,
      manifest,
      configPath,
      legacySettingsPaths: [],
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(true);
    expect(status.matchesCurrentManifest).toBe(true);
    expect(status.configPath).toBe(configPath);
    expect(status.transportType).toBe("http");
    expect(status.url).toBe(manifest.url);

    const saved = readJson(configPath);
    expect(saved.numStartups).toBe(12);
    expect(saved.hasCompletedOnboarding).toBe(true);
    expect(saved.mcpServers).toEqual({
      github: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: {
          Authorization: "Bearer $GITHUB_MCP_TOKEN",
        },
      },
      // Flat record: the CLI ignores a nested `transport` wrapper.
      "stave-local-mcp": {
        type: "http",
        url: manifest.url,
        headers: {
          Authorization: `Bearer ${manifest.token}`,
        },
      },
    });
  });

  test("creates the user config when it does not exist yet", async () => {
    const configPath = path.join(createTempDir(), "nested", ".claude.json");

    const status = await syncClaudeCodeMcpRegistration({
      autoRegister: true,
      manifest: createManifest(),
      configPath,
      legacySettingsPaths: [],
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(true);
    expect(Object.keys(readJson(configPath))).toEqual(["mcpServers"]);
  });

  test("removes only the managed Stave entry when auto-registration is turned off", async () => {
    const configPath = createTempConfigPath({
      mcpServers: {
        github: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
        },
        "stave-local-mcp": {
          type: "http",
          url: "http://127.0.0.1:43127/mcp",
          headers: {
            Authorization: "Bearer old-token",
          },
        },
      },
    });

    const status = await syncClaudeCodeMcpRegistration({
      autoRegister: false,
      manifest: null,
      configPath,
      legacySettingsPaths: [],
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(false);

    expect(readJson(configPath).mcpServers).toEqual({
      github: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
      },
    });
  });

  test("reports stale registrations when the saved entry no longer matches the running manifest", async () => {
    const configPath = createTempConfigPath({
      mcpServers: {
        "stave-local-mcp": {
          type: "http",
          url: "http://127.0.0.1:43127/mcp",
          headers: {
            Authorization: "Bearer old-token",
          },
        },
      },
    });

    const status = await getClaudeCodeMcpRegistrationStatus({
      autoRegister: true,
      manifest: createManifest(),
      configPath,
    });

    expect(status.installed).toBe(true);
    expect(status.matchesCurrentManifest).toBe(false);
    expect(status.detail).toContain("stale");
  });

  test("does not count a legacy nested-transport record as installed", async () => {
    // Earlier releases wrote this shape. The CLI never read it, so reporting
    // it as installed would hide exactly the failure this file exists to fix.
    const configPath = createTempConfigPath({
      mcpServers: {
        "stave-local-mcp": {
          transport: {
            type: "http",
            url: "http://127.0.0.1:43127/mcp",
            headers: { Authorization: "Bearer test-token" },
          },
        },
      },
    });

    const status = await getClaudeCodeMcpRegistrationStatus({
      autoRegister: true,
      manifest: createManifest(),
      configPath,
    });

    expect(status.matchesCurrentManifest).toBe(false);
    expect(status.transportType).toBeNull();
    expect(status.url).toBeNull();
  });

  test("migrates the managed entry out of legacy settings files while preserving other servers", async () => {
    const dir = createTempDir();
    const configPath = path.join(dir, ".claude.json");
    const legacySettingsPath = path.join(dir, "settings.json");
    const untouchedLegacyPath = path.join(dir, "other", "settings.json");
    writeJson(legacySettingsPath, {
      theme: "dark",
      mcpServers: {
        github: {
          transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
        },
        "stave-local-mcp": {
          transport: {
            type: "http",
            url: "http://127.0.0.1:43127/mcp",
            headers: { Authorization: "Bearer old-token" },
          },
        },
      },
    });

    const status = await syncClaudeCodeMcpRegistration({
      autoRegister: true,
      manifest: createManifest(),
      configPath,
      legacySettingsPaths: [legacySettingsPath, untouchedLegacyPath],
    });

    expect(status.error).toBeUndefined();
    expect(status.installed).toBe(true);
    expect(readJson(legacySettingsPath)).toEqual({
      theme: "dark",
      mcpServers: {
        github: {
          transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
        },
      },
    });
    // A legacy path that never existed must not be created by the migration.
    expect(existsSync(untouchedLegacyPath)).toBe(false);
  });

  test("drops an empty mcpServers table from legacy settings after removing the managed entry", async () => {
    const legacySettingsPath = path.join(createTempDir(), "settings.json");
    writeJson(legacySettingsPath, {
      theme: "dark",
      mcpServers: {
        "stave-local-mcp": {
          transport: { type: "http", url: "http://127.0.0.1:43127/mcp" },
        },
      },
    });

    expect(await removeLegacyClaudeCodeSettingsEntry(legacySettingsPath)).toBe(true);
    expect(readJson(legacySettingsPath)).toEqual({ theme: "dark" });
    expect(await removeLegacyClaudeCodeSettingsEntry(legacySettingsPath)).toBe(false);
  });

  test("leaves a malformed legacy settings file alone", async () => {
    const legacySettingsPath = path.join(createTempDir(), "settings.json");
    writeFileSync(legacySettingsPath, "{ not json");

    expect(await removeLegacyClaudeCodeSettingsEntry(legacySettingsPath)).toBe(false);
    expect(readFileSync(legacySettingsPath, "utf8")).toBe("{ not json");
  });
});

describe("Claude Code MCP config path resolution", () => {
  test("honors CLAUDE_CONFIG_DIR for the user config and legacy settings paths", async () => {
    const configDir = createTempDir();
    process.env.CLAUDE_CONFIG_DIR = configDir;

    expect(await getClaudeCodeUserConfigPath()).toBe(
      path.join(configDir, ".claude.json"),
    );
    const legacyPaths = await getLegacyClaudeCodeSettingsPaths();
    expect(legacyPaths[0]).toBe(path.join(configDir, "settings.json"));
    expect(legacyPaths).toContain(path.join(configDir, "settings.json"));
  });
});

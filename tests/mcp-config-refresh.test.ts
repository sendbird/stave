import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getClaudeMcpConfigPaths,
  getCodexMcpConfigPaths,
  getStaveLocalMcpManifestPath,
  McpConfigRefreshTracker,
} from "../electron/providers/mcp-config-refresh";

const tempDirectories: string[] = [];

async function makeTempDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "stave-mcp-config-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("MCP config refresh tracking", () => {
  test("uses the same configured provider homes as runtime processes", () => {
    expect(
      getClaudeMcpConfigPaths({
        cwd: "/tmp/workspace",
        claudeConfigDir: "/tmp/claude-home",
      }),
    ).toContain("/tmp/claude-home/settings.json");
    expect(
      getCodexMcpConfigPaths({
        cwd: "/tmp/workspace",
        codexHome: "/tmp/codex-home",
      }),
    ).toContain("/tmp/codex-home/config.toml");
  });

  test("tracks the stave-local manifest so a rebound port invalidates sessions", () => {
    const manifestPath = getStaveLocalMcpManifestPath();

    // Both runtimes hand the manifest's loopback URL to their native session,
    // so a manifest rewrite must count as an MCP config change for both.
    expect(
      getClaudeMcpConfigPaths({
        cwd: "/tmp/workspace",
        claudeConfigDir: "/tmp/claude-home",
      }),
    ).toContain(manifestPath);
    expect(
      getCodexMcpConfigPaths({
        cwd: "/tmp/workspace",
        codexHome: "/tmp/codex-home",
      }),
    ).toContain(manifestPath);
  });

  test("detects a config file created or changed between provider turns", async () => {
    const directory = await makeTempDirectory();
    const configPath = path.join(directory, "config.toml");
    const tracker = new McpConfigRefreshTracker();

    const args = { scopeKey: "codex:/tmp/codex-home", paths: [configPath] };
    expect((await tracker.check(args)).changed).toBe(false);
    await writeFile(configPath, "[mcp_servers.crane]\nurl = 'http://one'\n");
    expect((await tracker.check(args)).changed).toBe(true);
    expect((await tracker.check(args)).changed).toBe(false);

    await writeFile(
      configPath,
      "[mcp_servers.crane]\nurl = 'http://two-longer'\n",
    );
    expect((await tracker.check(args)).changed).toBe(true);
  });

  test("keeps workspace scopes independent and deduplicates concurrent checks", async () => {
    const directory = await makeTempDirectory();
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    const tracker = new McpConfigRefreshTracker();

    await Promise.all([
      tracker.check({ scopeKey: "claude:one", paths: [first] }),
      tracker.check({ scopeKey: "claude:one", paths: [first] }),
    ]);
    expect(
      (await tracker.check({ scopeKey: "claude:two", paths: [second] }))
        .changed,
    ).toBe(false);

    await writeFile(first, '{"mcpServers":{}}');
    expect(
      (await tracker.check({ scopeKey: "claude:one", paths: [first] })).changed,
    ).toBe(true);
    expect(
      (await tracker.check({ scopeKey: "claude:two", paths: [second] }))
        .changed,
    ).toBe(false);
  });

  test("uses the check interval as a cheap UI cache", async () => {
    const directory = await makeTempDirectory();
    const configPath = path.join(directory, "config.toml");
    const tracker = new McpConfigRefreshTracker();
    const args = {
      scopeKey: "codex:cache",
      paths: [configPath],
      minIntervalMs: 60_000,
    };

    await tracker.check(args);
    await writeFile(configPath, "[mcp_servers.crane]\n");
    expect((await tracker.check(args)).changed).toBe(false);
    expect((await tracker.check({ ...args, force: true })).changed).toBe(true);
  });
});

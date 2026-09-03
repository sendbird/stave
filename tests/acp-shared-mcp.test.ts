import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  claudeServerToAcpDescriptor,
  codexServerToAcpDescriptor,
  expandEnvReferences,
  filterAcpMcpServersForNativeRoutes,
  getAcpMcpServerFingerprint,
  mergeAcpMcpServers,
  parseCodexMcpServerRecords,
  resolveAcpSharedMcpServers,
  resolveAcpTurnMcpServers,
  resolveNativeMcpRouteIndex,
} from "../electron/providers/acp/acp-shared-mcp";

const tempDirectories: string[] = [];

async function makeTempDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "stave-acp-mcp-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("ACP shared MCP conversion", () => {
  test("expands environment references and drops unresolved values", () => {
    expect(
      expandEnvReferences("prefix ${WORKSPACE_ID}", {
        WORKSPACE_ID: "ws-1",
      }),
    ).toBe("prefix ws-1");

    const descriptor = claudeServerToAcpDescriptor({
      name: "docs",
      config: {
        type: "stdio",
        command: "npx",
        args: ["-y", "docs-mcp"],
        env: { WORKSPACE_ID: "${WORKSPACE_ID}", EMPTY: "${MISSING}" },
      },
      env: { WORKSPACE_ID: "ws-1" },
    });

    expect(descriptor).toEqual({
      name: "docs",
      command: "npx",
      args: ["-y", "docs-mcp"],
      env: [{ name: "WORKSPACE_ID", value: "ws-1" }],
    });
  });

  test("skips protected, SSE, and disabled Codex servers", () => {
    expect(
      claudeServerToAcpDescriptor({
        name: "stave-local-mcp",
        config: { type: "http", url: "http://127.0.0.1:9/mcp" },
        env: {},
      }),
    ).toBeNull();
    expect(
      claudeServerToAcpDescriptor({
        name: "legacy",
        config: { type: "sse", url: "https://mcp.example.test/sse" },
        env: {},
      }),
    ).toBeNull();
    expect(
      codexServerToAcpDescriptor({
        server: {
          name: "off",
          enabled: false,
          command: "npx",
          args: [],
          envVars: [],
          env: {},
          headerEnvBindings: {},
        },
        env: {},
      }),
    ).toBeNull();
  });

  test("parses Codex user servers and prefers Claude when names collide", async () => {
    const root = await makeTempDirectory();
    const claudeConfigDir = path.join(root, "claude");
    const codexHome = path.join(root, "codex");
    const cwd = path.join(root, "workspace");
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          docs: {
            command: "claude-docs",
            args: ["--from-claude"],
            env: { WORKSPACE_ID: "${WORKSPACE_ID}" },
          },
        },
      }),
    );
    await writeFile(
      path.join(codexHome, "config.toml"),
      `
[mcp_servers.docs]
command = "codex-docs"
args = ["--from-codex"]

[mcp_servers.linear]
url = "https://mcp.linear.test/mcp"
env_http_headers = { "X-Workspace" = "LINEAR_WORKSPACE" }
`,
    );

    const servers = await resolveAcpSharedMcpServers({
      cwd,
      claudeConfigDir,
      codexHome,
      env: {
        WORKSPACE_ID: "ws-1",
        LINEAR_WORKSPACE: "acme",
      },
      resolveEnv: () => null,
    });

    expect(servers).toEqual([
      {
        name: "docs",
        command: "claude-docs",
        args: ["--from-claude"],
        env: [{ name: "WORKSPACE_ID", value: "ws-1" }],
      },
      {
        type: "http",
        name: "linear",
        url: "https://mcp.linear.test/mcp",
        headers: [{ name: "X-Workspace", value: "acme" }],
      },
    ]);
  });

  test("parses Codex env_vars and later servers do not replace an earlier name", () => {
    const parsed = parseCodexMcpServerRecords(`
[mcp_servers.docs]
command = "npx"
args = ["-y", "docs-mcp"]
env_vars = ["DOCS_KEY"]

[mcp_servers.docs.env]
WORKSPACE = "acme"
`);
    expect(parsed).toEqual([
      {
        name: "docs",
        enabled: true,
        command: "npx",
        args: ["-y", "docs-mcp"],
        envVars: ["DOCS_KEY"],
        env: { WORKSPACE: "acme" },
        headerEnvBindings: {},
      },
    ]);
    expect(
      mergeAcpMcpServers([
        { name: "docs", command: "first", args: [], env: [] },
        { name: "Docs", command: "second", args: [], env: [] },
      ]),
    ).toEqual([{ name: "docs", command: "first", args: [], env: [] }]);
  });

  test("keeps native Cursor routes authoritative by name and safe identity", async () => {
    const root = await makeTempDirectory();
    const homeDirectory = path.join(root, "home");
    const cwd = path.join(root, "workspace");
    await mkdir(path.join(homeDirectory, ".cursor"), { recursive: true });
    await mkdir(path.join(cwd, ".cursor"), { recursive: true });
    await writeFile(
      path.join(homeDirectory, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          docs: { command: "user-docs", args: [] },
          nativeSearch: {
            url: "https://mcp.example.test/search?token=private",
            headers: { Authorization: "Bearer private" },
          },
        },
      }),
    );
    await writeFile(
      path.join(cwd, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          docs: { disabled: true },
        },
      }),
    );

    const nativeRoutes = await resolveNativeMcpRouteIndex({
      targetProvider: "cursor",
      cwd,
      homeDirectory,
    });
    const servers = filterAcpMcpServersForNativeRoutes({
      nativeRoutes,
      servers: [
        { name: "Docs", command: "shared-docs", args: [], env: [] },
        {
          type: "http",
          name: "search-copy",
          url: "https://mcp.example.test/search",
          headers: [{ name: "authorization", value: "Bearer other" }],
        },
        { name: "git", command: "git-mcp", args: [], env: [] },
      ],
    });

    expect(servers).toEqual([
      { name: "git", command: "git-mcp", args: [], env: [] },
    ]);
    expect(nativeRoutes.names).toContain("docs");
    expect([...nativeRoutes.fingerprints]).not.toContain("private");
  });

  test("merges the same connector identity even when provider names differ", () => {
    expect(
      mergeAcpMcpServers([
        {
          type: "http",
          name: "claude-search",
          url: "https://mcp.example.test/search",
          headers: [{ name: "Authorization", value: "Bearer first" }],
        },
        {
          type: "http",
          name: "codex-search",
          url: "https://mcp.example.test/search",
          headers: [{ name: "authorization", value: "Bearer second" }],
        },
      ]),
    ).toEqual([
      {
        type: "http",
        name: "claude-search",
        url: "https://mcp.example.test/search",
        headers: [{ name: "Authorization", value: "Bearer first" }],
      },
    ]);
  });

  test("does not inject Kiro-native routes but preserves Stave Local MCP", async () => {
    const root = await makeTempDirectory();
    const homeDirectory = path.join(root, "home");
    const claudeConfigDir = path.join(root, "claude");
    const codexHome = path.join(root, "codex");
    const cwd = path.join(root, "workspace");
    await mkdir(path.join(homeDirectory, ".kiro", "settings"), {
      recursive: true,
    });
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(homeDirectory, ".kiro", "settings", "mcp.json"),
      JSON.stringify({
        mcpServers: { docs: { command: "kiro-docs", args: [] } },
      }),
    );
    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          docs: { command: "claude-docs", args: [] },
          git: { command: "git-mcp", args: [] },
        },
      }),
    );

    const servers = await resolveAcpTurnMcpServers({
      targetProvider: "kiro",
      cwd,
      homeDirectory,
      claudeConfigDir,
      codexHome,
      staveLocalMcpServers: [
        { name: "stave-local-mcp", command: "stave", args: [], env: [] },
      ],
    });

    expect(servers).toEqual([
      { name: "git", command: "git-mcp", args: [], env: [] },
      { name: "stave-local-mcp", command: "stave", args: [], env: [] },
    ]);
    expect(
      getAcpMcpServerFingerprint({
        name: "ignored",
        command: "git-mcp",
        args: [],
        env: [],
      }),
    ).toHaveLength(64);
  });

  test("fails closed when a target native MCP file cannot be parsed", async () => {
    const root = await makeTempDirectory();
    const homeDirectory = path.join(root, "home");
    const claudeConfigDir = path.join(root, "claude");
    const codexHome = path.join(root, "codex");
    const cwd = path.join(root, "workspace");
    await mkdir(path.join(homeDirectory, ".cursor"), { recursive: true });
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(homeDirectory, ".cursor", "mcp.json"), "{");
    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      JSON.stringify({
        mcpServers: { docs: { command: "claude-docs", args: [] } },
      }),
    );

    const servers = await resolveAcpTurnMcpServers({
      targetProvider: "cursor",
      cwd,
      homeDirectory,
      claudeConfigDir,
      codexHome,
      staveLocalMcpServers: [
        { name: "stave-local-mcp", command: "stave", args: [], env: [] },
      ],
    });

    expect(servers).toEqual([
      { name: "stave-local-mcp", command: "stave", args: [], env: [] },
    ]);
  });

  test("fails closed when native mcpServers is not an object", async () => {
    const root = await makeTempDirectory();
    const homeDirectory = path.join(root, "home");
    const cwd = path.join(root, "workspace");
    await mkdir(path.join(homeDirectory, ".kiro", "settings"), {
      recursive: true,
    });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(homeDirectory, ".kiro", "settings", "mcp.json"),
      JSON.stringify({ mcpServers: [] }),
    );

    const servers = await resolveAcpTurnMcpServers({
      targetProvider: "kiro",
      cwd,
      homeDirectory,
      staveLocalMcpServers: [
        { name: "stave-local-mcp", command: "stave", args: [], env: [] },
      ],
    });

    expect(servers).toEqual([
      { name: "stave-local-mcp", command: "stave", args: [], env: [] },
    ]);
  });
});

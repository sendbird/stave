import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveClaudeMcpServers,
  type ClaudeMcpConfigDiagnostic,
} from "../electron/providers/claude-mcp-config";

const tempDirectories: string[] = [];
const staveServers = {
  "stave-local-mcp": {
    type: "http" as const,
    url: "http://127.0.0.1:43123/mcp",
    headers: {
      Authorization: "Bearer <stave-token>",
    },
  },
};

async function makeTempDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "stave-claude-mcp-"));
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

describe("Claude MCP config merging", () => {
  test("merges user, project, local, and Stave servers with native precedence", async () => {
    const root = await makeTempDirectory();
    const claudeConfigDir = path.join(root, "claude-config");
    const cwd = path.join(root, "workspace");
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          "user-only": {
            type: "http",
            url: "https://user.example.test/mcp",
            headers: {
              Authorization: "Bearer <user-token>",
            },
          },
          precedence: {
            command: "user-command",
          },
          "stave-local-mcp": {
            type: "http",
            url: "https://stale.example.test/mcp",
          },
        },
        projects: {
          [cwd]: {
            mcpServers: {
              "local-only": {
                command: "local-command",
                args: ["--local"],
              },
              precedence: {
                command: "local-command",
              },
            },
          },
        },
      }),
    );
    await writeFile(
      path.join(cwd, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "project-only": {
            type: "sse",
            url: "https://project.example.test/events",
          },
          precedence: {
            command: "project-command",
          },
        },
      }),
    );

    const overrides: Array<{
      serverName: string;
      replacedSource: "user" | "project" | "local";
    }> = [];
    const resolved = await resolveClaudeMcpServers({
      cwd,
      claudeConfigDir,
      staveServers,
      onStaveOverride: (override) => overrides.push(override),
    });

    expect(resolved).toEqual({
      "user-only": {
        type: "http",
        url: "https://user.example.test/mcp",
        headers: {
          Authorization: "Bearer <user-token>",
        },
      },
      precedence: {
        type: "stdio",
        command: "local-command",
      },
      "stave-local-mcp": staveServers["stave-local-mcp"],
      "project-only": {
        type: "sse",
        url: "https://project.example.test/events",
      },
      "local-only": {
        type: "stdio",
        command: "local-command",
        args: ["--local"],
      },
    });
    expect(overrides).toEqual([
      {
        serverName: "stave-local-mcp",
        replacedSource: "user",
      },
    ]);
  });

  test("keeps strict mode isolated to Stave-owned servers", async () => {
    const root = await makeTempDirectory();
    const claudeConfigDir = path.join(root, "claude-config");
    const cwd = path.join(root, "workspace");
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      "{ invalid config with <private-value>",
    );

    const diagnostics: ClaudeMcpConfigDiagnostic[] = [];
    expect(
      await resolveClaudeMcpServers({
        cwd,
        claudeConfigDir,
        staveServers,
        strict: true,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).toEqual(staveServers);
    expect(diagnostics).toEqual([]);
  });

  test("omits programmatic MCP config when Stave local MCP is unavailable", async () => {
    const root = await makeTempDirectory();
    const claudeConfigDir = path.join(root, "claude-config");
    const cwd = path.join(root, "workspace");
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          native: {
            command: "native-command",
          },
        },
      }),
    );

    expect(
      await resolveClaudeMcpServers({
        cwd,
        claudeConfigDir,
      }),
    ).toBeUndefined();
  });

  test("reports invalid files without including their contents", async () => {
    const root = await makeTempDirectory();
    const claudeConfigDir = path.join(root, "claude-config");
    const cwd = path.join(root, "workspace");
    await mkdir(claudeConfigDir, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(claudeConfigDir, ".claude.json"),
      '{ "mcpServers": { "private": { "headers": "<private-value>" }',
    );

    const diagnostics: ClaudeMcpConfigDiagnostic[] = [];
    const resolved = await resolveClaudeMcpServers({
      cwd,
      claudeConfigDir,
      staveServers,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(resolved).toEqual(staveServers);
    expect(diagnostics).toEqual([
      {
        kind: "invalid-json",
        source: "user",
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("<private-value>");
  });
});

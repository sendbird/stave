import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  collectClaudeMcpEnvVarNames,
  collectCodexMcpEnvVarNames,
  readMcpEnvVarNames,
} from "../electron/providers/mcp-env";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function writeJsonFixture(fileName: string, value: unknown) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-mcp-env-"));
  tempDirectories.push(directory);
  const filePath = path.join(directory, fileName);
  writeFileSync(filePath, JSON.stringify(value), "utf8");
  return filePath;
}

describe("MCP environment variable discovery", () => {
  test("collects only enabled Codex MCP credential bindings", () => {
    const names = collectCodexMcpEnvVarNames(`
      [mcp_servers.ibis]
      url = "https://example.test/mcp"
      bearer_token_env_var = "ATELIER_MCP_TOKEN"
      env_http_headers = { "X-Api-Key" = "ATELIER_HEADER" }

      [mcp_servers.local]
      command = "local-mcp"
      env_vars = ["LOCAL_TOKEN", 'SECOND_TOKEN']

      [mcp_servers.disabled]
      enabled = false
      bearer_token_env_var = "DISABLED_TOKEN"
      env_vars = ["DISABLED_ENV"]
    `);

    expect(names).toEqual([
      "ATELIER_HEADER",
      "ATELIER_MCP_TOKEN",
      "LOCAL_TOKEN",
      "SECOND_TOKEN",
    ]);
  });

  test("collects Claude stdio and remote environment references", () => {
    const names = collectClaudeMcpEnvVarNames({
      mcpServers: {
        remote: {
          url: "https://example.test/mcp",
          headers: {
            Authorization: "Bearer ${REMOTE_TOKEN}",
            "X-Api-Key": "${HEADER_TOKEN}",
            Literal: "not-a-reference",
          },
        },
        stdio: {
          command: "stdio-mcp",
          env: {
            API_TOKEN: "${API_TOKEN}",
            OTHER_TOKEN: "$OTHER_TOKEN",
            Literal: "not-a-reference",
          },
        },
        wrapped: {
          transport: {
            type: "http",
            headers: { Authorization: "Bearer ${WRAPPED_TOKEN}" },
          },
        },
      },
    });

    expect(names).toEqual([
      "API_TOKEN",
      "HEADER_TOKEN",
      "OTHER_TOKEN",
      "REMOTE_TOKEN",
      "WRAPPED_TOKEN",
    ]);
  });

  test("collects Claude local project bindings only for the active directory", () => {
    const document = {
      projects: {
        "/workspace/current": {
          mcpServers: {
            local: {
              env: { CURRENT_TOKEN: "${CURRENT_TOKEN}" },
            },
          },
        },
        "/workspace/other": {
          mcpServers: {
            other: {
              env: { OTHER_TOKEN: "${OTHER_TOKEN}" },
            },
          },
        },
      },
    };

    expect(
      collectClaudeMcpEnvVarNames(document, { cwd: "/workspace/current" }),
    ).toEqual(["CURRENT_TOKEN"]);
  });

  test("leaves the path variables Claude Code fills in for plugins to Claude", () => {
    expect(
      collectClaudeMcpEnvVarNames({
        mcpServers: {
          bundled: {
            command: "${CLAUDE_PLUGIN_ROOT}/server",
            env: {
              DATA_DIR: "${CLAUDE_PLUGIN_DATA}",
              PROJECT: "${CLAUDE_PROJECT_DIR}",
              API_TOKEN: "${PLUGIN_API_TOKEN}",
            },
          },
        },
      }),
    ).toEqual(["PLUGIN_API_TOKEN"]);
  });

  test("reads inline server maps a plugin manifest lists beside file paths", () => {
    expect(
      collectClaudeMcpEnvVarNames({
        name: "remote",
        mcpServers: [
          "./mcp/servers.json",
          { remote: { headers: { Authorization: "Bearer ${INLINE_TOKEN}" } } },
        ],
      }),
    ).toEqual(["INLINE_TOKEN"]);
  });

  test("reads a plugin MCP document whose root is the server map", () => {
    const remote = {
      remote: {
        type: "http",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer ${ATELIER_MCP_TOKEN}" },
      },
    };
    const wrapped = writeJsonFixture(".mcp.json", { mcpServers: remote });
    const bare = writeJsonFixture(".mcp.json", remote);
    const named = writeJsonFixture("servers.json", remote);
    // Settings files keep servers under `mcpServers`; their other top-level
    // entries are never read as servers.
    const settings = writeJsonFixture("settings.json", {
      statusLine: { env: { STATUS_TOKEN: "${STATUS_TOKEN}" } },
    });

    for (const filePath of [wrapped, bare, named]) {
      expect(
        readMcpEnvVarNames({ provider: "claude", paths: [filePath] }),
      ).toEqual(["ATELIER_MCP_TOKEN"]);
    }
    expect(
      readMcpEnvVarNames({ provider: "claude", paths: [settings] }),
    ).toEqual([]);
  });

  test("collects Claude references in every field Claude Code expands", () => {
    expect(
      collectClaudeMcpEnvVarNames({
        mcpServers: {
          remote: {
            type: "http",
            url: "https://${MCP_HOST}/mcp?key=${URL_KEY:-}",
            headers: { Authorization: "Bearer ${HEADER_TOKEN:-anonymous}" },
          },
          stdio: {
            command: "${TOOL_HOME}/bin/server",
            args: ["--token", "${ARG_TOKEN}", "$LITERAL_ARG", "${user_config.api_key}"],
          },
        },
      }),
    ).toEqual([
      "ARG_TOKEN",
      "HEADER_TOKEN",
      "MCP_HOST",
      "TOOL_HOME",
      "URL_KEY",
    ]);
  });
});

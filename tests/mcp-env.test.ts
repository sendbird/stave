import { describe, expect, test } from "bun:test";
import {
  collectClaudeMcpEnvVarNames,
  collectCodexMcpEnvVarNames,
} from "../electron/providers/mcp-env";

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
});

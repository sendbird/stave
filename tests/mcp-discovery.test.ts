import { describe, expect, test } from "bun:test";
import {
  discoverClaudeEntries,
  discoverCodexEntries,
} from "../electron/main/mcp-discovery";

describe("MCP discovery", () => {
  test("normalizes Claude stdio and HTTP configuration without exposing values", () => {
    expect(
      discoverClaudeEntries({
        source: "claude-user",
        document: {
          mcpServers: {
            crane: { command: "crane", env: { TOKEN: "secret" } },
            remote: { url: "https://mcp.example.test" },
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({ name: "crane", transport: "stdio" }),
      expect.objectContaining({ name: "remote", transport: "http" }),
    ]);
  });

  test("finds Codex server sections without returning credentials", () => {
    expect(
      discoverCodexEntries(
        '[mcp_servers.crane]\ncommand = "crane"\n[mcp_servers.remote]\nurl = "https://example.test"\nbearer_token_env_var = "TOKEN"',
      ),
    ).toEqual([
      expect.objectContaining({ name: "crane", transport: "stdio" }),
      expect.objectContaining({ name: "remote", transport: "http" }),
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import { buildMcpServerOverviews } from "@/lib/providers/mcp-management";
import type { CodexMcpServerStatusSnapshot } from "@/lib/providers/provider.types";

function codexServer(
  patch: Partial<CodexMcpServerStatusSnapshot> & { name: string },
): CodexMcpServerStatusSnapshot {
  return {
    enabled: true,
    disabledReason: null,
    transportType: "streamable_http",
    url: "https://mcp.example.test",
    bearerTokenEnvVar: null,
    authStatus: null,
    startupTimeoutSec: null,
    toolTimeoutSec: null,
    ...patch,
  };
}

describe("MCP management overviews", () => {
  test("distinguishes an authenticated OAuth transport from a login requirement", () => {
    const [server] = buildMcpServerOverviews({
      codexServers: [
        codexServer({
          name: "github",
          authStatus: "oAuth",
          tools: [{ name: "search_code" }],
        }),
      ],
    });

    expect(server?.codex).toMatchObject({
      configured: true,
      state: "connected",
      canAuthenticate: false,
    });
  });

  test.each(["notLoggedIn", "not_logged_in"])(
    "recognizes %s as a Codex login requirement",
    (authStatus) => {
      const [server] = buildMcpServerOverviews({
        codexServers: [
          codexServer({
            name: "github",
            authStatus,
          }),
        ],
      });

      expect(server?.codex).toMatchObject({
        state: "needs-auth",
        canAuthenticate: true,
        detail: "Streamable HTTP · Not signed in",
      });
    },
  );

  test("puts authentication and connection failures before healthy servers", () => {
    const servers = buildMcpServerOverviews({
      claudeServers: [
        {
          name: "healthy",
          status: "connected",
          toolCount: 2,
        },
      ],
      codexServers: [
        codexServer({
          name: "reauth",
          connectionStatus: "needs-auth",
          failureReason: "reauthenticationRequired",
          lastError: "OAuth reauthentication is required.",
        }),
      ],
    });

    expect(servers.map((server) => server.name)).toEqual(["reauth", "healthy"]);
    expect(servers[0]?.codex).toMatchObject({
      state: "needs-auth",
      canAuthenticate: true,
    });
  });

  test("keeps a recent error visible after the current connection recovers", () => {
    const [server] = buildMcpServerOverviews({
      claudeServers: [
        {
          name: "linear",
          status: "connected",
          lastError: "Previous handshake failed.",
          lastErrorAt: 42,
          statusUpdatedAt: 84,
        },
      ],
    });

    expect(server?.claude).toMatchObject({
      state: "connected",
      lastError: "Previous handshake failed.",
      lastErrorAt: 42,
      statusUpdatedAt: 84,
    });
  });

  test("includes local configuration entries before runtime status is available", () => {
    const [server] = buildMcpServerOverviews({
      configuredServers: [
        {
          id: "claude-code:local:docs",
          provider: "claude-code",
          scope: "local",
          name: "docs",
          revision: "revision-1",
          transport: "stdio",
          command: "docs-server",
          urlRedacted: false,
          envVars: [],
          headerEnvBindings: [],
          enabled: true,
          argumentCount: 0,
          hiddenValueCount: 0,
          sourceLabel: "Claude local project",
          canEdit: true,
          canDelete: true,
        },
      ],
    });

    expect(server).toMatchObject({
      name: "docs",
      sources: ["claude-local"],
      transport: "stdio",
      claude: { configured: true, state: "configured" },
    });
  });
});

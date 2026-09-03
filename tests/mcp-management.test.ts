import { describe, expect, test } from "bun:test";
import {
  buildMcpServerOverviews,
  resolveMcpAcpAvailability,
} from "@/lib/providers/mcp-management";
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
      acpAvailability: "portable",
      claude: { configured: true, state: "configured" },
    });
  });

  test("classifies remote Cursor config as a target-native route", () => {
    const [server] = buildMcpServerOverviews({
      configuredServers: [
        {
          id: "cursor:project:slack",
          provider: "cursor",
          scope: "project",
          name: "slack",
          revision: "revision-1",
          transport: "http",
          url: "https://mcp.example.test/mcp",
          urlRedacted: false,
          envVars: [],
          headerEnvBindings: [],
          enabled: true,
          argumentCount: 0,
          hiddenValueCount: 0,
          sourceLabel: "Cursor project",
          canEdit: true,
          canDelete: true,
        },
      ],
    });

    expect(server).toMatchObject({
      name: "slack",
      sources: ["cursor-project"],
      acpAvailability: "target-native",
      cursor: {
        provider: "cursor",
        configured: true,
        state: "configured",
        canAuthenticate: true,
      },
    });
    expect(server?.claude.configured).toBe(false);
    expect(server?.codex.configured).toBe(false);
  });

  test("includes Kiro native configuration and disabled state", () => {
    const [server] = buildMcpServerOverviews({
      configuredServers: [
        {
          id: "kiro:user:docs",
          provider: "kiro",
          scope: "user",
          name: "docs",
          revision: "revision-1",
          transport: "stdio",
          command: "docs-server",
          urlRedacted: false,
          envVars: [],
          headerEnvBindings: [],
          enabled: false,
          argumentCount: 0,
          hiddenValueCount: 0,
          sourceLabel: "Kiro user",
          canEdit: true,
          canDelete: true,
        },
      ],
    });

    expect(server).toMatchObject({
      sources: ["kiro-user"],
      acpAvailability: "not-forwarded",
      kiro: {
        provider: "kiro",
        configured: true,
        state: "disabled",
        canAuthenticate: false,
      },
    });
  });

  test("marks a provider-hosted connector without native config as provider-only", () => {
    const [server] = buildMcpServerOverviews({
      claudeServers: [
        {
          name: "claude_ai_Slack",
          status: "connected",
          toolCount: 8,
        },
      ],
    });

    expect(server).toMatchObject({
      name: "claude_ai_Slack",
      sources: [],
      acpAvailability: "provider-managed",
      claude: { state: "connected" },
    });
  });

  test("forwards only enabled stdio and HTTP native configurations to ACP", () => {
    const base = {
      id: "claude-code:user:slack",
      provider: "claude-code" as const,
      scope: "user" as const,
      name: "slack",
      revision: "revision-1",
      urlRedacted: false,
      envVars: [],
      headerEnvBindings: [],
      enabled: true,
      argumentCount: 0,
      hiddenValueCount: 0,
      sourceLabel: "Claude user",
      canEdit: true,
      canDelete: true,
    };

    expect(
      resolveMcpAcpAvailability([{ ...base, transport: "http" }]),
    ).toBe("portable");
    expect(
      resolveMcpAcpAvailability([{ ...base, transport: "stdio" }]),
    ).toBe("portable");
    expect(
      resolveMcpAcpAvailability([{ ...base, transport: "sse" }]),
    ).toBe("not-forwarded");
    expect(
      resolveMcpAcpAvailability([
        { ...base, transport: "http", enabled: false },
      ]),
    ).toBe("not-forwarded");
  });
});

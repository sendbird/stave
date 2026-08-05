import type {
  ClaudeMcpServerStatusSnapshot,
  CodexMcpServerStatusSnapshot,
  McpDiscoveredServer,
} from "./provider.types";
import type { McpServerConfigSnapshot } from "./mcp-config.types";
import {
  CONNECTED_TOOL_IDS,
  getConnectedToolLabel,
  matchesConnectedTool,
  type ConnectedToolId,
} from "./connected-tool-status";

export type McpConnectionState =
  | "connected"
  | "starting"
  | "needs-auth"
  | "failed"
  | "disabled"
  | "configured"
  | "not-configured"
  | "unknown";

export type McpProviderOverview = {
  provider: "claude-code" | "codex";
  configured: boolean;
  state: McpConnectionState;
  label: string;
  canAuthenticate: boolean;
  detail?: string;
  lastError?: string;
  lastErrorAt?: number;
  statusUpdatedAt?: number;
  toolCount?: number;
};

export type McpServerOverview = {
  name: string;
  sources: McpDiscoveredServer["sources"];
  transport: McpDiscoveredServer["transport"] | string;
  claude: McpProviderOverview;
  codex: McpProviderOverview;
};

function getMcpConnectionLabel(state: McpConnectionState) {
  switch (state) {
    case "connected":
      return "Connected";
    case "starting":
      return "Starting";
    case "needs-auth":
      return "Sign in required";
    case "failed":
      return "Failed";
    case "disabled":
      return "Disabled";
    case "configured":
      return "Configured";
    case "not-configured":
      return "Not configured";
    default:
      return "Status unavailable";
  }
}

function normalizeMcpStatusToken(value?: string | null) {
  return value?.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase() ?? "";
}

export function formatMcpTransportLabel(value: string) {
  switch (normalizeMcpStatusToken(value)) {
    case "streamablehttp":
      return "Streamable HTTP";
    case "http":
      return "HTTP";
    case "sse":
      return "SSE";
    case "stdio":
      return "stdio";
    default:
      return value === "unknown" ? "Transport unknown" : value;
  }
}

function formatCodexMcpAuthStatus(value?: string | null) {
  switch (normalizeMcpStatusToken(value)) {
    case "oauth":
      return "OAuth";
    case "bearertoken":
      return "Bearer token";
    case "notauthenticated":
    case "notloggedin":
    case "unauthenticated":
      return "Not signed in";
    case "unsupported":
      return "OAuth unavailable";
    default:
      return value ?? undefined;
  }
}

function isCodexAuthenticationRequired(server: CodexMcpServerStatusSnapshot) {
  if (server.connectionStatus === "needs-auth") {
    return true;
  }
  if (
    normalizeMcpStatusToken(server.failureReason) === "reauthenticationrequired"
  ) {
    return true;
  }
  const authStatus = normalizeMcpStatusToken(server.authStatus);
  return [
    "notauthenticated",
    "notloggedin",
    "unauthenticated",
    "oauthrequired",
    "needsauth",
    "loginrequired",
  ].includes(authStatus);
}

function toClaudeOverview(args: {
  configured: boolean;
  server?: ClaudeMcpServerStatusSnapshot;
}): McpProviderOverview {
  if (!args.configured && !args.server) {
    return {
      provider: "claude-code",
      configured: false,
      state: "not-configured",
      label: getMcpConnectionLabel("not-configured"),
      canAuthenticate: false,
    };
  }

  const state: McpConnectionState =
    args.server?.status === "connected"
      ? "connected"
      : args.server?.status === "pending"
        ? "starting"
        : args.server?.status === "needs-auth"
          ? "needs-auth"
          : args.server?.status === "failed"
            ? "failed"
            : args.server?.status === "disabled"
              ? "disabled"
              : "configured";

  return {
    provider: "claude-code",
    configured: true,
    state,
    label: getMcpConnectionLabel(state),
    canAuthenticate: state === "needs-auth",
    ...(args.server?.scope ? { detail: args.server.scope } : {}),
    ...(args.server?.lastError || args.server?.error
      ? { lastError: args.server.lastError ?? args.server.error }
      : {}),
    ...(args.server?.lastErrorAt
      ? { lastErrorAt: args.server.lastErrorAt }
      : {}),
    ...(args.server?.statusUpdatedAt
      ? { statusUpdatedAt: args.server.statusUpdatedAt }
      : {}),
    ...(typeof args.server?.toolCount === "number"
      ? { toolCount: args.server.toolCount }
      : {}),
  };
}

function toCodexOverview(args: {
  configured: boolean;
  server?: CodexMcpServerStatusSnapshot;
}): McpProviderOverview {
  if (!args.configured && !args.server) {
    return {
      provider: "codex",
      configured: false,
      state: "not-configured",
      label: getMcpConnectionLabel("not-configured"),
      canAuthenticate: false,
    };
  }

  const server = args.server;
  const authenticationRequired = server
    ? isCodexAuthenticationRequired(server)
    : false;
  const state: McpConnectionState = !server
    ? "configured"
    : !server.enabled || server.connectionStatus === "disabled"
      ? "disabled"
      : authenticationRequired
        ? "needs-auth"
        : server.connectionStatus === "connected"
          ? "connected"
          : server.connectionStatus === "starting"
            ? "starting"
            : server.connectionStatus === "failed" ||
                server.connectionStatus === "cancelled"
              ? "failed"
              : server.tools?.length ||
                  server.resources?.length ||
                  server.resourceTemplates?.length
                ? "connected"
                : server.connectionStatus === "unknown"
                  ? "unknown"
                  : "configured";

  const detail = server
    ? [
        formatMcpTransportLabel(server.transportType),
        formatCodexMcpAuthStatus(server.authStatus),
      ]
        .filter((value): value is string => Boolean(value))
        .join(" · ")
    : undefined;
  return {
    provider: "codex",
    configured: true,
    state,
    label: getMcpConnectionLabel(state),
    canAuthenticate: state === "needs-auth",
    ...(detail ? { detail } : {}),
    ...(server?.lastError ? { lastError: server.lastError } : {}),
    ...(server?.lastErrorAt ? { lastErrorAt: server.lastErrorAt } : {}),
    ...(server?.statusUpdatedAt
      ? { statusUpdatedAt: server.statusUpdatedAt }
      : {}),
    ...(server?.tools ? { toolCount: server.tools.length } : {}),
  };
}

function getMcpOverviewPriority(server: McpServerOverview) {
  const states = [server.claude.state, server.codex.state];
  if (states.includes("failed")) return 0;
  if (states.includes("needs-auth")) return 1;
  if (states.includes("starting")) return 2;
  if (states.includes("connected")) return 3;
  return 4;
}

export function buildMcpServerOverviews(args: {
  discoveredServers?: McpDiscoveredServer[];
  configuredServers?: McpServerConfigSnapshot[];
  claudeServers?: ClaudeMcpServerStatusSnapshot[];
  codexServers?: CodexMcpServerStatusSnapshot[];
}): McpServerOverview[] {
  const discoveredByName = new Map<string, McpDiscoveredServer>();
  for (const server of args.discoveredServers ?? []) {
    discoveredByName.set(server.name, {
      ...server,
      sources: [...server.sources],
      claude: { ...server.claude },
      codex: { ...server.codex },
    });
  }
  for (const server of args.configuredServers ?? []) {
    const source =
      server.provider === "codex"
        ? ("codex-user" as const)
        : server.scope === "user"
          ? ("claude-user" as const)
          : server.scope === "local"
            ? ("claude-local" as const)
            : ("claude-project" as const);
    const existing = discoveredByName.get(server.name);
    if (!existing) {
      discoveredByName.set(server.name, {
        name: server.name,
        sources: [source],
        claude: { configured: server.provider === "claude-code" },
        codex: { configured: server.provider === "codex" },
        transport: server.transport,
      });
      continue;
    }
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.claude.configured ||= server.provider === "claude-code";
    existing.codex.configured ||= server.provider === "codex";
    if (existing.transport !== server.transport) existing.transport = "unknown";
  }
  const claudeByName = new Map(
    (args.claudeServers ?? []).map((server) => [server.name, server]),
  );
  const codexByName = new Map(
    (args.codexServers ?? []).map((server) => [server.name, server]),
  );
  const names = new Set([
    ...discoveredByName.keys(),
    ...claudeByName.keys(),
    ...codexByName.keys(),
  ]);

  return [...names]
    .map((name): McpServerOverview => {
      const discovered = discoveredByName.get(name);
      const claude = claudeByName.get(name);
      const codex = codexByName.get(name);
      return {
        name,
        sources: discovered?.sources ?? [],
        transport:
          discovered?.transport ??
          (codex?.transportType && codex.transportType !== "unknown"
            ? codex.transportType
            : "unknown"),
        claude: toClaudeOverview({
          configured: Boolean(discovered?.claude.configured || claude),
          server: claude,
        }),
        codex: toCodexOverview({
          configured: Boolean(discovered?.codex.configured || codex),
          server: codex,
        }),
      };
    })
    .sort(
      (left, right) =>
        getMcpOverviewPriority(left) - getMcpOverviewPriority(right) ||
        left.name.localeCompare(right.name),
    );
}

export type ConnectedToolOverview = {
  id: ConnectedToolId;
  label: string;
  state: McpConnectionState;
  stateLabel: string;
  /** Server names backing this connector, best-first. */
  serverNames: string[];
};

/** Index = preference. The first state found across candidates wins. */
const CONNECTED_TOOL_STATE_PREFERENCE: McpConnectionState[] = [
  "connected",
  "starting",
  "needs-auth",
  "failed",
  "disabled",
  "configured",
  "unknown",
  "not-configured",
];

function rankConnectedToolState(state: McpConnectionState) {
  const index = CONNECTED_TOOL_STATE_PREFERENCE.indexOf(state);
  return index === -1 ? CONNECTED_TOOL_STATE_PREFERENCE.length : index;
}

/**
 * Rolls the per-server MCP status up to the connector level (Slack, Atlassian,
 * Figma, GitHub).
 *
 * Deliberately a pure function over overviews the caller already fetched. The
 * equivalent main-process preflight (`provider.get-connected-tool-status`)
 * spawns a fresh `claude` subprocess that reconnects every MCP server, so
 * calling it from the UI would duplicate exactly the remote connector
 * handshakes that make connectors look intermittently disconnected.
 */
export function buildConnectedToolOverviews(args: {
  servers: readonly McpServerOverview[];
}): ConnectedToolOverview[] {
  return CONNECTED_TOOL_IDS.map((id): ConnectedToolOverview => {
    const matches = args.servers
      .filter((server) => matchesConnectedTool({ toolId: id, serverName: server.name }))
      .map((server) => {
        // A connector is usable if either provider has it up, so the server's
        // effective state is the better of its two provider states.
        const state =
          rankConnectedToolState(server.claude.state) <=
          rankConnectedToolState(server.codex.state)
            ? server.claude.state
            : server.codex.state;
        return { name: server.name, state };
      })
      .sort(
        (left, right) =>
          rankConnectedToolState(left.state) - rankConnectedToolState(right.state) ||
          left.name.localeCompare(right.name),
      );

    const state = matches[0]?.state ?? "not-configured";
    return {
      id,
      label: getConnectedToolLabel(id),
      state,
      stateLabel: getMcpConnectionLabel(state),
      serverNames: matches.map((match) => match.name),
    };
  });
}

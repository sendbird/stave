import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button } from "@/components/ui";
import {
  buildConnectedToolOverviews,
  buildMcpServerOverviews,
  formatMcpTransportLabel,
  type McpConnectionState,
  type McpProviderOverview,
  type McpServerOverview,
} from "@/lib/providers/mcp-management";
import type {
  ClaudeMcpStatusResponse,
  CodexMcpStatusResponse,
  McpDiscoveryResponse,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type {
  McpConfigProvider,
  McpServerConfigListResponse,
  McpServerConfigSnapshot,
} from "@/lib/providers/mcp-config.types";
import { useAppStore } from "@/store/app.store";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import {
  LocalMcpRequestLogCard,
  LocalMcpServerCard,
} from "./settings-dialog-developer-section";
import {
  McpServerConfigDeleteDialog,
  McpServerConfigEditorDialog,
  McpServerConfigShareDialog,
} from "./settings-dialog-mcp-config-editor";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";

type McpManagementViewState = {
  discovery: McpDiscoveryResponse | null;
  configs: McpServerConfigListResponse | null;
  claude: ClaudeMcpStatusResponse | null;
  codex: CodexMcpStatusResponse | null;
  busy: boolean;
  errors: string[];
  refreshedAt: number | null;
};

type McpLoadResult<T> = {
  value: T | null;
  error?: string;
};

type PendingMcpOauthLogin = {
  provider: "claude" | "codex" | "cursor";
  serverName: string;
  startedAt: number;
};

const MCP_OAUTH_POLL_INTERVAL_MS = 4_000;
const MCP_OAUTH_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

function getMcpOauthKey(
  provider: PendingMcpOauthLogin["provider"],
  serverName: string,
) {
  return `${provider}\u0000${serverName}`;
}

function formatMcpSourceLabel(
  source: McpDiscoveryResponse["servers"][number]["sources"][number],
) {
  switch (source) {
    case "claude-user":
      return "Claude user";
    case "claude-project":
      return "Claude project";
    case "claude-local":
      return "Claude local project";
    case "codex-user":
      return "Codex user";
    case "cursor-user":
      return "Cursor user";
    case "cursor-project":
      return "Cursor project";
    case "kiro-user":
      return "Kiro user";
    case "kiro-project":
      return "Kiro project";
  }
}

async function loadMcpValue<T>(
  label: string,
  loader?: () => Promise<T>,
): Promise<McpLoadResult<T>> {
  if (!loader) {
    return { value: null, error: `${label} API unavailable.` };
  }
  try {
    return { value: await loader() };
  } catch (error) {
    return {
      value: null,
      error: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getConnectionBadgeVariant(state: McpConnectionState) {
  switch (state) {
    case "connected":
      return "success" as const;
    case "starting":
    case "needs-auth":
      return "warning" as const;
    case "failed":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function formatStatusTime(timestamp?: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function getAcpAvailabilityCopy(
  availability: McpServerOverview["acpAvailability"],
) {
  switch (availability) {
    case "portable":
      return {
        label: "Cursor/Kiro eligible",
        detail:
          "Stave can forward this file-backed server to primary Cursor and Kiro sessions.",
      };
    case "target-native":
      return {
        label: "Native route",
        detail:
          "Cursor or Kiro loads this server from its native MCP configuration. Stave does not inject a duplicate route into that target session.",
      };
    case "provider-managed":
      return {
        label: "Provider-only",
        detail:
          "This account-managed connector exposes no reusable command, URL, or OAuth credential, so it stays with the provider that authenticated it.",
      };
    case "not-forwarded":
      return {
        label: "Not sent to ACP",
        detail:
          "This server is disabled or uses a transport that Cursor and Kiro sessions cannot receive.",
      };
  }
}

function McpProviderStatus(args: {
  serverName: string;
  overview: McpProviderOverview;
  authPending: boolean;
  authBusy: boolean;
  onAuthenticate?: () => void;
}) {
  const providerLabel =
    args.overview.provider === "claude-code"
      ? "Claude"
      : args.overview.provider === "codex"
        ? "Codex"
        : args.overview.provider === "cursor"
          ? "Cursor"
          : "Kiro";
  const statusTime = formatStatusTime(args.overview.statusUpdatedAt);
  const errorTime = formatStatusTime(args.overview.lastErrorAt);

  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-background/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{providerLabel}</p>
        <Badge variant={getConnectionBadgeVariant(args.overview.state)}>
          {args.authPending && args.overview.state !== "connected"
            ? "Waiting for sign-in"
            : args.overview.label}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {args.overview.detail ? <span>{args.overview.detail}</span> : null}
        {typeof args.overview.toolCount === "number" ? (
          <span>
            {args.overview.toolCount} tool
            {args.overview.toolCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {statusTime ? <span>Checked {statusTime}</span> : null}
      </div>
      {args.overview.lastError ? (
        <div className="mt-2 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-xs">
          <p className="font-medium text-destructive">
            Recent error{errorTime ? ` · ${errorTime}` : ""}
          </p>
          <p className="mt-1 break-words text-muted-foreground">
            {args.overview.lastError}
          </p>
        </div>
      ) : null}
      {args.overview.canAuthenticate && args.onAuthenticate ? (
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={args.authBusy || args.authPending}
          aria-label={`Sign in to ${args.serverName} for ${providerLabel}`}
          onClick={args.onAuthenticate}
        >
          {args.authBusy
            ? "Starting..."
            : args.authPending
              ? "Waiting for browser"
              : "Sign in"}
        </Button>
      ) : null}
    </div>
  );
}

function pickShareSource(
  configs: McpServerConfigSnapshot[],
  destination: McpConfigProvider,
) {
  const sources = configs.filter(
    (config) =>
      config.provider !== destination &&
      config.canEdit &&
      !(destination === "codex" && config.transport === "sse"),
  );
  return (
    sources.find((config) => config.scope === "user") ?? sources[0] ?? null
  );
}

function McpShareActions(args: {
  claudeConfigured: boolean;
  codexConfigured: boolean;
  cursorConfigured: boolean;
  kiroConfigured: boolean;
  configs: McpServerConfigSnapshot[];
  onShare: (
    snapshot: McpServerConfigSnapshot,
    destinationProvider: McpConfigProvider,
  ) => void;
}) {
  if (
    args.claudeConfigured &&
    args.codexConfigured &&
    args.cursorConfigured &&
    args.kiroConfigured
  ) return null;
  const toCodex = args.codexConfigured
    ? null
    : pickShareSource(args.configs, "codex");
  const toClaude = args.claudeConfigured
    ? null
    : pickShareSource(args.configs, "claude-code");
  const toCursor = args.cursorConfigured
    ? null
    : pickShareSource(args.configs, "cursor");
  const toKiro = args.kiroConfigured
    ? null
    : pickShareSource(args.configs, "kiro");
  if (!toCodex && !toClaude && !toCursor && !toKiro) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {toCodex ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toCodex, "codex")}
        >
          Add to Codex
        </Button>
      ) : null}
      {toClaude ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toClaude, "claude-code")}
        >
          Add to Claude
        </Button>
      ) : null}
      {toCursor ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toCursor, "cursor")}
        >
          Add to Cursor
        </Button>
      ) : null}
      {toKiro ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toKiro, "kiro")}
        >
          Add to Kiro
        </Button>
      ) : null}
    </div>
  );
}

function McpConfigurationRows(args: {
  configs: McpServerConfigSnapshot[];
  onEdit: (snapshot: McpServerConfigSnapshot) => void;
  onDelete: (snapshot: McpServerConfigSnapshot) => void;
}) {
  if (args.configs.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        Native configuration
      </p>
      <div className="mt-2 space-y-2">
        {args.configs.map((config) => (
          <div
            key={config.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/65 bg-background/45 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  {config.sourceLabel}
                </span>
                <Badge variant="outline">
                  {formatMcpTransportLabel(config.transport)}
                </Badge>
                {!config.enabled ? (
                  <Badge variant="outline">Disabled</Badge>
                ) : null}
              </div>
              {config.hiddenValueCount ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {config.hiddenValueCount} protected value
                  {config.hiddenValueCount === 1 ? "" : "s"} hidden
                </p>
              ) : null}
            </div>
            {config.canEdit || config.canDelete ? (
              <div className="flex items-center gap-1.5">
                {config.canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Edit ${config.name} in ${config.sourceLabel}`}
                    onClick={() => args.onEdit(config)}
                  >
                    Edit
                  </Button>
                ) : null}
                {config.canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    aria-label={`Delete ${config.name} from ${config.sourceLabel}`}
                    onClick={() => args.onDelete(config)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            ) : (
              <Badge variant="outline">Managed by Stave</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function McpServerConnectionsCard() {
  const [settings, activeWorkspaceId, workspacePathById, projectPath] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings,
            state.activeWorkspaceId,
            state.workspacePathById,
            state.projectPath,
          ] as const,
      ),
    );
  const [state, setState] = useState<McpManagementViewState>({
    discovery: null,
    configs: null,
    claude: null,
    codex: null,
    busy: false,
    errors: [],
    refreshedAt: null,
  });
  const [authBusyByKey, setAuthBusyByKey] = useState<Record<string, true>>({});
  const [authPendingByKey, setAuthPendingByKey] = useState<
    Record<string, PendingMcpOauthLogin>
  >({});
  const [authNotice, setAuthNotice] = useState("");
  const [mutationNotice, setMutationNotice] = useState<{
    detail: string;
    outcome: "success" | "partial";
  } | null>(null);
  const [editor, setEditor] = useState<{
    snapshot?: McpServerConfigSnapshot;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<McpServerConfigSnapshot | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    snapshot: McpServerConfigSnapshot;
    destinationProvider: McpConfigProvider;
  } | null>(null);
  const refreshRequestIdRef = useRef(0);
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const runtimeOptions = useMemo(
    () => ({
      claude: buildProviderRuntimeOptions({
        provider: "claude-code",
        model: settings.modelClaude,
        settings,
      }),
      codex: buildProviderRuntimeOptions({
        provider: "codex",
        model: settings.modelCodex,
        settings,
      }),
      cursor: buildProviderRuntimeOptions({
        provider: "cursor",
        model: settings.modelCursor,
        settings,
      }),
      kiro: buildProviderRuntimeOptions({
        provider: "kiro",
        model: settings.modelKiro,
        settings,
      }),
    }),
    [settings],
  );

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;
    setState((current) => ({ ...current, busy: true }));

    const provider = window.api?.provider;
    const [discovery, configs, claude, codex] = await Promise.all([
      loadMcpValue(
        "MCP discovery",
        provider?.discoverMcpServers
          ? () => provider.discoverMcpServers!({ cwd: workspaceCwd })
          : undefined,
      ),
      loadMcpValue(
        "MCP configuration",
        provider?.listMcpServerConfigs
          ? () =>
              provider.listMcpServerConfigs!({
                cwd: workspaceCwd,
                runtimeOptions: {
                  claudeBinaryPath: runtimeOptions.claude.claudeBinaryPath,
                  codexBinaryPath: runtimeOptions.codex.codexBinaryPath,
                  cursorBinaryPath: runtimeOptions.cursor.cursorBinaryPath,
                  kiroBinaryPath: runtimeOptions.kiro.kiroBinaryPath,
                },
              })
          : undefined,
      ),
      loadMcpValue(
        "Claude MCP status",
        provider?.getClaudeMcpStatus
          ? () =>
              provider.getClaudeMcpStatus!({
                cwd: workspaceCwd,
                runtimeOptions: runtimeOptions.claude,
              })
          : undefined,
      ),
      loadMcpValue(
        "Codex MCP status",
        provider?.getCodexMcpStatus
          ? () =>
              provider.getCodexMcpStatus!({
                cwd: workspaceCwd,
                runtimeOptions: runtimeOptions.codex,
              })
          : undefined,
      ),
    ]);
    if (requestId !== refreshRequestIdRef.current) {
      return;
    }
    const errors = [
      ...new Set(
        [
          discovery.error,
          configs.error,
          claude.error,
          codex.error,
          ...(discovery.value?.errors ?? []),
          ...(configs.value?.errors ?? []),
          ...(!claude.value?.ok && claude.value?.detail
            ? [claude.value.detail]
            : []),
          ...(!codex.value?.ok && codex.value?.detail
            ? [codex.value.detail]
            : []),
        ].filter((error): error is string => Boolean(error)),
      ),
    ];

    setState((current) => ({
      discovery: discovery.value ?? current.discovery,
      configs: configs.value ?? current.configs,
      claude: claude.value ?? current.claude,
      codex: codex.value ?? current.codex,
      busy: false,
      errors,
      refreshedAt: Date.now(),
    }));
  }, [runtimeOptions, workspaceCwd]);

  useEffect(() => {
    setState({
      discovery: null,
      configs: null,
      claude: null,
      codex: null,
      busy: true,
      errors: [],
      refreshedAt: null,
    });
    setAuthBusyByKey({});
    setAuthPendingByKey({});
    setAuthNotice("");
    setMutationNotice(null);
    setEditor(null);
    setDeleteTarget(null);
    setShareTarget(null);
    void refresh();
    return () => {
      refreshRequestIdRef.current += 1;
    };
  }, [refresh]);

  const servers = useMemo(
    () =>
      buildMcpServerOverviews({
        discoveredServers: state.discovery?.servers,
        configuredServers: state.configs?.servers,
        claudeServers: state.claude?.servers,
        codexServers: state.codex?.servers,
      }),
    [
      state.claude?.servers,
      state.codex?.servers,
      state.configs?.servers,
      state.discovery?.servers,
    ],
  );

  const connectedTools = useMemo(
    () => buildConnectedToolOverviews({ servers }),
    [servers],
  );

  const configsByName = useMemo(() => {
    const byName = new Map<string, McpServerConfigSnapshot[]>();
    for (const config of state.configs?.servers ?? []) {
      const entries = byName.get(config.name) ?? [];
      entries.push(config);
      byName.set(config.name, entries);
    }
    return byName;
  }, [state.configs?.servers]);

  useEffect(() => {
    const entries = Object.entries(authPendingByKey);
    if (entries.length === 0) return;

    const nextPending = { ...authPendingByKey };
    let changed = false;
    for (const [key, pending] of entries) {
      const server = servers.find(
        (candidate) => candidate.name === pending.serverName,
      );
      const overview =
        pending.provider === "claude"
          ? server?.claude
          : pending.provider === "codex"
            ? server?.codex
            : server?.cursor;
      if (
        !overview ||
        overview.state === "connected" ||
        overview.state === "failed" ||
        Date.now() - pending.startedAt >= MCP_OAUTH_POLL_TIMEOUT_MS
      ) {
        delete nextPending[key];
        changed = true;
      }
    }
    if (changed) {
      setAuthPendingByKey(nextPending);
    }
  }, [authPendingByKey, servers]);

  useEffect(() => {
    if (Object.keys(authPendingByKey).length === 0) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    const schedulePoll = () => {
      timeoutId = window.setTimeout(async () => {
        await refresh();
        if (!cancelled) {
          schedulePoll();
        }
      }, MCP_OAUTH_POLL_INTERVAL_MS);
    };
    schedulePoll();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [authPendingByKey, refresh]);

  async function startOauthLogin(args: {
    provider: "claude" | "codex" | "cursor";
    serverName: string;
    runtimeOptions: ProviderRuntimeOptions;
  }) {
    const key = getMcpOauthKey(args.provider, args.serverName);
    setAuthBusyByKey((current) => ({ ...current, [key]: true }));
    setAuthNotice("");
    try {
      if (args.provider === "cursor") {
        const result = await window.api?.provider?.startCursorMcpOauthLogin?.({
          name: args.serverName,
          cwd: workspaceCwd,
          runtimeOptions: args.runtimeOptions,
        });
        setAuthNotice(
          result?.detail ?? "Cursor OAuth login API unavailable.",
        );
        if (result?.ok) void refresh();
        return;
      }
      const result =
        args.provider === "claude"
          ? await window.api?.provider?.startClaudeMcpOauthLogin?.({
              name: args.serverName,
              cwd: workspaceCwd,
              runtimeOptions: args.runtimeOptions,
            })
          : await window.api?.provider?.startCodexMcpOauthLogin?.({
              name: args.serverName,
              runtimeOptions: args.runtimeOptions,
            });
      if (!result?.ok) {
        setAuthNotice(
          result?.detail ?? `${args.provider} OAuth login API unavailable.`,
        );
        return;
      }
      if (result.authorizationUrl) {
        const openExternal = window.api?.shell?.openExternal;
        if (!openExternal) {
          setAuthNotice(
            `${result.detail} External browser access is unavailable.`,
          );
          return;
        }
        const openResult = await openExternal({ url: result.authorizationUrl });
        if (!openResult.ok) {
          setAuthNotice(
            `${result.detail} ${openResult.stderr ?? "The external browser could not be opened."}`,
          );
          return;
        }
        setAuthPendingByKey((current) => ({
          ...current,
          [key]: {
            provider: args.provider,
            serverName: args.serverName,
            startedAt: Date.now(),
          },
        }));
      }
      setAuthNotice(
        result.authorizationUrl
          ? `${result.detail} Finish in your browser; status will refresh automatically.`
          : result.detail,
      );
      void refresh();
    } catch (error) {
      setAuthNotice(
        `OAuth login failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setAuthBusyByKey((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  const providerConnections = servers.flatMap((server) => [
    server.claude,
    server.codex,
    server.cursor,
    server.kiro,
  ]);
  const configuredCount = providerConnections.filter(
    (provider) => provider.configured,
  ).length;
  const connectedCount = providerConnections.filter(
    (provider) => provider.state === "connected",
  ).length;
  const attentionCount = providerConnections.filter((provider) =>
    ["failed", "needs-auth"].includes(provider.state),
  ).length;

  return (
    <SettingsCard
      title="MCP Connections"
      description="Install native MCP servers for Claude, Codex, Cursor, and Kiro. Each provider keeps its own configuration and OAuth session; Stave forwards compatible entries only when the target has no native route."
      titleAccessory={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!window.api?.provider?.previewMcpServerConfigMutation}
            onClick={() => {
              setMutationNotice(null);
              setEditor({});
            }}
          >
            Add server
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={state.busy}
          >
            {state.busy ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Servers", servers.length],
          ["Connected", `${connectedCount}/${configuredCount}`],
          ["Needs attention", attentionCount],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-border/70 bg-muted/25 px-3 py-2"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-sm font-medium text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      {servers.length > 0 ? (
        <div
          className="rounded-md border border-border/70 bg-muted/20 px-3 py-2"
          role="group"
          aria-label="Connector availability"
        >
          <p className="text-xs text-muted-foreground">
            Provider-native configuration and available runtime status.
            Account-managed OAuth sessions stay with the provider that owns them.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {connectedTools.map((tool) => (
              <Badge
                key={tool.id}
                variant={getConnectionBadgeVariant(tool.state)}
                title={
                  tool.serverNames.length > 0
                    ? `${tool.stateLabel} · ${tool.serverNames.join(", ")}`
                    : tool.stateLabel
                }
              >
                {tool.label}: {tool.stateLabel}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {state.busy && servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Loading MCP connections…
        </p>
      ) : null}
      {!state.busy && state.refreshedAt && servers.length === 0 ? (
        <p className="rounded-md border border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          No MCP servers were found in the current Claude, Codex, Cursor, or
          Kiro configuration.
        </p>
      ) : null}

      <div className="space-y-3" role="list" aria-label="MCP server status">
        {servers.map((server) => (
          <article
            key={server.name}
            role="listitem"
            className="rounded-lg border border-border/75 bg-muted/15 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-foreground">
                  {server.name}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {server.sources.length > 0
                    ? [...new Set(server.sources)]
                        .map(formatMcpSourceLabel)
                        .join(" · ")
                    : "Runtime detected"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge variant="outline">
                  {formatMcpTransportLabel(server.transport)}
                </Badge>
                <Badge
                  variant="outline"
                  title={getAcpAvailabilityCopy(server.acpAvailability).detail}
                >
                  {getAcpAvailabilityCopy(server.acpAvailability).label}
                </Badge>
              </div>
            </div>
            {server.acpAvailability !== "portable" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {getAcpAvailabilityCopy(server.acpAvailability).detail}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <McpProviderStatus
                serverName={server.name}
                overview={server.claude}
                authBusy={Boolean(
                  authBusyByKey[getMcpOauthKey("claude", server.name)],
                )}
                authPending={Boolean(
                  authPendingByKey[getMcpOauthKey("claude", server.name)],
                )}
                onAuthenticate={() =>
                  void startOauthLogin({
                    provider: "claude",
                    serverName: server.name,
                    runtimeOptions: runtimeOptions.claude,
                  })
                }
              />
              <McpProviderStatus
                serverName={server.name}
                overview={server.codex}
                authBusy={Boolean(
                  authBusyByKey[getMcpOauthKey("codex", server.name)],
                )}
                authPending={Boolean(
                  authPendingByKey[getMcpOauthKey("codex", server.name)],
                )}
                onAuthenticate={() =>
                  void startOauthLogin({
                    provider: "codex",
                    serverName: server.name,
                    runtimeOptions: runtimeOptions.codex,
                  })
                }
              />
              <McpProviderStatus
                serverName={server.name}
                overview={server.cursor}
                authBusy={Boolean(
                  authBusyByKey[getMcpOauthKey("cursor", server.name)],
                )}
                authPending={false}
                onAuthenticate={() =>
                  void startOauthLogin({
                    provider: "cursor",
                    serverName: server.name,
                    runtimeOptions: runtimeOptions.cursor,
                  })
                }
              />
              <McpProviderStatus
                serverName={server.name}
                overview={server.kiro}
                authBusy={false}
                authPending={false}
              />
            </div>
            <McpShareActions
              claudeConfigured={server.claude.configured}
              codexConfigured={server.codex.configured}
              cursorConfigured={server.cursor.configured}
              kiroConfigured={server.kiro.configured}
              configs={configsByName.get(server.name) ?? []}
              onShare={(snapshot, destinationProvider) => {
                setMutationNotice(null);
                setShareTarget({ snapshot, destinationProvider });
              }}
            />
            <McpConfigurationRows
              configs={configsByName.get(server.name) ?? []}
              onEdit={(snapshot) => {
                setMutationNotice(null);
                setEditor({ snapshot });
              }}
              onDelete={(snapshot) => {
                setMutationNotice(null);
                setDeleteTarget(snapshot);
              }}
            />
          </article>
        ))}
      </div>

      {mutationNotice ? (
        <p
          className={
            mutationNotice.outcome === "partial"
              ? "rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
              : "rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          }
          aria-live="polite"
          role="status"
        >
          {mutationNotice.detail}
        </p>
      ) : null}
      {authNotice ? (
        <p
          className="rounded-md border border-border/75 bg-muted/25 px-3 py-2 text-sm text-muted-foreground"
          aria-live="polite"
          role="status"
        >
          {authNotice}
        </p>
      ) : null}
      {state.errors.length > 0 ? (
        <div
          className="space-y-1 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="status"
        >
          {state.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <McpServerConfigEditorDialog
        open={Boolean(editor)}
        {...(editor?.snapshot ? { snapshot: editor.snapshot } : {})}
        workspaceCwd={workspaceCwd}
        runtimeOptions={runtimeOptions}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onApplied={(detail, outcome = "success") => {
          setMutationNotice({ detail, outcome });
          void refresh();
        }}
      />
      <McpServerConfigDeleteDialog
        open={Boolean(deleteTarget)}
        {...(deleteTarget ? { snapshot: deleteTarget } : {})}
        workspaceCwd={workspaceCwd}
        runtimeOptions={runtimeOptions}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onApplied={(detail) => {
          setMutationNotice({ detail, outcome: "success" });
          void refresh();
        }}
      />
      <McpServerConfigShareDialog
        open={Boolean(shareTarget)}
        {...(shareTarget
          ? {
              snapshot: shareTarget.snapshot,
              destinationProvider: shareTarget.destinationProvider,
            }
          : {})}
        workspaceCwd={workspaceCwd}
        runtimeOptions={runtimeOptions}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
        onApplied={(detail) => {
          setMutationNotice({ detail, outcome: "success" });
          void refresh();
        }}
      />
    </SettingsCard>
  );
}

export function McpSection() {
  return (
    <SectionStack>
      <McpServerConnectionsCard />
      <LocalMcpServerCard />
      <LocalMcpRequestLogCard />
    </SectionStack>
  );
}

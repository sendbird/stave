import { formatDateTime } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
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
import { mcpSectionStyles as styles } from "./settings-dialog-mcp-section.styles";

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
      return i18n.t("settingsProviders:mcpSection.sources.claudeUser");
    case "claude-project":
      return i18n.t("settingsProviders:mcpSection.sources.claudeProject");
    case "claude-local":
      return i18n.t("settingsProviders:mcpSection.sources.claudeLocal");
    case "codex-user":
      return i18n.t("settingsProviders:mcpSection.sources.codexUser");
    case "cursor-user":
      return i18n.t("settingsProviders:mcpSection.sources.cursorUser");
    case "cursor-project":
      return i18n.t("settingsProviders:mcpSection.sources.cursorProject");
    case "kiro-user":
      return i18n.t("settingsProviders:mcpSection.sources.kiroUser");
    case "kiro-project":
      return i18n.t("settingsProviders:mcpSection.sources.kiroProject");
  }
}

async function loadMcpValue<T>(
  label: string,
  loader?: () => Promise<T>,
): Promise<McpLoadResult<T>> {
  if (!loader) {
    return { value: null, error: i18n.t("settingsProviders:settingsDialogMcpSection.apiUnavailable", { value1: label }) };
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
  return formatDateTime(timestamp, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getAcpAvailabilityCopy(
  availability: McpServerOverview["acpAvailability"],
) {
  switch (availability) {
    case "portable":
      return {
        label: i18n.t("settingsProviders:mcpSection.acp.portable.label"),
        detail:
          i18n.t("settingsProviders:mcpSection.acp.portable.detail"),
      };
    case "target-native":
      return {
        label: i18n.t("settingsProviders:mcpSection.acp.targetNative.label"),
        detail:
          i18n.t("settingsProviders:mcpSection.acp.targetNative.detail"),
      };
    case "provider-managed":
      return {
        label: "Provider-only",
        detail:
          i18n.t("settingsProviders:mcpSection.acp.providerManaged.detail"),
      };
    case "not-forwarded":
      return {
        label: i18n.t("settingsProviders:mcpSection.acp.notForwarded.label"),
        detail:
          i18n.t("settingsProviders:mcpSection.acp.notForwarded.detail"),
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
  const { t } = useTranslation(I18N_NAMESPACES);
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
    <div className={sx(styles.providerCard)}>
      <div className={sx(styles.providerHead)}>
        <p className={sx(styles.providerName)}>{providerLabel}</p>
        <Badge variant={getConnectionBadgeVariant(args.overview.state)}>
          {args.authPending && args.overview.state !== "connected"
            ? t("settingsProviders:mcpSection.provider.waitingForSignIn")
            : args.overview.label}
        </Badge>
      </div>
      <div className={sx(styles.providerMeta)}>
        {args.overview.detail ? <span>{args.overview.detail}</span> : null}
        {typeof args.overview.toolCount === "number" ? (
          <span>
            {t("settingsProviders:whole.tools", { count: args.overview.toolCount })}
          </span>
        ) : null}
        {statusTime ? <span>{t("settingsProviders:messages.checkedAt", { checkedAt: statusTime })}</span> : null}
      </div>
      {args.overview.lastError ? (
        <div className={sx(styles.errorBox)}>
          <p className={sx(styles.errorTitle)}>
            {t("settingsProviders:mcpSection.provider.recentError")}{errorTime ? ` · ${errorTime}` : ""}
          </p>
          <p className={sx(styles.errorDetail)}>{args.overview.lastError}</p>
        </div>
      ) : null}
      {args.overview.canAuthenticate && args.onAuthenticate ? (
        <Button
          className={sx(styles.signInButton)}
          size="sm"
          variant="outline"
          disabled={args.authBusy || args.authPending}
          aria-label={t("settingsProviders:settingsDialogMcpSection.signInToFor", { value1: args.serverName, value2: providerLabel })}
          onClick={args.onAuthenticate}
        >
          {args.authBusy
            ? t("settingsProviders:mcpSection.provider.starting")
            : args.authPending
              ? t("settingsProviders:mcpSection.provider.waitingForBrowser")
              : t("settingsProviders:mcpSection.provider.signIn")}
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
  const { t } = useTranslation(I18N_NAMESPACES);
  if (
    args.claudeConfigured &&
    args.codexConfigured &&
    args.cursorConfigured &&
    args.kiroConfigured
  )
    return null;
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
    <div className={sx(styles.shareActions)}>
      {toCodex ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toCodex, "codex")}
        >
          {t("settingsProviders:mcpSection.share.addToCodex")}</Button>
      ) : null}
      {toClaude ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toClaude, "claude-code")}
        >
          {t("settingsProviders:mcpSection.share.addToClaude")}</Button>
      ) : null}
      {toCursor ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toCursor, "cursor")}
        >
          {t("settingsProviders:mcpSection.share.addToCursor")}</Button>
      ) : null}
      {toKiro ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => args.onShare(toKiro, "kiro")}
        >
          {t("settingsProviders:mcpSection.share.addToKiro")}</Button>
      ) : null}
    </div>
  );
}

function McpConfigurationRows(args: {
  configs: McpServerConfigSnapshot[];
  onEdit: (snapshot: McpServerConfigSnapshot) => void;
  onDelete: (snapshot: McpServerConfigSnapshot) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (args.configs.length === 0) return null;
  return (
    <div className={sx(styles.configSection)}>
      <p className={sx(styles.configHeading)}>{t("settingsProviders:mcpSection.config.heading")}</p>
      <div className={sx(styles.configList)}>
        {args.configs.map((config) => (
          <div key={config.id} className={sx(styles.configRow)}>
            <div className={sx(styles.configMeta)}>
              <div className={sx(styles.configLabelLine)}>
                <span className={sx(styles.configLabel)}>
                  {config.sourceLabel}
                </span>
                <Badge variant="outline">
                  {formatMcpTransportLabel(config.transport)}
                </Badge>
                {!config.enabled ? (
                  <Badge variant="outline">{i18n.t("common:status.disabled")}</Badge>
                ) : null}
              </div>
              {config.hiddenValueCount ? (
                <p className={sx(styles.configHidden)}>
                  {i18n.t("settingsProviders:messages.hiddenValues", { count: config.hiddenValueCount })}</p>
              ) : null}
            </div>
            {config.canEdit || config.canDelete ? (
              <div className={sx(styles.configActions)}>
                {config.canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={i18n.t("settingsProviders:settingsDialogMcpSection.editIn", { value1: config.name, value2: config.sourceLabel })}
                    onClick={() => args.onEdit(config)}
                  >
                    {i18n.t("common:actions.edit")}</Button>
                ) : null}
                {config.canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    aria-label={i18n.t("settingsProviders:settingsDialogMcpSection.deleteFrom", { value1: config.name, value2: config.sourceLabel })}
                    onClick={() => args.onDelete(config)}
                  >
                    {i18n.t("common:actions.delete")}</Button>
                ) : null}
              </div>
            ) : (
              <Badge variant="outline">{i18n.t("settingsProviders:mcpSection.config.managedByStave")}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function McpServerConnectionsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [settings, activeWorkspaceId, workspacePathById, repositoryPath] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings,
            state.activeWorkspaceId,
            state.workspacePathById,
            state.repositoryPath,
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
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? undefined;
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
        i18n.t("settingsProviders:mcpSection.load.discovery"),
        provider?.discoverMcpServers
          ? () => provider.discoverMcpServers!({ cwd: workspaceCwd })
          : undefined,
      ),
      loadMcpValue(
        i18n.t("settingsProviders:mcpSection.load.configuration"),
        provider?.listMcpServerConfigs
          ? () =>
              provider.listMcpServerConfigs!({
                cwd: workspaceCwd,
                runtimeOptions: {
                  claudeAccountProfileId: runtimeOptions.claude.claudeAccountProfileId,
                  codexAccountProfileId: runtimeOptions.codex.codexAccountProfileId,
                  claudeBinaryPath: runtimeOptions.claude.claudeBinaryPath,
                  codexBinaryPath: runtimeOptions.codex.codexBinaryPath,
                  cursorBinaryPath: runtimeOptions.cursor.cursorBinaryPath,
                  kiroBinaryPath: runtimeOptions.kiro.kiroBinaryPath,
                },
              })
          : undefined,
      ),
      loadMcpValue(
        i18n.t("settingsProviders:mcpSection.load.claudeStatus"),
        provider?.getClaudeMcpStatus
          ? () =>
              provider.getClaudeMcpStatus!({
                cwd: workspaceCwd,
                runtimeOptions: runtimeOptions.claude,
              })
          : undefined,
      ),
      loadMcpValue(
        i18n.t("settingsProviders:mcpSection.load.codexStatus"),
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
        setAuthNotice(result?.detail ?? i18n.t("settingsProviders:mcpSection.auth.cursorUnavailable"));
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
          result?.detail ?? i18n.t("settingsProviders:settingsDialogMcpSection.oauthLoginAPIUnavailable", { value1: args.provider }),
        );
        return;
      }
      if (result.authorizationUrl) {
        const openExternal = window.api?.shell?.openExternal;
        if (!openExternal) {
          setAuthNotice(
            i18n.t("settingsProviders:settingsDialogMcpSection.externalBrowserAccessIsUnavailable", { value1: result.detail }),
          );
          return;
        }
        const openResult = await openExternal({ url: result.authorizationUrl });
        if (!openResult.ok) {
          setAuthNotice(
            `${result.detail} ${openResult.stderr ?? i18n.t("settingsProviders:mcpSection.auth.browserCouldNotOpen")}`,
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
          ? i18n.t("settingsProviders:settingsDialogMcpSection.finishInYourBrowserStatusWill", { value1: result.detail })
          : result.detail,
      );
      void refresh();
    } catch (error) {
      setAuthNotice(
        i18n.t("settingsProviders:settingsDialogMcpSection.oauthLoginFailed", { value1: error instanceof Error ? error.message : String(error) }),
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
      title={t("settingsProviders:mcpSection.card.title")}
      description={t("settingsProviders:mcpSection.card.description")}
      titleAccessory={
        <div className={sx(styles.titleActions)}>
          <Button
            type="button"
            size="sm"
            disabled={!window.api?.provider?.previewMcpServerConfigMutation}
            onClick={() => {
              setMutationNotice(null);
              setEditor({});
            }}
          >
            {t("settingsProviders:mcpSection.card.addServer")}</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={state.busy}
          >
            {state.busy ? t("settingsProviders:mcpSection.card.refreshing") : t("common:actions.refresh")}
          </Button>
        </div>
      }
    >
      <div className={sx(styles.statsGrid)}>
        {[
          [t("settingsProviders:mcpSection.stats.servers"), servers.length],
          [t("settingsProviders:mcpSection.stats.connected"), `${connectedCount}/${configuredCount}`],
          [t("settingsProviders:mcpSection.stats.needsAttention"), attentionCount],
        ].map(([label, value]) => (
          <div key={label} className={sx(styles.statCard)}>
            <p className={sx(styles.statLabel)}>{label}</p>
            <p className={sx(styles.statValue)}>{value}</p>
          </div>
        ))}
      </div>

      {servers.length > 0 ? (
        <div
          className={sx(styles.availabilityBox)}
          role="group"
          aria-label={t("settingsProviders:mcpSection.availability.ariaLabel")}
        >
          <p className={sx(styles.availabilityText)}>
            {t("settingsProviders:mcpSection.availability.description")}</p>
          <div className={sx(styles.availabilityChips)}>
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
        <p className={sx(styles.mutedText)}>{t("settingsProviders:mcpSection.loading")}</p>
      ) : null}
      {!state.busy && state.refreshedAt && servers.length === 0 ? (
        <p className={sx(styles.emptyBox)}>
          {t("settingsProviders:mcpSection.empty")}</p>
      ) : null}

      <div
        className={sx(styles.serverList)}
        role="list"
        aria-label={t("settingsProviders:mcpSection.serverListAriaLabel")}
      >
        {servers.map((server) => (
          <article
            key={server.name}
            role="listitem"
            className={sx(styles.serverArticle)}
          >
            <div className={sx(styles.serverHead)}>
              <div>
                <h4 className={sx(styles.serverName)}>{server.name}</h4>
                <p className={sx(styles.serverSources)}>
                  {server.sources.length > 0
                    ? [...new Set(server.sources)]
                        .map(formatMcpSourceLabel)
                        .join(" · ")
                    : i18n.t("settingsProviders:mcpSection.runtimeDetected")}
                </p>
              </div>
              <div className={sx(styles.serverBadges)}>
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
              <p className={sx(styles.serverAvailability)}>
                {getAcpAvailabilityCopy(server.acpAvailability).detail}
              </p>
            ) : null}
            <div className={sx(styles.providerGrid)}>
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
          className={sx(
            mutationNotice.outcome === "partial"
              ? styles.noticePartial
              : styles.noticeSuccess,
          )}
          aria-live="polite"
          role="status"
        >
          {mutationNotice.detail}
        </p>
      ) : null}
      {authNotice ? (
        <p className={sx(styles.authNotice)} aria-live="polite" role="status">
          {authNotice}
        </p>
      ) : null}
      {state.errors.length > 0 ? (
        <div className={sx(styles.errorList)} role="status">
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
  const developerModeEnabled = useAppStore(
    (state) => state.settings.developerModeEnabled,
  );
  return (
    <SectionStack>
      <McpServerConnectionsCard />
      <LocalMcpServerCard />
      {developerModeEnabled ? <LocalMcpRequestLogCard /> : null}
    </SectionStack>
  );
}

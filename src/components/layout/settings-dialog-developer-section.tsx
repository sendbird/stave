import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  ClaudeContextUsageSnapshot,
  ClaudePluginReloadSnapshot,
  CodexMcpServerStatusSnapshot,
} from "@/lib/providers/provider.types";
import type { StaveLocalMcpRequestLog, StaveLocalMcpStatus } from "@/lib/local-mcp";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  formatClaudeSettingSources,
  formatProviderTimeoutLabel,
  formatTokenBudget,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import { getRepoMapCacheSnapshot, clearRepoMapContextCache, type RepoMapCacheEntry } from "@/lib/fs/repo-map-context-cache";
import { useAppStore } from "@/store/app.store";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import {
  DraftInput,
  LabeledField,
  readInt,
  SectionHeading,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";

interface GpuStatusSnapshot {
  hardwareAccelerationEnabled: boolean;
  featureStatus: Record<string, string>;
}

interface LocalMcpViewState {
  status: "loading" | "ready" | "error";
  snapshot: StaveLocalMcpStatus | null;
  detail: string;
  busy: boolean;
}

interface LocalMcpRequestLogViewState {
  status: "loading" | "ready" | "error";
  logs: StaveLocalMcpRequestLog[];
  detail: string;
  busy: boolean;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface CodexMcpViewState {
  status: "loading" | "ready" | "error";
  servers: CodexMcpServerStatusSnapshot[];
  detail: string;
  busy: boolean;
}

const LOCAL_MCP_REQUEST_LOG_PAGE_SIZE = 25;
const LOCAL_MCP_REQUEST_LOG_AUTO_REFRESH_MS = 5000;

function formatCodexMcpAuthStatus(value: string | null) {
  switch (value) {
    case "bearer_token":
      return "Bearer token";
    case "unsupported":
      return "Unsupported";
    default:
      return value ?? "Unknown";
  }
}

function formatCodexMcpEnabledState(server: CodexMcpServerStatusSnapshot) {
  if (server.enabled) {
    return "enabled";
  }
  return server.disabledReason ? `disabled (${server.disabledReason})` : "disabled";
}

function formatClaudeCodeRegistrationState(status: StaveLocalMcpStatus["claudeCodeRegistration"]) {
  if (status.error) {
    return "error";
  }
  if (!status.autoRegister) {
    return "not managed";
  }
  if (status.installed && status.matchesCurrentManifest) {
    return "registered";
  }
  if (status.installed) {
    return "stale";
  }
  return "not installed";
}

function formatCodexRegistrationState(status: StaveLocalMcpStatus["codexRegistration"]) {
  if (status.error) {
    return "error";
  }
  if (!status.autoRegister) {
    return "not managed";
  }
  if (status.installed && status.matchesCurrentManifest) {
    return "registered";
  }
  if (status.installed) {
    return "stale";
  }
  return "not installed";
}

export function ProviderTimeoutCard() {
  const providerTimeoutMs = useAppStore((state) => state.settings.providerTimeoutMs);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const selectedValue = providerTimeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS;

  return (
    <SettingsCard
      title="Provider Timeout"
      description="Maximum time to wait for a Claude or Codex runtime response before showing a timeout error."
    >
      <LabeledField
        title="Timeout Window"
        description="Default is 3 hours so long-running coding turns, refactors, and tool-heavy sessions do not time out too early."
      >
        <div className="flex flex-wrap items-start gap-3">
          <Select
            value={String(selectedValue)}
            onValueChange={(value) =>
              updateSettings({ patch: { providerTimeoutMs: readInt(value, selectedValue) } })}
          >
            <SelectTrigger className="w-40 rounded-md border-border/80 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_TIMEOUT_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {formatProviderTimeoutLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="pt-2 text-sm text-muted-foreground">
            {formatProviderTimeoutLabel(selectedValue)}
          </span>
        </div>
      </LabeledField>
    </SettingsCard>
  );
}

export function CodexBinaryPathCard() {
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title="Codex Binary"
      description="Override the path to the local `codex` binary. Leave empty to use the system install discovered from your PATH/home bin locations."
    >
      <DraftInput
        className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
        placeholder="/usr/local/bin/codex"
        value={codexBinaryPath}
        onCommit={(nextValue) => updateSettings({ patch: { codexBinaryPath: nextValue } })}
      />
      <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <TriangleAlert className="size-4 text-warning" />
          Supported Codex baseline
        </p>
        <p className="mt-1">
          Stave targets the Codex App Server path in local `codex` CLI `0.118.0`.
          If your installed CLI is older, update it or point this field at the version you want Stave to use.
        </p>
      </div>
    </SettingsCard>
  );
}

export function ClaudeBinaryPathCard() {
  const claudeBinaryPath = useAppStore((state) => state.settings.claudeBinaryPath);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title="Claude Binary"
      description="Override the path to the local `claude` binary. Leave empty to let Stave auto-select the newest working Claude install it can resolve."
    >
      <DraftInput
        className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
        placeholder="/usr/local/bin/claude"
        value={claudeBinaryPath}
        onCommit={(nextValue) => updateSettings({ patch: { claudeBinaryPath: nextValue } })}
      />
      <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
        Use this when the shell `claude` auth state and Stave&apos;s Tooling panel disagree, or when multiple Claude installs exist on the same machine.
      </p>
    </SettingsCard>
  );
}

export function ClaudeRuntimeToolsCard() {
  const [
    settings,
    activeTaskId,
    activeWorkspaceId,
    workspacePathById,
    projectPath,
    providerSessionByTask,
    refreshProviderCommandCatalog,
  ] = useAppStore(useShallow((state) => [
    state.settings,
    state.activeTaskId,
    state.activeWorkspaceId,
    state.workspacePathById,
    state.projectPath,
    state.providerSessionByTask,
    state.refreshProviderCommandCatalog,
  ] as const));
  const [claudeContextUsage, setClaudeContextUsage] = useState<ClaudeContextUsageSnapshot | null>(null);
  const [claudeContextUsageDetail, setClaudeContextUsageDetail] = useState("");
  const [claudePluginReload, setClaudePluginReload] = useState<ClaudePluginReloadSnapshot | null>(null);
  const [claudePluginReloadDetail, setClaudePluginReloadDetail] = useState("");
  const [isLoadingClaudeContextUsage, setIsLoadingClaudeContextUsage] = useState(false);
  const [isReloadingClaudePlugins, setIsReloadingClaudePlugins] = useState(false);
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const claudeRuntimeOptions = buildProviderRuntimeOptions({
    provider: "claude-code",
    model: settings.modelClaude,
    settings,
    providerSession: activeTaskId
      ? (providerSessionByTask[activeTaskId] ?? null)
      : null,
  });

  async function handleLoadClaudeContextUsage() {
    const getClaudeContextUsage = window.api?.provider?.getClaudeContextUsage;
    if (!getClaudeContextUsage) {
      setClaudeContextUsage(null);
      setClaudeContextUsageDetail("Claude context usage API unavailable.");
      return;
    }

    setIsLoadingClaudeContextUsage(true);
    try {
      const result = await getClaudeContextUsage({
        cwd: workspaceCwd,
        runtimeOptions: claudeRuntimeOptions,
      });
      setClaudeContextUsage(result.ok ? (result.usage ?? null) : null);
      setClaudeContextUsageDetail(result.detail);
    } catch (error) {
      setClaudeContextUsage(null);
      setClaudeContextUsageDetail(error instanceof Error ? error.message : "Failed to load Claude context usage.");
    } finally {
      setIsLoadingClaudeContextUsage(false);
    }
  }

  async function handleReloadClaudePlugins() {
    const reloadClaudePlugins = window.api?.provider?.reloadClaudePlugins;
    if (!reloadClaudePlugins) {
      setClaudePluginReload(null);
      setClaudePluginReloadDetail("Claude plugin reload API unavailable.");
      return;
    }

    setIsReloadingClaudePlugins(true);
    try {
      const result = await reloadClaudePlugins({
        cwd: workspaceCwd,
        runtimeOptions: claudeRuntimeOptions,
      });
      setClaudePluginReload(result.ok ? (result.reload ?? null) : null);
      setClaudePluginReloadDetail(result.detail);
      if (result.ok) {
        refreshProviderCommandCatalog();
      }
    } catch (error) {
      setClaudePluginReload(null);
      setClaudePluginReloadDetail(error instanceof Error ? error.message : "Failed to reload Claude plugins.");
    } finally {
      setIsReloadingClaudePlugins(false);
    }
  }

  return (
    <SettingsCard
      title="Claude Runtime Tools"
      description="Inspect current Claude session/workspace context pressure and refresh plugin-driven commands without leaving Stave."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-9"
          variant="outline"
          disabled={isLoadingClaudeContextUsage}
          onClick={() => void handleLoadClaudeContextUsage()}
        >
          {isLoadingClaudeContextUsage ? "Loading Context..." : "Inspect Context Usage"}
        </Button>
        <Button
          className="h-9"
          disabled={isReloadingClaudePlugins}
          onClick={() => void handleReloadClaudePlugins()}
        >
          {isReloadingClaudePlugins ? "Reloading Plugins..." : "Reload Plugins"}
        </Button>
      </div>

      <div className="space-y-1 rounded-md border border-border/80 bg-background px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Workspace</span>
          <span className="font-mono text-foreground">{workspaceCwd ?? "<process cwd>"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Setting Sources</span>
          <span className="font-mono text-foreground">{formatClaudeSettingSources(settings.claudeSettingSources)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Task Budget</span>
          <span className="font-mono text-foreground">{formatTokenBudget(settings.claudeTaskBudgetTokens)}</span>
        </div>
      </div>

      {claudeContextUsage ? (
        <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">Context usage</span>
            <span className="font-mono text-muted-foreground">
              {claudeContextUsage.totalTokens.toLocaleString()} / {claudeContextUsage.maxTokens.toLocaleString()} ({Math.round(claudeContextUsage.percentage)}%)
            </span>
          </div>
          <div className="space-y-1">
            {claudeContextUsage.categories.map((category) => (
              <div key={category.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{category.name}</span>
                <span className="font-mono text-foreground">{category.tokens.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Memory files</span>
            <span className="font-mono text-foreground">{claudeContextUsage.memoryFiles.length}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">MCP tools</span>
            <span className="font-mono text-foreground">{claudeContextUsage.mcpTools.length}</span>
          </div>
        </div>
      ) : null}
      {claudeContextUsageDetail ? (
        <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {claudeContextUsageDetail}
        </p>
      ) : null}

      {claudePluginReload ? (
        <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
              <p className="text-muted-foreground">Commands</p>
              <p className="font-mono text-foreground">{claudePluginReload.commandCount}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
              <p className="text-muted-foreground">Agents</p>
              <p className="font-mono text-foreground">{claudePluginReload.agentCount}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
              <p className="text-muted-foreground">Plugins</p>
              <p className="font-mono text-foreground">{claudePluginReload.plugins.length}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
              <p className="text-muted-foreground">Errors</p>
              <p className="font-mono text-foreground">{claudePluginReload.errorCount}</p>
            </div>
          </div>
          {claudePluginReload.plugins.length > 0 ? (
            <div className="space-y-1">
              {claudePluginReload.plugins.map((plugin) => (
                <div key={`${plugin.name}:${plugin.path}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{plugin.name}</span>
                  <span className="font-mono text-foreground">{plugin.path}</span>
                </div>
              ))}
            </div>
          ) : null}
          {claudePluginReload.mcpServers.length > 0 ? (
            <div className="space-y-1">
              {claudePluginReload.mcpServers.map((server) => (
                <div key={server.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{server.name}</span>
                  <span className="font-mono text-foreground">{server.status}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {claudePluginReloadDetail ? (
        <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {claudePluginReloadDetail}
        </p>
      ) : null}
    </SettingsCard>
  );
}

export function CodexMcpStatusCard() {
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  const [state, setState] = useState<CodexMcpViewState>({
    status: "loading",
    servers: [],
    detail: "Loading Codex MCP status...",
    busy: false,
  });

  async function refreshStatus() {
    const getCodexMcpStatus = window.api?.provider?.getCodexMcpStatus;
    if (!getCodexMcpStatus) {
      setState({
        status: "error",
        servers: [],
        detail: "Codex MCP status API unavailable.",
        busy: false,
      });
      return;
    }

    setState((current) => ({
      ...current,
      busy: true,
      status: current.servers.length > 0 ? current.status : "loading",
      detail: current.servers.length > 0 ? current.detail : "Loading Codex MCP status...",
    }));

    try {
      const result = await getCodexMcpStatus({
        runtimeOptions: codexBinaryPath.trim()
          ? { codexBinaryPath }
          : undefined,
      });
      setState({
        status: result.ok ? "ready" : "error",
        servers: result.servers,
        detail: result.detail,
        busy: false,
      });
    } catch (error) {
      setState({
        status: "error",
        servers: [],
        detail: error instanceof Error ? error.message : "Failed to load Codex MCP status.",
        busy: false,
      });
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, [codexBinaryPath]);

  const enabledCount = state.servers.filter((server) => server.enabled).length;
  const tokenAuthCount = state.servers.filter((server) => server.authStatus === "bearer_token").length;

  return (
    <SettingsCard
      title="Codex Native Runtime"
      description="Inspect the provider-native MCP surface exposed by the current Codex CLI."
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
            <p className="text-muted-foreground">Servers</p>
            <p className="font-mono text-foreground">{state.servers.length}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
            <p className="text-muted-foreground">Enabled</p>
            <p className="font-mono text-foreground">{enabledCount}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm">
            <p className="text-muted-foreground">Bearer Token</p>
            <p className="font-mono text-foreground">{tokenAuthCount}</p>
          </div>
        </div>
        <Button
          className="h-9"
          size="sm"
          variant="outline"
          disabled={state.busy}
          onClick={() => void refreshStatus()}
        >
          {state.busy ? "Refreshing..." : "Refresh MCP Status"}
        </Button>
      </div>

      {state.servers.length > 0 ? (
        <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
          {state.servers.map((server) => (
            <div key={server.name} className="space-y-1 rounded-md border border-border/70 bg-muted/15 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{server.name}</span>
                  <Badge variant={server.enabled ? "success" : "outline"}>
                    {formatCodexMcpEnabledState(server)}
                  </Badge>
                  <Badge variant="outline">{formatCodexMcpAuthStatus(server.authStatus)}</Badge>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{server.transportType}</span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>URL</span>
                  <span className="font-mono text-foreground">{server.url ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Bearer token env</span>
                  <span className="font-mono text-foreground">{server.bearerTokenEnvVar ?? "-"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.detail ? (
        <div className="space-y-2 rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          <p>{state.detail}</p>
          <p>
            Stave mirrors the Codex-native MCP surface here and forwards slash commands to Codex unchanged.
          </p>
        </div>
      ) : null}
    </SettingsCard>
  );
}

export function DeveloperSection() {
  const providerDebugStream = useAppStore((state) => state.settings.providerDebugStream);
  const [gpuStatus, setGpuStatus] = useState<GpuStatusSnapshot | null>(null);
  const [gpuStatusError, setGpuStatusError] = useState("");
  const updateSettings = useAppStore((state) => state.updateSettings);
  const gpuStatusRows = gpuStatus ? Object.entries(gpuStatus.featureStatus).sort(([left], [right]) => left.localeCompare(right)) : [];

  useEffect(() => {
    let cancelled = false;

    async function loadGpuStatus() {
      const getGpuStatus = window.api?.window?.getGpuStatus;
      if (!getGpuStatus) {
        if (!cancelled) {
          setGpuStatusError("GPU status API unavailable.");
        }
        return;
      }

      try {
        const nextStatus = await getGpuStatus();
        if (cancelled) {
          return;
        }
        setGpuStatus(nextStatus);
        setGpuStatusError("");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGpuStatusError(error instanceof Error ? error.message : "Failed to load GPU status.");
      }
    }

    void loadGpuStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SectionHeading title="Developer" description="Advanced diagnostics and global provider tooling overrides." />
      <SectionStack>
        <ProviderTimeoutCard />

        <SettingsCard
          title="Provider Debug Logging"
          description="Enables verbose stream event logging for all providers in the Electron main-process console."
        >
          <Switch
            checked={providerDebugStream}
            onCheckedChange={(checked) => updateSettings({ patch: { providerDebugStream: checked } })}
          />
        </SettingsCard>

        <SettingsCard
          title="GPU Acceleration"
          description="Electron-reported compositor status for diagnosing WSL2 and filtered transparency performance."
        >
          {gpuStatus ? (
            <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Hardware acceleration</span>
                <span className="font-mono text-muted-foreground">
                  {gpuStatus.hardwareAccelerationEnabled ? "enabled" : "disabled"}
                </span>
              </div>
              <div className="space-y-1">
                {gpuStatusRows.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-mono text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : gpuStatusError ? null : (
            <p className="text-sm text-muted-foreground">Loading GPU status…</p>
          )}
          {gpuStatusError ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              {gpuStatusError}
            </p>
          ) : null}
        </SettingsCard>

        <RepoMapCacheCard />
      </SectionStack>
    </>
  );
}

export function LocalMcpServerCard() {
  const [state, setState] = useState<LocalMcpViewState>({
    status: "loading",
    snapshot: null,
    detail: "Loading local MCP server status...",
    busy: false,
  });

  async function refreshStatus() {
    const getStatus = window.api?.localMcp?.getStatus;
    if (!getStatus) {
      setState({
        status: "error",
        snapshot: null,
        detail: "Local MCP settings API unavailable.",
        busy: false,
      });
      return;
    }

    setState((current) => ({
      ...current,
      status: current.snapshot ? current.status : "loading",
      detail: current.snapshot ? current.detail : "Loading local MCP server status...",
    }));

    try {
      const result = await getStatus();
      if (!result.ok || !result.status) {
        setState({
          status: "error",
          snapshot: null,
          detail: result.message || "Failed to load local MCP status.",
          busy: false,
        });
        return;
      }
      setState({
        status: "ready",
        snapshot: result.status,
        detail: result.status.running
          ? "Local MCP server is running."
          : (result.status.config.enabled
              ? "Local MCP server is configured but not currently running."
              : "Local MCP server is disabled."),
        busy: false,
      });
    } catch (error) {
      setState({
        status: "error",
        snapshot: null,
        detail: error instanceof Error ? error.message : "Failed to load local MCP status.",
        busy: false,
      });
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function applyConfigPatch(patch: {
    enabled?: boolean;
    port?: number;
    token?: string;
    claudeCodeAutoRegister?: boolean;
    codexAutoRegister?: boolean;
  }) {
    const updateConfig = window.api?.localMcp?.updateConfig;
    if (!updateConfig) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: "Local MCP settings API unavailable.",
        busy: false,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      busy: true,
      detail: "Restarting local MCP server...",
    }));

    try {
      const result = await updateConfig(patch);
      if (!result.ok || !result.status) {
        setState((current) => ({
          ...current,
          status: "error",
          detail: result.message || "Failed to update local MCP settings.",
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        snapshot: result.status,
        detail: result.status.running
          ? "Local MCP settings saved and server restarted."
          : (result.status.config.enabled
              ? "Local MCP settings saved."
              : "Local MCP server disabled."),
        busy: false,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : "Failed to update local MCP settings.",
        busy: false,
      }));
    }
  }

  async function handleRotateToken() {
    const rotateToken = window.api?.localMcp?.rotateToken;
    if (!rotateToken) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: "Local MCP settings API unavailable.",
        busy: false,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      busy: true,
      detail: "Generating a new local MCP token and restarting the server...",
    }));

    try {
      const result = await rotateToken();
      if (!result.ok || !result.status) {
        setState((current) => ({
          ...current,
          status: "error",
          detail: result.message || "Failed to rotate local MCP token.",
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        snapshot: result.status,
        detail: "Generated a new local MCP token and restarted the server.",
        busy: false,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : "Failed to rotate local MCP token.",
        busy: false,
      }));
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await copyTextToClipboard(value);
      setState((current) => ({
        ...current,
        detail: `${label} copied to clipboard.`,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : `Failed to copy ${label.toLowerCase()}.`,
      }));
    }
  }

  if (state.status === "loading" && !state.snapshot) {
    return (
      <SettingsCard
        title="Local MCP Server"
        description="Manage the packaged-app loopback MCP endpoint used by same-machine bots and helpers."
      >
        <p className="text-sm text-muted-foreground">Loading local MCP server status...</p>
      </SettingsCard>
    );
  }

  const snapshot = state.snapshot;
  const config = snapshot?.config;
  const manifest = snapshot?.manifest;
  const claudeCodeRegistration = snapshot?.claudeCodeRegistration;
  const codexRegistration = snapshot?.codexRegistration;

  return (
    <SettingsCard
      title="Local MCP Server"
      description="Manage the packaged-app loopback MCP endpoint used by same-machine bots and helpers. CLI auto-registration stays off until you explicitly enable it."
    >
      {snapshot && config ? (
        <>
          <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            `Claude Code` and `Codex` are opt-in. Stave only writes its managed MCP entry to your user-level CLI config files after you turn those settings on.
          </p>

          <SwitchField
            title="Server"
            description="Enable or disable the localhost MCP surface exposed by the desktop app."
            checked={config.enabled}
            onCheckedChange={(checked) => void applyConfigPatch({ enabled: checked })}
          />

          <LabeledField
            title="Port"
            description="Use `0` to let Stave choose any available localhost port when the server starts."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
              inputMode="numeric"
              placeholder="0"
              value={String(config.port)}
              onCommit={(nextValue) => void applyConfigPatch({
                port: Math.max(0, Math.min(65_535, readInt(nextValue.trim(), 0))),
              })}
            />
          </LabeledField>

          <SwitchField
            title="Claude Code"
            description="Opt-in and off by default. When enabled, Stave manages only its own MCP entry in `~/.claude/settings.json` for the external Claude Code app. This does not affect Stave's internal Claude runtime."
            checked={config.claudeCodeAutoRegister}
            onCheckedChange={(checked) => void applyConfigPatch({ claudeCodeAutoRegister: checked })}
          />

          <SwitchField
            title="Codex"
            description="Opt-in and off by default. When enabled, Stave manages only its own MCP entry in `~/.codex/config.toml` for Codex. Stave also injects the current token into the in-app Codex runtime env."
            checked={config.codexAutoRegister}
            onCheckedChange={(checked) => void applyConfigPatch({ codexAutoRegister: checked })}
          />

          <LabeledField
            title="Token"
            description="Bearer token required by local clients. Rotate it to immediately revoke previous access."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <DraftInput
                className="h-10 flex-1 rounded-md border-border/80 bg-background font-mono text-sm"
                spellCheck={false}
                value={config.token}
                onCommit={(nextValue) => void applyConfigPatch({ token: nextValue.trim() })}
              />
              <div className="flex gap-2">
                <Button
                  className="h-10"
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => void handleCopy(config.token, "Token")}
                >
                  Copy
                </Button>
                <Button
                  className="h-10"
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => void handleRotateToken()}
                >
                  Rotate
                </Button>
              </div>
            </div>
          </LabeledField>

          <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="font-mono text-foreground">
                {snapshot.running ? "running" : (config.enabled ? "stopped" : "disabled")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Config file</span>
              <span className="font-mono text-foreground">{snapshot.configPath}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Claude Code</span>
              <span className="font-mono text-foreground">
                {formatClaudeCodeRegistrationState(snapshot.claudeCodeRegistration)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Claude settings</span>
              <span className="font-mono text-foreground">{snapshot.claudeCodeRegistration.configPath}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Codex</span>
              <span className="font-mono text-foreground">
                {formatCodexRegistrationState(snapshot.codexRegistration)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Codex config</span>
              <span className="font-mono text-foreground">{snapshot.codexRegistration.configPath}</span>
            </div>
            {manifest ? (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">MCP URL</span>
                  <span className="font-mono text-foreground">{manifest.url}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Health URL</span>
                  <span className="font-mono text-foreground">{manifest.healthUrl}</span>
                </div>
              </>
            ) : null}
            {snapshot.manifestPaths.map((manifestPath) => (
              <div key={manifestPath} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Manifest</span>
                <span className="font-mono text-foreground">{manifestPath}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="h-9"
              size="sm"
              variant="outline"
              disabled={state.busy}
              onClick={() => void refreshStatus()}
            >
              Refresh Status
            </Button>
            {manifest?.url ? (
              <Button
                className="h-9"
                size="sm"
                variant="outline"
                disabled={state.busy}
                onClick={() => void handleCopy(manifest.url, "MCP URL")}
              >
                Copy URL
              </Button>
            ) : null}
            <Button
              className="h-9"
              size="sm"
              variant="outline"
              disabled={state.busy}
              onClick={() => void handleCopy(snapshot.configPath, "Config path")}
            >
              Copy Config Path
            </Button>
          </div>
        </>
      ) : null}

      {state.detail ? (
        <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {state.detail}
        </p>
      ) : null}
      {claudeCodeRegistration?.detail ? (
        <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {claudeCodeRegistration.detail}
        </p>
      ) : null}
      {codexRegistration?.detail ? (
        <p className="rounded-md border border-border/80 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {codexRegistration.detail}
        </p>
      ) : null}
    </SettingsCard>
  );
}

function getLocalMcpRequestBadgeVariant(log: StaveLocalMcpRequestLog) {
  if (log.statusCode >= 500 || log.errorMessage) {
    return "destructive" as const;
  }
  if (log.statusCode >= 400) {
    return "warning" as const;
  }
  return "success" as const;
}

function getLocalMcpRequestPrimaryLabel(log: StaveLocalMcpRequestLog) {
  if (log.toolName) {
    return log.toolName;
  }
  if (log.rpcMethod) {
    return log.rpcMethod;
  }
  return `${log.httpMethod} ${log.path}`;
}

function getLocalMcpRequestMeta(log: StaveLocalMcpRequestLog) {
  const parts = [log.httpMethod, log.path];
  if (log.rpcMethod) {
    parts.push(log.rpcMethod);
  }
  if (log.rpcRequestId) {
    parts.push(`id=${log.rpcRequestId}`);
  }
  return parts.join(" · ");
}

function getLocalMcpRequestPayloadText(payload: unknown) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function getLocalMcpRequestLogDetail(args: {
  count: number;
  total: number;
  offset: number;
  limit: number;
}) {
  if (args.total === 0) {
    return "No local MCP requests recorded yet.";
  }

  const start = args.offset + 1;
  const end = args.offset + args.count;
  const page = Math.floor(args.offset / args.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(args.total / args.limit));
  const refreshMode = args.offset === 0
    ? "Auto-refresh is active on this page."
    : "Auto-refresh pauses while browsing older pages.";
  return `Showing ${start}-${end} of ${args.total} local MCP requests (page ${page} of ${totalPages}). ${refreshMode}`;
}

type LocalMcpRequestPayloadLoadState =
  | {
      status: "idle" | "loading" | "empty" | "error";
      payload: null;
      error: string;
    }
  | {
      status: "ready";
      payload: unknown;
      error: string;
    };

function LocalMcpRequestPayloadCell({ log }: { log: StaveLocalMcpRequestLog }) {
  const [open, setOpen] = useState(false);
  const [payloadState, setPayloadState] = useState<LocalMcpRequestPayloadLoadState>(
    log.hasRequestPayload
      ? { status: "idle", payload: null, error: "" }
      : { status: "empty", payload: null, error: "" },
  );
  const payloadText = useMemo(() => {
    if (payloadState.status !== "ready") {
      return "";
    }
    return getLocalMcpRequestPayloadText(payloadState.payload);
  }, [payloadState]);

  useEffect(() => {
    if (!log.hasRequestPayload) {
      setOpen(false);
      setPayloadState({ status: "empty", payload: null, error: "" });
      return;
    }
    if (log.requestPayload != null) {
      setPayloadState({ status: "ready", payload: log.requestPayload, error: "" });
    }
  }, [log.hasRequestPayload, log.requestPayload]);

  async function handleTogglePayload() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (!nextOpen || !log.hasRequestPayload || payloadState.status === "loading" || payloadState.status === "ready") {
      return;
    }

    const getRequestLog = window.api?.localMcp?.getRequestLog;
    if (!getRequestLog) {
      setPayloadState({
        status: "error",
        payload: null,
        error: "Local MCP request log API unavailable.",
      });
      return;
    }

    setPayloadState({ status: "loading", payload: null, error: "" });

    try {
      const result = await getRequestLog({ id: log.id, includePayload: true });
      if (!result.ok) {
        setPayloadState({
          status: "error",
          payload: null,
          error: result.message || "Failed to load request payload.",
        });
        return;
      }
      if (result.log?.requestPayload == null) {
        setPayloadState({ status: "empty", payload: null, error: "" });
        return;
      }
      setPayloadState({ status: "ready", payload: result.log.requestPayload, error: "" });
    } catch (error) {
      setPayloadState({
        status: "error",
        payload: null,
        error: error instanceof Error ? error.message : "Failed to load request payload.",
      });
    }
  }

  if (!log.hasRequestPayload) {
    return <span className="text-xs text-muted-foreground">No payload</span>;
  }

  return (
    <div className="rounded-md border border-border/70 bg-muted/20">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void handleTogglePayload()}
      >
        <span>{open ? "Hide request payload" : "View request payload"}</span>
        {payloadState.status === "loading" ? (
          <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </button>

      {open && payloadState.status === "loading" ? (
        <div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          Loading request payload...
        </div>
      ) : null}

      {open && payloadState.status === "ready" ? (
        <pre className="max-h-64 overflow-auto border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {payloadText}
        </pre>
      ) : null}

      {open && payloadState.status === "empty" ? (
        <div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          No payload recorded for this request.
        </div>
      ) : null}

      {open && payloadState.status === "error" ? (
        <div className="border-t border-border/70 px-3 py-2 text-xs text-destructive">
          {payloadState.error}
        </div>
      ) : null}
    </div>
  );
}

export function LocalMcpRequestLogCard() {
  const latestRequestIdRef = useRef(0);
  const [state, setState] = useState<LocalMcpRequestLogViewState>({
    status: "loading",
    logs: [],
    detail: "Loading local MCP request logs...",
    busy: false,
    total: 0,
    limit: LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
    offset: 0,
    hasMore: false,
  });
  const page = Math.floor(state.offset / state.limit) + 1;
  const totalPages = state.total === 0 ? 1 : Math.ceil(state.total / state.limit);

  async function refreshLogs(args?: {
    silent?: boolean;
    offset?: number;
  }) {
    const listRequestLogs = window.api?.localMcp?.listRequestLogs;
    if (!listRequestLogs) {
      setState({
        status: "error",
        logs: [],
        detail: "Local MCP request log API unavailable.",
        busy: false,
        total: 0,
        limit: LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
        offset: 0,
        hasMore: false,
      });
      return;
    }

    const silent = args?.silent === true;
    const offset = args?.offset ?? state.offset;
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    if (!silent) {
      setState((current) => ({
        ...current,
        busy: true,
        status: current.logs.length > 0 ? current.status : "loading",
        detail: current.logs.length > 0 ? current.detail : "Loading local MCP request logs...",
      }));
    }

    try {
      const result = await listRequestLogs({
        limit: LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
        offset,
        includePayload: false,
      });
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      if (!result.ok) {
        setState((current) => ({
          ...current,
          status: "error",
          detail: result.message || "Failed to load local MCP request logs.",
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        logs: result.logs,
        detail: getLocalMcpRequestLogDetail({
          count: result.logs.length,
          total: result.total,
          offset: result.offset,
          limit: result.limit || LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
        }),
        busy: false,
        total: result.total,
        limit: result.limit || LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
        offset: result.offset,
        hasMore: result.hasMore,
      });
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : "Failed to load local MCP request logs.",
        busy: false,
      }));
    }
  }

  useEffect(() => {
    void refreshLogs({ offset: 0 });
  }, []);

  useEffect(() => {
    if (state.offset !== 0) {
      return;
    }
    const intervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void refreshLogs({ silent: true, offset: 0 });
    }, LOCAL_MCP_REQUEST_LOG_AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [state.offset]);

  async function handleClearLogs() {
    const clearRequestLogs = window.api?.localMcp?.clearRequestLogs;
    if (!clearRequestLogs) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: "Local MCP request log API unavailable.",
        busy: false,
      }));
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    setState((current) => ({
      ...current,
      busy: true,
      detail: "Clearing local MCP request logs...",
    }));

    try {
      const result = await clearRequestLogs();
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      if (!result.ok) {
        setState((current) => ({
          ...current,
          status: "error",
          detail: result.message || "Failed to clear local MCP request logs.",
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        logs: [],
        detail: `Cleared ${result.cleared} local MCP request log${result.cleared === 1 ? "" : "s"}.`,
        busy: false,
        total: 0,
        limit: LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
        offset: 0,
        hasMore: false,
      });
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setState((current) => ({
        ...current,
        status: "error",
        detail: error instanceof Error ? error.message : "Failed to clear local MCP request logs.",
        busy: false,
      }));
    }
  }

  function handleShowNewerLogs() {
    if (state.busy || state.offset === 0) {
      return;
    }
    void refreshLogs({ offset: Math.max(0, state.offset - state.limit) });
  }

  function handleShowOlderLogs() {
    if (state.busy || !state.hasMore) {
      return;
    }
    void refreshLogs({ offset: state.offset + state.limit });
  }

  return (
    <SettingsCard
      title="Local MCP Request Log"
      description="Captures recent inbound requests to the embedded local MCP server."
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="max-w-3xl text-sm text-muted-foreground">{state.detail}</span>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-8 gap-1 text-xs"
            variant="outline"
            disabled={state.busy || state.offset === 0}
            onClick={handleShowNewerLogs}
          >
            <ChevronLeft className="size-3.5" />
            Newer
          </Button>
          <Button
            className="h-8 gap-1 text-xs"
            variant="outline"
            disabled={state.busy || !state.hasMore}
            onClick={handleShowOlderLogs}
          >
            Older
            <ChevronRight className="size-3.5" />
          </Button>
          <Button
            className="h-8 text-xs"
            variant="outline"
            disabled={state.busy}
            onClick={() => void refreshLogs({ offset: state.offset })}
          >
            Refresh
          </Button>
          <Button
            className="h-8 text-xs"
            variant="outline"
            disabled={state.busy || state.total === 0}
            onClick={() => void handleClearLogs()}
          >
            Clear
          </Button>
        </div>
      </div>

      {state.logs.length === 0 ? (
        <p className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-muted-foreground">
          No requests yet. Health checks are excluded, the latest page auto-refreshes while it stays open, and payloads load only when you expand a row.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/80 bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Time</TableHead>
                <TableHead>Request</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="align-top text-xs text-muted-foreground" title={log.createdAt}>
                    {formatRelativeTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{getLocalMcpRequestPrimaryLabel(log)}</Badge>
                      {log.toolName && log.rpcMethod ? (
                        <Badge variant="secondary">{log.rpcMethod}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {getLocalMcpRequestMeta(log)}
                    </p>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <Badge variant={getLocalMcpRequestBadgeVariant(log)}>{log.statusCode}</Badge>
                      <span className="text-xs text-muted-foreground">{log.durationMs}ms</span>
                      {log.errorMessage ? (
                        <span className="text-xs text-destructive">{log.errorMessage}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <LocalMcpRequestPayloadCell log={log} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/10 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {state.offset === 0 ? (
              <span className="text-xs text-muted-foreground">
                Auto-refreshing latest page every {Math.floor(LOCAL_MCP_REQUEST_LOG_AUTO_REFRESH_MS / 1000)}s.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Auto-refresh is paused on older pages to keep pagination stable.
              </span>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

// ── Repo-Map Cache Diagnostics ──────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const deltaMs = Date.now() - Date.parse(isoString);
  if (deltaMs < 0) return "just now";
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortenPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, "/").split("/");
  if (parts.length <= 3) return fullPath;
  return `.../${parts.slice(-2).join("/")}`;
}

function RepoMapCacheCard() {
  // useReducer as a cheap force-update mechanism — no external state dependency.
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);
  const snapshot = getRepoMapCacheSnapshot();
  const entries = [...snapshot.entries()];

  return (
    <SettingsCard
      title="Repo-Map Context Cache"
      description="In-memory cache of formatted repo-map context injected on the first AI turn of each task."
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {entries.length === 0
            ? "No entries cached."
            : `${entries.length} workspace${entries.length > 1 ? "s" : ""} cached`}
        </span>
        <div className="flex gap-2">
          <Button
            className="h-8 text-xs"
            variant="outline"
            onClick={forceUpdate}
          >
            Refresh
          </Button>
          {entries.length > 0 && (
            <Button
              className="h-8 text-xs"
              variant="outline"
              onClick={() => {
                clearRepoMapContextCache();
                forceUpdate();
              }}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {entries.map(([workspacePath, entry]) => (
        <RepoMapCacheEntryRow
          key={workspacePath}
          workspacePath={workspacePath}
          entry={entry}
        />
      ))}
    </SettingsCard>
  );
}

function RepoMapCacheEntryRow(props: {
  workspacePath: string;
  entry: Readonly<RepoMapCacheEntry>;
}) {
  const { workspacePath, entry } = props;
  const textSizeKb = (new Blob([entry.text]).size / 1024).toFixed(1);

  return (
    <div className="space-y-1 rounded-md border border-border/80 bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground truncate" title={workspacePath}>
          {shortenPath(workspacePath)}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {textSizeKb} KB
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Files</span>
          <span className="font-mono text-foreground">{entry.fileCount} ({entry.codeFileCount} code)</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Hotspots</span>
          <span className="font-mono text-foreground">{entry.hotspotCount}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Entrypoints</span>
          <span className="font-mono text-foreground">{entry.entrypointCount}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Docs</span>
          <span className="font-mono text-foreground">{entry.docCount}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Snapshot: {formatRelativeTime(entry.snapshotUpdatedAt)}</span>
        <span>Cached: {formatRelativeTime(entry.cachedAt)}</span>
      </div>
    </div>
  );
}

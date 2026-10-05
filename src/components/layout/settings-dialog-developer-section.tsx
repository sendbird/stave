import { formatNumber, formatRelativeTime as formatLocaleRelativeTime } from "@/i18n/format";
import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Loader,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ClaudeContextUsageSnapshot,
  ClaudePluginReloadSnapshot,
} from "@/lib/providers/provider.types";
import {
  DEFAULT_LOCAL_MCP_PORT,
  type StaveLocalMcpRequestLog,
  type StaveLocalMcpStatus,
} from "@/lib/local-mcp";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  formatClaudeSettingSources,
  formatProviderTimeoutLabel,
  formatTokenBudget,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import { useAppStore } from "@/store/app.store";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import {
  DraftInput,
  LabeledField,
  readInt,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";
import { developerStyles } from "./settings-dialog-developer-section.styles";

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

const LOCAL_MCP_REQUEST_LOG_PAGE_SIZE = 25;
const LOCAL_MCP_REQUEST_LOG_AUTO_REFRESH_MS = 5000;

function formatClaudeCodeRegistrationState(
  status: StaveLocalMcpStatus["claudeCodeRegistration"],
) {
  if (status.error) {
    return "error";
  }
  if (!status.autoRegister) {
    return i18n.t("settings:developerSection.localMcp.registrationState.notManaged");
  }
  if (status.installed && status.matchesCurrentManifest) {
    return "registered";
  }
  if (status.installed) {
    return "stale";
  }
  return i18n.t("settings:developerSection.localMcp.registrationState.notInstalled");
}

function formatCodexRegistrationState(
  status: StaveLocalMcpStatus["codexRegistration"],
) {
  if (status.error) {
    return "error";
  }
  if (!status.autoRegister) {
    return i18n.t("settings:developerSection.localMcp.registrationState.notManaged");
  }
  if (status.installed && status.matchesCurrentManifest) {
    return "registered";
  }
  if (status.installed) {
    return "stale";
  }
  return i18n.t("settings:developerSection.localMcp.registrationState.notInstalled");
}

export function ProviderTimeoutCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const providerTimeoutMs = useAppStore(
    (state) => state.settings.providerTimeoutMs,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const selectedValue = providerTimeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS;

  return (
    <SettingsCard
      title={t("settings:developerSection.providerTimeout.title")}
      description={t("settings:developerSection.providerTimeout.description")}
    >
      <LabeledField
        title={t("settings:developerSection.providerTimeout.windowTitle")}
        description={t("settings:developerSection.providerTimeout.windowDescription")}
      >
        <div className={sx(developerStyles.timeoutRow)}>
          <Select
            value={String(selectedValue)}
            onValueChange={(value) =>
              updateSettings({
                patch: { providerTimeoutMs: readInt(value, selectedValue) },
              })
            }
          >
            <SelectTrigger className={sx(developerStyles.timeoutTrigger)}>
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
          <span className={sx(developerStyles.timeoutLabel)}>
            {formatProviderTimeoutLabel(selectedValue)}
          </span>
        </div>
      </LabeledField>
    </SettingsCard>
  );
}

export function CodexBinaryPathCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const codexBinaryPath = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title={t("settings:developerSection.codexBinary.title")}
      description={t("settings:developerSection.codexBinary.description")}
    >
      <DraftInput
        xstyle={developerStyles.binaryInput}
        placeholder="/usr/local/bin/codex"
        value={codexBinaryPath}
        onCommit={(nextValue) =>
          updateSettings({ patch: { codexBinaryPath: nextValue } })
        }
      />
      <div className={sx(developerStyles.warningNote)}>
        <p className={sx(developerStyles.warningTitle)}>
          <TriangleAlert className={sx(developerStyles.warningIcon)} />
          {t("settings:developerSection.codexBinary.baselineTitle")}</p>
        <p className={sx(developerStyles.warningNoteBody)}>
          {t("settings:settingsDialogDeveloperSection.staveTargetsTheCodexAppServer")}</p>
      </div>
    </SettingsCard>
  );
}

export function ClaudeBinaryPathCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const claudeBinaryPath = useAppStore(
    (state) => state.settings.claudeBinaryPath,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title={t("settings:developerSection.claudeBinary.title")}
      description={t("settings:developerSection.claudeBinary.description")}
    >
      <DraftInput
        xstyle={developerStyles.binaryInput}
        placeholder="/usr/local/bin/claude"
        value={claudeBinaryPath}
        onCommit={(nextValue) =>
          updateSettings({ patch: { claudeBinaryPath: nextValue } })
        }
      />
      <p className={sx(developerStyles.note)}>
        {t("settings:settingsDialogDeveloperSection.useThisWhenTheShellClaude")}</p>
    </SettingsCard>
  );
}

export function ClaudeRuntimeToolsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    settings,
    activeTaskId,
    activeWorkspaceId,
    workspacePathById,
    repositoryPath,
    providerSessionByTask,
    refreshProviderCommandCatalog,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings,
          state.activeTaskId,
          state.activeWorkspaceId,
          state.workspacePathById,
          state.repositoryPath,
          state.providerSessionByTask,
          state.refreshProviderCommandCatalog,
        ] as const,
    ),
  );
  const [claudeContextUsage, setClaudeContextUsage] =
    useState<ClaudeContextUsageSnapshot | null>(null);
  const [claudeContextUsageDetail, setClaudeContextUsageDetail] = useState("");
  const [claudePluginReload, setClaudePluginReload] =
    useState<ClaudePluginReloadSnapshot | null>(null);
  const [claudePluginReloadDetail, setClaudePluginReloadDetail] = useState("");
  const [isLoadingClaudeContextUsage, setIsLoadingClaudeContextUsage] =
    useState(false);
  const [isReloadingClaudePlugins, setIsReloadingClaudePlugins] =
    useState(false);
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? undefined;
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
      setClaudeContextUsageDetail(i18n.t("settings:developerSection.claudeRuntime.contextApiUnavailable"));
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
      setClaudeContextUsageDetail(
        error instanceof Error
          ? error.message
          : i18n.t("settings:developerSection.claudeRuntime.contextLoadFailed"),
      );
    } finally {
      setIsLoadingClaudeContextUsage(false);
    }
  }

  async function handleReloadClaudePlugins() {
    const reloadClaudePlugins = window.api?.provider?.reloadClaudePlugins;
    if (!reloadClaudePlugins) {
      setClaudePluginReload(null);
      setClaudePluginReloadDetail(i18n.t("settings:developerSection.claudeRuntime.pluginApiUnavailable"));
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
      setClaudePluginReloadDetail(
        error instanceof Error
          ? error.message
          : i18n.t("settings:developerSection.claudeRuntime.pluginReloadFailed"),
      );
    } finally {
      setIsReloadingClaudePlugins(false);
    }
  }

  return (
    <SettingsCard
      title={t("settings:developerSection.claudeRuntime.title")}
      description={t("settings:developerSection.claudeRuntime.description")}
    >
      <div className={sx(developerStyles.buttonRow)}>
        <Button
          xstyle={developerStyles.actionButtonMd}
          variant="outline"
          disabled={isLoadingClaudeContextUsage}
          onClick={() => void handleLoadClaudeContextUsage()}
        >
          {isLoadingClaudeContextUsage
            ? t("settings:developerSection.claudeRuntime.loadingContext")
            : t("settings:developerSection.claudeRuntime.inspectContext")}
        </Button>
        <Button
          xstyle={developerStyles.actionButtonMd}
          disabled={isReloadingClaudePlugins}
          onClick={() => void handleReloadClaudePlugins()}
        >
          {isReloadingClaudePlugins ? t("settings:developerSection.claudeRuntime.reloadingPlugins") : t("settings:developerSection.claudeRuntime.reloadPlugins")}
        </Button>
      </div>

      <div className={sx(developerStyles.infoPanel)}>
        <div className={sx(developerStyles.infoRow)}>
          <span className={sx(developerStyles.infoLabel)}>{t("settings:sections.groups.workspace")}</span>
          <span className={sx(developerStyles.infoValueMono)}>
            {workspaceCwd ?? t("settings:developerSection.claudeRuntime.processCwd")}
          </span>
        </div>
        <div className={sx(developerStyles.infoRow)}>
          <span className={sx(developerStyles.infoLabel)}>{t("settingsProviders:providersSection.claudeRuntime.settingSources.title")}</span>
          <span className={sx(developerStyles.infoValueMono)}>
            {formatClaudeSettingSources(settings.claudeSettingSources)}
          </span>
        </div>
        <div className={sx(developerStyles.infoRow)}>
          <span className={sx(developerStyles.infoLabel)}>{t("settings:developerSection.claudeRuntime.taskBudget")}</span>
          <span className={sx(developerStyles.infoValueMono)}>
            {formatTokenBudget(settings.claudeTaskBudgetTokens)}
          </span>
        </div>
      </div>

      {claudeContextUsage ? (
        <div className={sx(developerStyles.infoPanelSpaced)}>
          <div className={sx(developerStyles.infoRow)}>
            <span className={sx(developerStyles.infoValueStrong)}>
              {t("settings:developerSection.claudeRuntime.contextUsage")}</span>
            <span className={sx(developerStyles.infoValueMonoMuted)}>
              {formatNumber(claudeContextUsage.totalTokens)} /{" "}
              {formatNumber(claudeContextUsage.maxTokens)} (
              {Math.round(claudeContextUsage.percentage)}%)
            </span>
          </div>
          <div className={sx(developerStyles.rowStack)}>
            {claudeContextUsage.categories.map((category) => (
              <div key={category.name} className={sx(developerStyles.infoRow)}>
                <span className={sx(developerStyles.infoLabel)}>
                  {category.name}
                </span>
                <span className={sx(developerStyles.infoValueMono)}>
                  {formatNumber(category.tokens)}
                </span>
              </div>
            ))}
          </div>
          <div className={sx(developerStyles.infoRow)}>
            <span className={sx(developerStyles.infoLabel)}>{t("settings:developerSection.claudeRuntime.memoryFiles")}</span>
            <span className={sx(developerStyles.infoValueMono)}>
              {claudeContextUsage.memoryFiles.length}
            </span>
          </div>
          <div className={sx(developerStyles.infoRow)}>
            <span className={sx(developerStyles.infoLabel)}>{t("settings:developerSection.claudeRuntime.mcpTools")}</span>
            <span className={sx(developerStyles.infoValueMono)}>
              {claudeContextUsage.mcpTools.length}
            </span>
          </div>
        </div>
      ) : null}
      {claudeContextUsageDetail ? (
        <p className={sx(developerStyles.note)}>{claudeContextUsageDetail}</p>
      ) : null}

      {claudePluginReload ? (
        <div className={sx(developerStyles.infoPanelSpaced)}>
          <div className={sx(developerStyles.pluginGrid)}>
            <div className={sx(developerStyles.pluginCell)}>
              <p className={sx(developerStyles.pluginCellLabel)}>{t("settingsProviders:codexSection.tabs.commands")}</p>
              <p className={sx(developerStyles.pluginCellValue)}>
                {claudePluginReload.commandCount}
              </p>
            </div>
            <div className={sx(developerStyles.pluginCell)}>
              <p className={sx(developerStyles.pluginCellLabel)}>{t("settings:developerSection.claudeRuntime.agents")}</p>
              <p className={sx(developerStyles.pluginCellValue)}>
                {claudePluginReload.agentCount}
              </p>
            </div>
            <div className={sx(developerStyles.pluginCell)}>
              <p className={sx(developerStyles.pluginCellLabel)}>{t("settingsProviders:codexExtensionsTab.plugins")}</p>
              <p className={sx(developerStyles.pluginCellValue)}>
                {claudePluginReload.plugins.length}
              </p>
            </div>
            <div className={sx(developerStyles.pluginCell)}>
              <p className={sx(developerStyles.pluginCellLabel)}>{t("settings:developerSection.claudeRuntime.errors")}</p>
              <p className={sx(developerStyles.pluginCellValue)}>
                {claudePluginReload.errorCount}
              </p>
            </div>
          </div>
          {claudePluginReload.plugins.length > 0 ? (
            <div className={sx(developerStyles.rowStack)}>
              {claudePluginReload.plugins.map((plugin) => (
                <div
                  key={`${plugin.name}:${plugin.path}`}
                  className={sx(developerStyles.infoRow)}
                >
                  <span className={sx(developerStyles.infoLabel)}>
                    {plugin.name}
                  </span>
                  <span className={sx(developerStyles.infoValueMono)}>
                    {plugin.path}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {claudePluginReload.mcpServers.length > 0 ? (
            <div className={sx(developerStyles.rowStack)}>
              {claudePluginReload.mcpServers.map((server) => (
                <div key={server.name} className={sx(developerStyles.infoRow)}>
                  <span className={sx(developerStyles.infoLabel)}>
                    {server.name}
                  </span>
                  <span className={sx(developerStyles.infoValueMono)}>
                    {server.status}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {claudePluginReloadDetail ? (
        <p className={sx(developerStyles.note)}>{claudePluginReloadDetail}</p>
      ) : null}
    </SettingsCard>
  );
}

export function DeveloperSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const providerDebugStream = useAppStore(
    (state) => state.settings.providerDebugStream,
  );
  const [gpuStatus, setGpuStatus] = useState<GpuStatusSnapshot | null>(null);
  const [gpuStatusError, setGpuStatusError] = useState("");
  const updateSettings = useAppStore((state) => state.updateSettings);
  const gpuStatusRows = gpuStatus
    ? Object.entries(gpuStatus.featureStatus).sort(([left], [right]) =>
        left.localeCompare(right),
      )
    : [];

  useEffect(() => {
    let cancelled = false;

    async function loadGpuStatus() {
      const getGpuStatus = window.api?.window?.getGpuStatus;
      if (!getGpuStatus) {
        if (!cancelled) {
          setGpuStatusError(i18n.t("settings:messages.gpuStatusUnavailable"));
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
        setGpuStatusError(
          error instanceof Error ? error.message : i18n.t("settings:messages.gpuStatusFailed"),
        );
      }
    }

    void loadGpuStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SectionStack>
        <ProviderTimeoutCard />

        <SettingsCard
          title={t("settings:developerSection.debugLogging.title")}
          description={t("settings:developerSection.debugLogging.description")}
        >
          <Switch
            checked={providerDebugStream}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { providerDebugStream: checked } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title={t("settings:developerSection.gpu.title")}
          description={t("settings:developerSection.gpu.description")}
        >
          {gpuStatus ? (
            <div className={sx(developerStyles.infoPanelSpaced)}>
              <div className={sx(developerStyles.infoRow)}>
                <span className={sx(developerStyles.infoValueStrong)}>
                  {t("settings:developerSection.gpu.hardwareAcceleration")}</span>
                <span className={sx(developerStyles.infoValueMonoMuted)}>
                  {gpuStatus.hardwareAccelerationEnabled
                    ? t("settingsProviders:codexExtensionsTab.enabled")
                    : t("settingsProviders:codexAdvancedTab.layers.disabled")}
                </span>
              </div>
              <div className={sx(developerStyles.gpuStatusRows)}>
                {gpuStatusRows.map(([key, value]) => (
                  <div key={key} className={sx(developerStyles.infoRow)}>
                    <span className={sx(developerStyles.infoLabel)}>{key}</span>
                    <span className={sx(developerStyles.infoValueMono)}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : gpuStatusError ? null : (
            <p className={sx(developerStyles.loadingCopy)}>
              {t("settings:developerSection.gpu.loading")}</p>
          )}
          {gpuStatusError ? (
            <p className={sx(developerStyles.warningNote)}>{gpuStatusError}</p>
          ) : null}
        </SettingsCard>
      </SectionStack>
    </>
  );
}

export function LocalMcpServerCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [state, setState] = useState<LocalMcpViewState>({
    status: "loading",
    snapshot: null,
    detail: t("settings:developerSection.localMcp.detail.loading"),
    busy: false,
  });

  async function refreshStatus() {
    const getStatus = window.api?.localMcp?.getStatus;
    if (!getStatus) {
      setState({
        status: "error",
        snapshot: null,
        detail: i18n.t("settings:developerSection.localMcp.detail.apiUnavailable"),
        busy: false,
      });
      return;
    }

    setState((current) => ({
      ...current,
      status: current.snapshot ? current.status : "loading",
      detail: current.snapshot
        ? current.detail
        : i18n.t("settings:developerSection.localMcp.detail.loading"),
    }));

    try {
      const result = await getStatus();
      if (!result.ok || !result.status) {
        setState({
          status: "error",
          snapshot: null,
          detail: result.message || i18n.t("settings:developerSection.localMcp.detail.loadFailed"),
          busy: false,
        });
        return;
      }
      setState({
        status: "ready",
        snapshot: result.status,
        detail: result.status.running
          ? i18n.t("settings:developerSection.localMcp.detail.running")
          : result.status.config.enabled
            ? i18n.t("settings:developerSection.localMcp.detail.configuredNotRunning")
            : i18n.t("settings:developerSection.localMcp.detail.disabled"),
        busy: false,
      });
    } catch (error) {
      setState({
        status: "error",
        snapshot: null,
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("settings:developerSection.localMcp.detail.loadFailed"),
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
    browserToolsEnabled?: boolean;
  }) {
    const updateConfig = window.api?.localMcp?.updateConfig;
    if (!updateConfig) {
      setState((current) => ({
        ...current,
        status: "error",
        detail: i18n.t("settings:developerSection.localMcp.detail.apiUnavailable"),
        busy: false,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      busy: true,
      detail: i18n.t("settings:developerSection.localMcp.detail.restarting"),
    }));

    try {
      const result = await updateConfig(patch);
      if (!result.ok || !result.status) {
        setState((current) => ({
          ...current,
          status: "error",
          detail: result.message || i18n.t("settings:developerSection.localMcp.detail.updateFailed"),
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        snapshot: result.status,
        detail: result.status.running
          ? i18n.t("settings:developerSection.localMcp.detail.savedAndRestarted")
          : result.status.config.enabled
            ? i18n.t("settings:developerSection.localMcp.detail.saved")
            : i18n.t("settings:developerSection.localMcp.detail.serverDisabled"),
        busy: false,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("settings:developerSection.localMcp.detail.updateFailed"),
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
        detail: i18n.t("settings:developerSection.localMcp.detail.apiUnavailable"),
        busy: false,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      busy: true,
      detail: i18n.t("settings:developerSection.localMcp.detail.rotating"),
    }));

    try {
      const result = await rotateToken();
      if (!result.ok || !result.status) {
        setState((current) => ({
          ...current,
          status: "error",
          detail: result.message || i18n.t("settings:developerSection.localMcp.detail.rotateFailed"),
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        snapshot: result.status,
        detail: i18n.t("settings:developerSection.localMcp.detail.rotated"),
        busy: false,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("settings:developerSection.localMcp.detail.rotateFailed"),
        busy: false,
      }));
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await copyTextToClipboard(value);
      setState((current) => ({
        ...current,
        detail: i18n.t("settings:settingsDialogDeveloperSection.copiedToClipboard", { value1: label }),
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("settings:settingsDialogDeveloperSection.failedToCopy", { value1: label.toLowerCase() }),
      }));
    }
  }

  if (state.status === "loading" && !state.snapshot) {
    return (
      <SettingsCard
        title={t("settings:developerSection.localMcp.title")}
        description={t("settings:developerSection.localMcp.description")}
      >
        <p className={sx(developerStyles.loadingCopy)}>
          {t("settings:developerSection.localMcp.detail.loading")}</p>
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
      title={t("settings:developerSection.localMcp.title")}
      description={t("settings:developerSection.localMcp.descriptionWithOptIn")}
    >
      {snapshot && config ? (
        <>
          <p className={sx(developerStyles.note)}>
            {t("settings:developerSection.localMcp.optInNote")}</p>

          <SwitchField
            title={t("settings:developerSection.localMcp.server.title")}
            description={t("settings:developerSection.localMcp.server.description")}
            checked={config.enabled}
            onCheckedChange={(checked) =>
              void applyConfigPatch({ enabled: checked })
            }
          />

          <LabeledField
            title={t("settings:developerSection.localMcp.port.title")}
            description={t("settings:developerSection.localMcp.port.description")}
          >
            <DraftInput
              xstyle={developerStyles.binaryInput}
              inputMode="numeric"
              placeholder={String(DEFAULT_LOCAL_MCP_PORT)}
              value={String(config.port)}
              onCommit={(nextValue) =>
                void applyConfigPatch({
                  port: Math.max(
                    0,
                    Math.min(65_535, readInt(nextValue.trim(), 0)),
                  ),
                })
              }
            />
          </LabeledField>

          <SwitchField
            title="Claude Code"
            description={t("settings:developerSection.localMcp.claudeCode.description")}
            checked={config.claudeCodeAutoRegister}
            onCheckedChange={(checked) =>
              void applyConfigPatch({ claudeCodeAutoRegister: checked })
            }
          />

          <SwitchField
            title="Codex"
            description={t("settings:developerSection.localMcp.codex.description")}
            checked={config.codexAutoRegister}
            onCheckedChange={(checked) =>
              void applyConfigPatch({ codexAutoRegister: checked })
            }
          />

          <SwitchField
            title={t("settings:developerSection.localMcp.browserTools.title")}
            description={t("settings:developerSection.localMcp.browserTools.description")}
            checked={config.browserToolsEnabled !== false}
            onCheckedChange={(checked) =>
              void applyConfigPatch({ browserToolsEnabled: checked })
            }
          />

          <LabeledField
            title={t("settings:developerSection.localMcp.token.title")}
            description={t("settings:developerSection.localMcp.token.description")}
          >
            <div className={sx(developerStyles.tokenFieldRow)}>
              <DraftInput
                xstyle={developerStyles.tokenInput}
                spellCheck={false}
                value={config.token}
                onCommit={(nextValue) =>
                  void applyConfigPatch({ token: nextValue.trim() })
                }
              />
              <div className={sx(developerStyles.tokenButtons)}>
                <Button
                  xstyle={developerStyles.actionButtonLg}
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => void handleCopy(config.token, t("settings:messages.tokenName"))}
                >
                  {t("common:actions.copy")}</Button>
                <Button
                  xstyle={developerStyles.actionButtonLg}
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => void handleRotateToken()}
                >
                  {t("settings:themeSection.motion.beamSize.rotate.label")}</Button>
              </div>
            </div>
          </LabeledField>

          <div className={sx(developerStyles.infoPanelSpaced)}>
            <div className={sx(developerStyles.infoRow)}>
              <span className={sx(developerStyles.infoLabel)}>{t("settings:developerSection.requestLog.columns.status")}</span>
              <span className={sx(developerStyles.infoValueMono)}>
                {snapshot.running
                  ? t("settings:developerSection.localMcp.serverState.running")
                  : config.enabled
                    ? t("settings:developerSection.localMcp.serverState.stopped")
                    : t("settingsProviders:codexAdvancedTab.layers.disabled")}
              </span>
            </div>
            <div className={sx(developerStyles.infoRow)}>
              <span className={sx(developerStyles.infoLabel)}>{t("settings:developerSection.localMcp.info.configFile")}</span>
              <span className={sx(developerStyles.infoValueMono)}>
                {snapshot.configPath}
              </span>
            </div>
            <div className={sx(developerStyles.infoRow)}>
              <span className={sx(developerStyles.infoLabel)}>Claude Code</span>
              <span className={sx(developerStyles.infoValueMono)}>
                {formatClaudeCodeRegistrationState(
                  snapshot.claudeCodeRegistration,
                )}
              </span>
            </div>
            <div className={sx(developerStyles.infoRow)}>
              <span className={sx(developerStyles.infoLabel)}>
                {t("settings:developerSection.localMcp.info.claudeSettings")}</span>
              <span className={sx(developerStyles.infoValueMono)}>
                {snapshot.claudeCodeRegistration.configPath}
              </span>
            </div>
            <div className={sx(developerStyles.infoRow)}>
              <span className={sx(developerStyles.infoLabel)}>Codex</span>
              <span className={sx(developerStyles.infoValueMono)}>
                {formatCodexRegistrationState(snapshot.codexRegistration)}
              </span>
            </div>
            <div className={sx(developerStyles.infoRow)}>
              <span className={sx(developerStyles.infoLabel)}>
                {t("settings:developerSection.localMcp.info.codexConfig")}</span>
              <span className={sx(developerStyles.infoValueMono)}>
                {snapshot.codexRegistration.configPath}
              </span>
            </div>
            {manifest ? (
              <>
                <div className={sx(developerStyles.infoRow)}>
                  <span className={sx(developerStyles.infoLabel)}>{t("settings:developerSection.localMcp.info.mcpUrl")}</span>
                  <span className={sx(developerStyles.infoValueMono)}>
                    {manifest.url}
                  </span>
                </div>
                <div className={sx(developerStyles.infoRow)}>
                  <span className={sx(developerStyles.infoLabel)}>
                    {t("settings:developerSection.localMcp.info.healthUrl")}</span>
                  <span className={sx(developerStyles.infoValueMono)}>
                    {manifest.healthUrl}
                  </span>
                </div>
              </>
            ) : null}
            {snapshot.manifestPaths.map((manifestPath) => (
              <div key={manifestPath} className={sx(developerStyles.infoRow)}>
                <span className={sx(developerStyles.infoLabel)}>{i18n.t("settings:developerSection.localMcp.info.manifest")}</span>
                <span className={sx(developerStyles.infoValueMono)}>
                  {manifestPath}
                </span>
              </div>
            ))}
          </div>

          <div className={sx(developerStyles.buttonRow)}>
            <Button
              xstyle={developerStyles.actionButtonMd}
              size="sm"
              variant="outline"
              disabled={state.busy}
              onClick={() => void refreshStatus()}
            >
              {t("settings:developerSection.localMcp.actions.refreshStatus")}</Button>
            {manifest?.url ? (
              <Button
                xstyle={developerStyles.actionButtonMd}
                size="sm"
                variant="outline"
                disabled={state.busy}
                onClick={() => void handleCopy(manifest.url, "MCP URL")}
              >
                {t("settings:developerSection.localMcp.actions.copyUrl")}</Button>
            ) : null}
            <Button
              xstyle={developerStyles.actionButtonMd}
              size="sm"
              variant="outline"
              disabled={state.busy}
              onClick={() =>
                void handleCopy(snapshot.configPath, i18n.t("settings:settingsDialogDeveloperSection.configPath"))
              }
            >
              {t("settings:developerSection.localMcp.actions.copyConfigPath")}</Button>
          </div>
        </>
      ) : null}

      {state.detail ? (
        <p className={sx(developerStyles.note)}>{state.detail}</p>
      ) : null}
      {claudeCodeRegistration?.detail ? (
        <p className={sx(developerStyles.note)}>
          {claudeCodeRegistration.detail}
        </p>
      ) : null}
      {codexRegistration?.detail ? (
        <p className={sx(developerStyles.note)}>{codexRegistration.detail}</p>
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
    return i18n.t("settings:developerSection.requestLog.detail.none");
  }

  const start = args.offset + 1;
  const end = args.offset + args.count;
  const page = Math.floor(args.offset / args.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(args.total / args.limit));
  const refreshMode =
    args.offset === 0
      ? i18n.t("settings:settingsDialogDeveloperSection.autoRefreshIsActiveOnThis")
      : i18n.t("settings:settingsDialogDeveloperSection.autoRefreshPausesWhileBrowsingOlder");
  return i18n.t("settings:settingsDialogDeveloperSection.showingOfLocalMCPRequestsPage", { value1: start, value2: end, value3: args.total, value4: page, value5: totalPages, value6: refreshMode });
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
  const { t } = useTranslation(I18N_NAMESPACES);
  const [open, setOpen] = useState(false);
  const [payloadState, setPayloadState] =
    useState<LocalMcpRequestPayloadLoadState>(
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
      setPayloadState({
        status: "ready",
        payload: log.requestPayload,
        error: "",
      });
    }
  }, [log.hasRequestPayload, log.requestPayload]);

  async function handleTogglePayload() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (
      !nextOpen ||
      !log.hasRequestPayload ||
      payloadState.status === "loading" ||
      payloadState.status === "ready"
    ) {
      return;
    }

    const getRequestLog = window.api?.localMcp?.getRequestLog;
    if (!getRequestLog) {
      setPayloadState({
        status: "error",
        payload: null,
        error: i18n.t("settings:developerSection.requestLog.detail.apiUnavailable"),
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
          error: result.message || i18n.t("settings:developerSection.requestLog.payload.loadFailed"),
        });
        return;
      }
      if (result.log?.requestPayload == null) {
        setPayloadState({ status: "empty", payload: null, error: "" });
        return;
      }
      setPayloadState({
        status: "ready",
        payload: result.log.requestPayload,
        error: "",
      });
    } catch (error) {
      setPayloadState({
        status: "error",
        payload: null,
        error:
          error instanceof Error
            ? error.message
            : i18n.t("settings:developerSection.requestLog.payload.loadFailed"),
      });
    }
  }

  if (!log.hasRequestPayload) {
    return (
      <span className={sx(developerStyles.payloadEmptyLabel)}>{t("settings:developerSection.requestLog.payload.none")}</span>
    );
  }

  return (
    <div className={sx(developerStyles.payloadFrame)}>
      <AdsButton
        type="button"
        variant="quiet"
        flushInline
        layout="host"
        xstyle={developerStyles.payloadToggle}
        onClick={() => void handleTogglePayload()}
      >
        <span>{open ? t("settings:developerSection.requestLog.payload.hide") : t("settings:developerSection.requestLog.payload.show")}</span>
        {payloadState.status === "loading" ? (
          <Loader
            aria-hidden
            className={sx(developerStyles.loaderMuted)}
            size="xs"
            variant="spinner"
          />
        ) : null}
      </AdsButton>

      {open && payloadState.status === "loading" ? (
        <div className={sx(developerStyles.payloadLoaderCell)}>
          {t("settings:developerSection.requestLog.payload.loading")}</div>
      ) : null}

      {open && payloadState.status === "ready" ? (
        <pre className={sx(developerStyles.payloadPre)}>{payloadText}</pre>
      ) : null}

      {open && payloadState.status === "empty" ? (
        <div className={sx(developerStyles.payloadLoaderCell)}>
          {t("settings:developerSection.requestLog.payload.notRecorded")}</div>
      ) : null}

      {open && payloadState.status === "error" ? (
        <div className={sx(developerStyles.payloadError)}>
          {payloadState.error}
        </div>
      ) : null}
    </div>
  );
}

export function LocalMcpRequestLogCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const latestRequestIdRef = useRef(0);
  const [state, setState] = useState<LocalMcpRequestLogViewState>({
    status: "loading",
    logs: [],
    detail: t("settings:developerSection.requestLog.detail.loading"),
    busy: false,
    total: 0,
    limit: LOCAL_MCP_REQUEST_LOG_PAGE_SIZE,
    offset: 0,
    hasMore: false,
  });
  const page = Math.floor(state.offset / state.limit) + 1;
  const totalPages =
    state.total === 0 ? 1 : Math.ceil(state.total / state.limit);

  async function refreshLogs(args?: { silent?: boolean; offset?: number }) {
    const listRequestLogs = window.api?.localMcp?.listRequestLogs;
    if (!listRequestLogs) {
      setState({
        status: "error",
        logs: [],
        detail: i18n.t("settings:developerSection.requestLog.detail.apiUnavailable"),
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
        detail:
          current.logs.length > 0
            ? current.detail
            : i18n.t("settings:developerSection.requestLog.detail.loading"),
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
          detail: result.message || i18n.t("settings:developerSection.requestLog.detail.loadFailed"),
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
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("settings:developerSection.requestLog.detail.loadFailed"),
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
        detail: i18n.t("settings:developerSection.requestLog.detail.apiUnavailable"),
        busy: false,
      }));
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    setState((current) => ({
      ...current,
      busy: true,
      detail: i18n.t("settings:developerSection.requestLog.detail.clearing"),
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
          detail: result.message || i18n.t("settings:developerSection.requestLog.detail.clearFailed"),
          busy: false,
        }));
        return;
      }
      setState({
        status: "ready",
        logs: [],
        detail: i18n.t("settings:messages.clearedLogs", { count: result.cleared }),
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
        detail:
          error instanceof Error
            ? error.message
            : i18n.t("settings:developerSection.requestLog.detail.clearFailed"),
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
      title={t("settings:developerSection.requestLog.title")}
      description={t("settings:developerSection.requestLog.description")}
    >
      <div className={sx(developerStyles.logHeaderRow)}>
        <span className={sx(developerStyles.logHeaderDetail)}>
          {state.detail}
        </span>
        <div className={sx(developerStyles.buttonRow)}>
          <Button
            xstyle={developerStyles.actionButtonSmGap}
            variant="outline"
            disabled={state.busy || state.offset === 0}
            onClick={handleShowNewerLogs}
          >
            <ChevronLeft className={sx(developerStyles.pagerIcon)} />
            {t("settings:developerSection.requestLog.newer")}</Button>
          <Button
            xstyle={developerStyles.actionButtonSmGap}
            variant="outline"
            disabled={state.busy || !state.hasMore}
            onClick={handleShowOlderLogs}
          >
            {t("settings:developerSection.requestLog.older")}<ChevronRight className={sx(developerStyles.pagerIcon)} />
          </Button>
          <Button
            xstyle={developerStyles.actionButtonSmText}
            variant="outline"
            disabled={state.busy}
            onClick={() => void refreshLogs({ offset: state.offset })}
          >
            {t("common:actions.refresh")}</Button>
          <Button
            xstyle={developerStyles.actionButtonSmText}
            variant="outline"
            disabled={state.busy || state.total === 0}
            onClick={() => void handleClearLogs()}
          >
            {t("common:actions.clear")}</Button>
        </div>
      </div>

      {state.logs.length === 0 ? (
        <p className={sx(developerStyles.logEmpty)}>
          {t("settings:developerSection.requestLog.empty")}</p>
      ) : (
        <div className={sx(developerStyles.logTableFrame)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={sx(developerStyles.colTime)}>
                  {t("settings:developerSection.requestLog.columns.time")}</TableHead>
                <TableHead>{t("settings:developerSection.requestLog.columns.request")}</TableHead>
                <TableHead className={sx(developerStyles.colStatus)}>
                  {t("settings:developerSection.requestLog.columns.status")}</TableHead>
                <TableHead>{t("settings:developerSection.requestLog.columns.payload")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell
                    className={sx(developerStyles.cellTopTime)}
                    title={log.createdAt}
                  >
                    {formatRelativeTime(log.createdAt)}
                  </TableCell>
                  <TableCell className={sx(developerStyles.cellTop)}>
                    <div className={sx(developerStyles.requestBadges)}>
                      <Badge variant="outline">
                        {getLocalMcpRequestPrimaryLabel(log)}
                      </Badge>
                      {log.toolName && log.rpcMethod ? (
                        <Badge variant="secondary">{log.rpcMethod}</Badge>
                      ) : null}
                    </div>
                    <p className={sx(developerStyles.requestMeta)}>
                      {getLocalMcpRequestMeta(log)}
                    </p>
                  </TableCell>
                  <TableCell className={sx(developerStyles.cellTop)}>
                    <div className={sx(developerStyles.statusCell)}>
                      <Badge variant={getLocalMcpRequestBadgeVariant(log)}>
                        {log.statusCode}
                      </Badge>
                      <span className={sx(developerStyles.statusDuration)}>
                        {t("settings:whole.durationMs", { value: log.durationMs })}
                      </span>
                      {log.errorMessage ? (
                        <span className={sx(developerStyles.statusError)}>
                          {log.errorMessage}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={sx(developerStyles.cellTop)}>
                    <LocalMcpRequestPayloadCell log={log} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className={sx(developerStyles.tableFooter)}>
            <span className={sx(developerStyles.tableFooterNote)}>
              {t("settings:whole.pageOf", { page, total: totalPages })}
            </span>
            {state.offset === 0 ? (
              <span className={sx(developerStyles.tableFooterNote)}>
                {t("settings:whole.autoRefresh", { seconds: Math.floor(LOCAL_MCP_REQUEST_LOG_AUTO_REFRESH_MS / 1000) })}
              </span>
            ) : (
              <span className={sx(developerStyles.tableFooterNote)}>
                {t("settings:developerSection.requestLog.autoRefreshPaused")}</span>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function formatRelativeTime(isoString: string): string {
  return formatLocaleRelativeTime(isoString);
}

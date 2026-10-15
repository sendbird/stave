import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { PROVIDER_LOGIN_COMMAND } from "@/lib/providers/provider-login-commands";
import type { SectionId } from "./settings-dialog.schema";
import { useAccountRuntimeOptions } from "@/lib/providers/use-provider-accounts";
import { getCodexModelAvailabilityGuidance } from "@/lib/providers/codex-model-requirements";
import { getClaudeModelVersionGuidance } from "@/lib/providers/claude-model-requirements";
import { useEffect, useState } from "react";
import {
  Bot,
  Code2,
  Copy,
  GitBranch,
  GitPullRequest,
  RefreshCcw,
  TerminalSquare,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, toast } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  ToolingStatusEntry,
  ToolingStatusId,
  ToolingStatusSnapshot,
  ToolingStatusState,
} from "@/lib/tooling-status";
import { useAppStore } from "@/store/app.store";
import { publishProviderTooling, useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";
import { providerConfigurationKey } from "@/lib/providers/provider-readiness";
import { providerToolingStatePatch } from "@/store/provider-tooling";
import {
  InfoRow,
  SectionStack,
  SettingsCard,
  StatusBadge,
} from "./settings-dialog.shared";
import { toolingStyles } from "./settings-dialog-tooling-section.styles";

const TOOL_PURPOSE_BY_ID: Record<ToolingStatusId, string> = {
  get shell() { return i18n.t("settingsProviders:toolingSection.purpose.shell"); },
  get git() { return i18n.t("settingsProviders:toolingSection.purpose.git"); },
  get gh() { return i18n.t("settingsProviders:toolingSection.purpose.gh"); },
  get claude() { return i18n.t("settingsProviders:settingsDialogToolingSection.claudeCodeTurnsPluginRefreshAnd", { value1: getClaudeModelVersionGuidance("claude-opus-5-5"), value2: getClaudeModelVersionGuidance("claude-sonnet-5-5"), value3: getClaudeModelVersionGuidance("claude-haiku-5-5") }); },
  get codex() { return i18n.t("settingsProviders:settingsDialogToolingSection.codexTurnsAndCodexNativeExecution", { value1: getCodexModelAvailabilityGuidance() }); },
  get cursor() { return i18n.t("settingsProviders:toolingSection.purpose.cursor"); },
  get kiro() { return i18n.t("settingsProviders:toolingSection.purpose.kiro"); },
  get opencode() { return i18n.t("settingsProviders:toolingSection.purpose.opencode"); },
};

const AUTH_COMMAND_BY_ID: Partial<Record<ToolingStatusId, string>> = PROVIDER_LOGIN_COMMAND;

function AuthBadge(args: { tool: ToolingStatusEntry }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const label =
    args.tool.authState === "authenticated"
      ? t("settingsProviders:toolingSection.auth.authenticated")
      : args.tool.authState === "unauthenticated"
        ? t("settingsProviders:toolingSection.auth.unauthenticated")
        : args.tool.authState === "not-required"
          ? // OpenCode signs in per provider itself; Stave has nothing to verify.
            args.tool.id === "opencode"
            ? t("settingsProviders:toolingSection.auth.managedInCli")
            : t("settingsProviders:toolingSection.auth.notRequired")
          : t("settingsProviders:toolingSection.auth.unknown");

  const toneStyle =
    args.tool.authState === "authenticated"
      ? toolingStyles.authBadgeAuthenticated
      : args.tool.authState === "unauthenticated"
        ? toolingStyles.authBadgeUnauthenticated
        : toolingStyles.authBadgeNeutral;

  return (
    <Badge
      variant="secondary"
      className={sx(toolingStyles.authBadge, toneStyle)}
    >
      {label}
    </Badge>
  );
}

function ToolStateLabel(state: ToolingStatusState) {
  const { t } = useTranslation(I18N_NAMESPACES);
  switch (state) {
    case "ready":
      return t("common:status.ready");
    case "warning":
      return t("settingsProviders:toolingSection.state.warning");
    case "error":
      return t("settingsProviders:toolingSection.state.error");
    default:
      return t("common:status.unknown");
  }
}

function ToolIcon(args: { id: ToolingStatusId }) {
  const Icon =
    args.id === "shell"
      ? TerminalSquare
      : args.id === "git"
        ? GitBranch
        : args.id === "gh"
          ? GitPullRequest
          : args.id === "claude"
            ? Bot
            : Code2;

  return <Icon className={sx(toolingStyles.toolIcon)} />;
}

function PathRow(args: { label: string; value: string | null }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (!args.value) {
    return (
      <div className={sx(toolingStyles.pathRowEmpty)}>
        <span className={sx(toolingStyles.pathLabel)}>{args.label}</span>
        <span className={sx(toolingStyles.pathValueDash)}>-</span>
      </div>
    );
  }
  return (
    <div className={sx(toolingStyles.pathRow)}>
      <span className={sx(toolingStyles.pathLabelShrink)}>{args.label}</span>
      <div className={sx(toolingStyles.pathValueGroup)}>
        <span className={sx(toolingStyles.pathValue)}>{args.value}</span>
        <Tooltip content={t("settingsConnections:settingsDialogSecrets.copy", { value1: args.label })}>
          <Button
            type="button"
            variant="quiet"
            iconOnly
            size="xs"
            aria-label={t("settingsConnections:settingsDialogSecrets.copy", { value1: args.label })}
            xstyle={toolingStyles.copyButton}
            onClick={() => {
              void copyTextToClipboard(args.value!).then(() => {
                toast.success(i18n.t("settingsProviders:toolingSection.toasts.pathCopied"));
              });
            }}
          >
            <Copy className={sx(toolingStyles.copyIcon)} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

function ToolCard(args: {
  tool: ToolingStatusEntry;
  canOpenTerminal: boolean;
  onOpenTerminal: () => Promise<void>;
  onCopyRepairCommand: (command: string, label: string) => Promise<void>;
  onCopyRepairAndOpenTerminal: (
    command: string,
    label: string,
  ) => Promise<void>;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const repairCommand = AUTH_COMMAND_BY_ID[args.tool.id] ?? null;

  return (
    <div className={sx(toolingStyles.card)}>
      <div className={sx(toolingStyles.cardHeaderRow)}>
        <div className={sx(toolingStyles.cardHeaderInfo)}>
          <div className={sx(toolingStyles.cardTitleRow)}>
            <span className={sx(toolingStyles.iconPlate)}>
              <ToolIcon id={args.tool.id} />
            </span>
            <div className={sx(toolingStyles.cardTitleText)}>
              <p className={sx(toolingStyles.toolLabel)}>{args.tool.label}</p>
              <p className={sx(toolingStyles.toolPurpose)}>
                {TOOL_PURPOSE_BY_ID[args.tool.id]}
              </p>
            </div>
          </div>
        </div>

        <div className={sx(toolingStyles.badgeGroup)}>
          <StatusBadge
            state={args.tool.state}
            label={ToolStateLabel(args.tool.state)}
          />
          <AuthBadge tool={args.tool} />
          {args.tool.version ? (
            <Badge
              variant="secondary"
              className={sx(toolingStyles.versionBadge)}
            >
              {args.tool.version}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className={sx(toolingStyles.cardBody)}>
        <InfoRow label={t("settingsProviders:toolingSection.rows.summary")} value={args.tool.summary} />
        <PathRow label={t("settingsProviders:toolingSection.rows.executable")} value={args.tool.executablePath} />
      </div>

      {args.tool.detail ? (
        <div className={sx(toolingStyles.detailBox)}>
          <p className={sx(toolingStyles.detailText)}>{args.tool.detail}</p>
        </div>
      ) : null}

      <div className={sx(toolingStyles.cardActions)}>
        {repairCommand ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void args.onCopyRepairCommand(repairCommand, args.tool.label)
              }
            >
              <Copy className={sx(toolingStyles.actionIcon)} />
              {t("settingsProviders:toolingSection.actions.copyLoginCommand")}</Button>
            <Button
              type="button"
              size="sm"
              disabled={!args.canOpenTerminal}
              onClick={() =>
                void args.onCopyRepairAndOpenTerminal(
                  repairCommand,
                  args.tool.label,
                )
              }
            >
              <TerminalSquare className={sx(toolingStyles.actionIcon)} />
              {t("settingsProviders:toolingSection.actions.fixInTerminal")}</Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!args.canOpenTerminal}
            onClick={() => void args.onOpenTerminal()}
          >
            <TerminalSquare className={sx(toolingStyles.actionIcon)} />
            {t("settingsProviders:toolingSection.actions.openTerminal")}</Button>
        )}
      </div>
    </div>
  );
}

/** Accounts and API connections used to live here; point people who look here to them. */
function AccountsMovedNotice(props: { onNavigateSection?: (id: SectionId) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <SettingsCard title={t("settingsProviders:toolingSection.accountsMoved.title")}>
      <div className={sx(toolingStyles.movedNotice)}>
        <span>{t("settingsProviders:toolingSection.accountsMoved.body")}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => props.onNavigateSection?.("accounts")}>
          {t("settingsProviders:toolingSection.accountsMoved.action")}
        </Button>
      </div>
    </SettingsCard>
  );
}

export function ToolingSection(props: { onNavigateSection?: (id: SectionId) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    activeWorkspaceId,
    repositoryPath,
    workspacePathById,
    claudeBinaryPath,
    codexBinaryPath,
    cursorBinaryPath,
    kiroBinaryPath,
    opencodeBinaryPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.repositoryPath,
          state.workspacePathById,
          state.settings.claudeBinaryPath,
          state.settings.codexBinaryPath,
          state.settings.cursorBinaryPath,
          state.settings.kiroBinaryPath,
          state.settings.opencodeBinaryPath,
        ] as const,
    ),
  );
  const accountOptions = useAccountRuntimeOptions();
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? null;
  const [viewState, setViewState] = useState<{
    status: "loading" | "ready" | "error";
    snapshot: ToolingStatusSnapshot | null;
    detail: string;
  }>({
    status: "loading",
    snapshot: null,
    detail: t("settingsProviders:toolingSection.detail.loading"),
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const readiness = useProviderReadinessStore((state) => state.providers);

  useEffect(() => {
    const getStatus = window.api?.tooling?.getStatus;
    if (!getStatus) {
      setViewState({
        status: "error",
        snapshot: null,
        detail: i18n.t("settingsProviders:toolingSection.detail.bridgeUnavailable"),
      });
      return;
    }

    let cancelled = false;
    setViewState((current) => ({
      ...current,
      status: "loading",
      detail: i18n.t("settingsProviders:toolingSection.detail.loading"),
    }));

    void (async () => {
      try {
        const snapshot = await getStatus({
          cwd: workspaceCwd ?? undefined,
          ...accountOptions,
          claudeBinaryPath: claudeBinaryPath || undefined,
          codexBinaryPath: codexBinaryPath || undefined,
          cursorBinaryPath: cursorBinaryPath || undefined,
          kiroBinaryPath: kiroBinaryPath || undefined,
          opencodeBinaryPath: opencodeBinaryPath || undefined,
        });
        if (cancelled) {
          return;
        }
        const runtimeOptions = { ...accountOptions, claudeBinaryPath, codexBinaryPath, cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath };
        for (const tool of snapshot.tools) publishProviderTooling(tool, runtimeOptions);
        void useAppStore.getState().refreshProviderAvailability();
        useAppStore.setState(providerToolingStatePatch(useAppStore.getState()));
        setViewState({
          status: "ready",
          snapshot,
          detail: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setViewState({
          status: "error",
          snapshot: null,
          detail:
            error instanceof Error
              ? error.message
              : i18n.t("settingsProviders:toolingSection.detail.loadFailed"),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    claudeBinaryPath,
    codexBinaryPath,
    cursorBinaryPath,
    kiroBinaryPath,
    opencodeBinaryPath,
    accountOptions,
    refreshNonce,
    workspaceCwd,
  ]);

  async function handleOpenTerminal() {
    const openInTerminal = window.api?.shell?.openInTerminal;
    if (!workspaceCwd || !openInTerminal) {
      toast.error(i18n.t("settingsProviders:toolingSection.toasts.terminalUnavailable.title"), {
        description: i18n.t("settingsProviders:toolingSection.toasts.terminalUnavailable.description"),
      });
      return;
    }

    const result = await openInTerminal({ path: workspaceCwd });
    if (!result.ok) {
      toast.error(i18n.t("settingsProviders:toolingSection.toasts.openTerminalFailed"), {
        description: result.stderr,
      });
      return;
    }
    toast.success(i18n.t("settingsProviders:toolingSection.toasts.openedInTerminal"));
  }

  async function handleCopyRepairCommand(command: string, label: string) {
    try {
      await copyTextToClipboard(command);
      toast.success(i18n.t("settingsProviders:settingsDialogToolingSection.commandCopied", { value1: label }), {
        description: command,
      });
    } catch (error) {
      toast.error(i18n.t("settingsProviders:toolingSection.toasts.copyCommandFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleCopyRepairAndOpenTerminal(
    command: string,
    label: string,
  ) {
    await handleCopyRepairCommand(command, label);
    await handleOpenTerminal();
  }

  const snapshot = viewState.snapshot;

  return (
    <>
      <SectionStack>
        <AccountsMovedNotice onNavigateSection={props.onNavigateSection} />
        <SettingsCard
          title={t("settingsProviders:toolingSection.card.title")}
          description={t("settingsProviders:toolingSection.card.description")}
          titleAccessory={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={viewState.status === "loading"}
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <RefreshCcw
                className={sx(
                  viewState.status === "loading"
                    ? toolingStyles.refreshIconSpinning
                    : toolingStyles.refreshIcon,
                )}
              />
              {t("common:actions.refresh")}</Button>
          }
        >
          {snapshot ? (
            <div className={sx(toolingStyles.toolsGrid)}>
              {snapshot.tools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={(tool.id === "cursor" || tool.id === "kiro" || tool.id === "opencode") && readiness[tool.id]?.configurationKey === providerConfigurationKey(tool.id, { cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath }) ? readiness[tool.id]!.tool : tool}
                  canOpenTerminal={Boolean(workspaceCwd)}
                  onOpenTerminal={handleOpenTerminal}
                  onCopyRepairCommand={handleCopyRepairCommand}
                  onCopyRepairAndOpenTerminal={handleCopyRepairAndOpenTerminal}
                />
              ))}
            </div>
          ) : (
            <div className={sx(toolingStyles.emptyState)}>
              {viewState.detail}
            </div>
          )}
        </SettingsCard>
      </SectionStack>
    </>
  );
}

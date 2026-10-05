import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  RefreshCcw,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { Badge, Button, Loader, toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  ToolingStatusSnapshot,
  WorkspaceSyncStatus,
} from "@/lib/tooling-status";
import { sx } from "@/components/ads/utils/stylex";
import { InfoRow, SettingsCard, StatusBadge } from "./settings-dialog.shared";
import { workspaceSyncStatusCardStyles as styles } from "./workspace-sync-status-card.styles";

function WorkspaceStateLabel(state: WorkspaceSyncStatus["state"]): string {
  useTranslation();
  switch (state) {
    case "synced":
      return i18n.t("shell:workspaceSyncStatusCard.synced");
    case "behind":
      return i18n.t("shell:workspaceSyncStatusCard.behind");
    case "ahead":
      return i18n.t("shell:workspaceSyncStatusCard.ahead");
    case "diverged":
      return i18n.t("shell:workspaceSyncStatusCard.diverged");
    case "dirty":
      return i18n.t("shell:workspaceSyncStatusCard.dirty");
    case "missing-origin":
      return i18n.t("shell:workspaceSyncStatusCard.noOrigin");
    case "missing-origin-main":
      return i18n.t("shell:workspaceSyncStatusCard.noDefaultBranch");
    case "not-git":
      return i18n.t("shell:workspaceSyncStatusCard.notGit");
    default:
      return i18n.t("shell:workspaceSyncStatusCard.unknown");
  }
}

export function WorkspaceSyncStatusCard(props: { cwd: string | null }) {
  useTranslation();
  const workspaceCwd = props.cwd;
  const [viewState, setViewState] = useState<{
    status: "loading" | "ready" | "error";
    snapshot: ToolingStatusSnapshot | null;
    detail: string;
  }>({
    status: "loading",
    snapshot: null,
    detail: i18n.t("shell:workspaceSyncStatusCard.refreshingWorkspaceSyncStatus"),
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [actionDetail, setActionDetail] = useState("");

  useEffect(() => {
    const getStatus = window.api?.tooling?.getStatus;
    if (!getStatus) {
      setViewState({
        status: "error",
        snapshot: null,
        detail: i18n.t("shell:workspaceSyncStatusCard.toolingDiagnosticsBridgeUnavailable"),
      });
      return;
    }

    let cancelled = false;
    setViewState((current) => ({
      ...current,
      status: "loading",
      detail: i18n.t("shell:workspaceSyncStatusCard.refreshingWorkspaceSyncStatus"),
    }));

    void (async () => {
      try {
        const snapshot = await getStatus({ cwd: workspaceCwd ?? undefined });
        if (cancelled) {
          return;
        }
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
              : i18n.t("shell:workspaceSyncStatusCard.failedToLoadWorkspaceSyncStatus"),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce, workspaceCwd]);

  async function handleOpenTerminal() {
    const openInTerminal = window.api?.shell?.openInTerminal;
    if (!workspaceCwd || !openInTerminal) {
      toast.error(i18n.t("shell:workspaceSyncStatusCard.terminalBridgeUnavailable"), {
        description: i18n.t("shell:workspaceSyncStatusCard.openAWorkspaceBeforeLaunchingAnExternal"),
      });
      return;
    }

    const result = await openInTerminal({ path: workspaceCwd });
    if (!result.ok) {
      toast.error(i18n.t("shell:workspaceSyncStatusCard.failedToOpenTerminal"), {
        description: result.stderr,
      });
      return;
    }
    toast.success(i18n.t("shell:workspaceSyncStatusCard.openedWorkspaceInTerminal"));
  }

  async function handleCopyWorkspaceCommand(command: string) {
    try {
      await copyTextToClipboard(command);
      toast.success(i18n.t("shell:workspaceSyncStatusCard.workspaceCommandCopied"), {
        description: command,
      });
    } catch (error) {
      toast.error(i18n.t("shell:workspaceSyncStatusCard.failedToCopyWorkspaceCommand"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleCopyRepairAndOpenTerminal(
    command: string,
    label: string,
  ) {
    try {
      await copyTextToClipboard(command);
      toast.success(i18n.t("shell:workspaceSyncStatusCard.commandCopied", { value1: label }), {
        description: command,
      });
    } catch (error) {
      toast.error(i18n.t("shell:workspaceSyncStatusCard.failedToCopyCommand"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
    await handleOpenTerminal();
  }

  async function handleSyncOriginMain() {
    const syncOriginMain = window.api?.tooling?.syncOriginMain;
    if (!workspaceCwd || !syncOriginMain) {
      toast.error(i18n.t("shell:workspaceSyncStatusCard.workspaceSyncUnavailable"));
      return;
    }

    setSyncBusy(true);
    try {
      const result = await syncOriginMain({ cwd: workspaceCwd });
      setActionDetail(result.detail);
      if (result.ok) {
        toast.success(result.summary);
      } else {
        toast.error(result.summary, {
          description: result.detail,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionDetail(message);
      toast.error(i18n.t("shell:workspaceSyncStatusCard.workspaceSyncFailed"), {
        description: message,
      });
    } finally {
      setSyncBusy(false);
      setRefreshNonce((value) => value + 1);
    }
  }

  const snapshot = viewState.snapshot;
  const workspace = snapshot?.workspace ?? null;
  const checkedAt = snapshot?.checkedAt
    ? formatDateTime(snapshot.checkedAt)
    : null;

  return (
    <SettingsCard
      title={i18n.t("shell:workspaceSyncStatusCard.workspaceSync")}
      description={i18n.t("shell:workspaceSyncStatusCard.trackHowThisWorkspaceRelatesToThe")}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerLead)}>
          <div className={sx(styles.badgeRow)}>
            <StatusBadge
              state={workspace?.state ?? "unknown"}
              label={WorkspaceStateLabel(workspace?.state ?? "unknown")}
            />
            {/* Uncommitted files are the normal working state of a
                workspace, not a fault, and the number is a tally rather than a
                severity — so it takes the neutral chip. The branch dropdown
                paints the identical fact `warning`; both are now neutral, and
                the status word beside them is the thing that carries tone. */}
            {workspace?.dirty ? (
              <Badge variant="secondary">{i18n.t("shell:workspaceSyncStatusCard.dirtyCount", { count: workspace.dirtyFileCount })}</Badge>
            ) : (
              <Badge variant="secondary">{i18n.t("shell:workspaceSyncStatusCard.clean")}</Badge>
            )}
          </div>
          <div className={sx(styles.summaryBlock)}>
            <p className={sx(styles.summary)}>
              {workspace?.summary ?? i18n.t("shell:workspaceSyncStatusCard.openAWorkspaceToInspectSyncStatus")}
            </p>
            <p className={sx(styles.path)}>
              {workspaceCwd ?? i18n.t("shell:workspaceSyncStatusCard.noWorkspacePathIsSelected")}
            </p>
          </div>
        </div>

        <div className={sx(styles.actionRow)}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={viewState.status === "loading"}
            onClick={() => setRefreshNonce((value) => value + 1)}
          >
            <RefreshCcw
              className={sx(
                styles.actionIcon,
                viewState.status === "loading" && styles.actionIconSpinning,
              )}
            />
            {i18n.t("shell:workspaceSyncStatusCard.refresh")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!workspaceCwd}
            onClick={() => void handleOpenTerminal()}
          >
            <TerminalSquare className={sx(styles.actionIcon)} />
            {i18n.t("shell:workspaceSyncStatusCard.openTerminal")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!workspace?.canFastForwardOriginMain || syncBusy}
            onClick={() => void handleSyncOriginMain()}
          >
            {syncBusy ? (
              <Loader aria-hidden size="xs" variant="sync" />
            ) : (
              <CheckCircle2 className={sx(styles.actionIcon)} />
            )}
            {i18n.t("shell:workspaceSyncStatusCard.syncBranch", { branch: workspace?.baseBranch ?? "origin/main" })}
          </Button>
        </div>
      </div>

      {workspace ? (
        <div className={sx(styles.detailGrid)}>
          <div className={sx(styles.detailPanel)}>
            <div className={sx(styles.infoRows)}>
              <InfoRow label={i18n.t("shell:workspaceSyncStatusCard.branch")} value={workspace.branch} />
              <InfoRow label={i18n.t("shell:workspaceSyncStatusCard.tracking")} value={workspace.trackingBranch} />
              <InfoRow label={i18n.t("shell:workspaceSyncStatusCard.remote")} value={workspace.originUrl} monospace />
              <InfoRow
                label={i18n.t("shell:workspaceSyncStatusCard.relation")}
                value={
                  workspace.ahead !== null && workspace.behind !== null
                    ? i18n.t("shell:workspaceSyncStatusCard.aheadBehind", { value1: workspace.ahead, value2: workspace.behind })
                    : workspace.summary
                }
              />
              <InfoRow label={i18n.t("shell:workspaceSyncStatusCard.lastChecked")} value={checkedAt} />
            </div>
          </div>

          <div className={sx(styles.detailPanel)}>
            <div className={sx(styles.nextStep)}>
              <p className={sx(styles.nextStepTitle)}>{i18n.t("shell:workspaceSyncStatusCard.nextStep")}</p>
              <p className={sx(styles.nextStepBody)}>
                {workspace.detail}
              </p>
              {workspace.recommendedCommand ? (
                <div className={sx(styles.commandBlock)}>
                  <p className={sx(styles.commandLabel)}>
                    {i18n.t("shell:workspaceSyncStatusCard.suggestedCommand")}
                  </p>
                  <p className={sx(styles.commandText)}>
                    {workspace.recommendedCommand}
                  </p>
                  <div className={sx(styles.actionRow)}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleCopyWorkspaceCommand(
                          workspace.recommendedCommand ?? "",
                        )
                      }
                    >
                      <Copy className={sx(styles.actionIcon)} />
                      {i18n.t("shell:workspaceSyncStatusCard.copyCommand")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!workspaceCwd}
                      onClick={() =>
                        void handleCopyRepairAndOpenTerminal(
                          workspace.recommendedCommand ?? "",
                          i18n.t("shell:workspaceSyncStatusCard.workspace"),
                        )
                      }
                    >
                      <TerminalSquare className={sx(styles.actionIcon)} />
                      {i18n.t("shell:workspaceSyncStatusCard.copyOpenTerminal")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {actionDetail ? (
        <div className={sx(styles.outputPanel)}>
          <p className={sx(styles.outputTitle)}>
            <ShieldAlert className={sx(styles.outputIcon)} />
            {i18n.t("shell:workspaceSyncStatusCard.lastActionOutput")}
          </p>
          <p className={sx(styles.outputBody)}>
            {actionDetail}
          </p>
        </div>
      ) : null}

      {viewState.status === "error" ? (
        <div className={sx(styles.errorPanel)}>
          {viewState.detail}
        </div>
      ) : null}
    </SettingsCard>
  );
}

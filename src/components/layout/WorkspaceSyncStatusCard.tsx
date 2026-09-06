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
  switch (state) {
    case "synced":
      return "Synced";
    case "behind":
      return "Behind";
    case "ahead":
      return "Ahead";
    case "diverged":
      return "Diverged";
    case "dirty":
      return "Dirty";
    case "missing-origin":
      return "No Origin";
    case "missing-origin-main":
      return "No default branch";
    case "not-git":
      return "Not Git";
    default:
      return "Unknown";
  }
}

export function WorkspaceSyncStatusCard(props: { cwd: string | null }) {
  const workspaceCwd = props.cwd;
  const [viewState, setViewState] = useState<{
    status: "loading" | "ready" | "error";
    snapshot: ToolingStatusSnapshot | null;
    detail: string;
  }>({
    status: "loading",
    snapshot: null,
    detail: "Refreshing workspace sync status...",
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
        detail: "Tooling diagnostics bridge unavailable.",
      });
      return;
    }

    let cancelled = false;
    setViewState((current) => ({
      ...current,
      status: "loading",
      detail: "Refreshing workspace sync status...",
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
              : "Failed to load workspace sync status.",
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
      toast.error("Terminal bridge unavailable", {
        description: "Open a workspace before launching an external terminal.",
      });
      return;
    }

    const result = await openInTerminal({ path: workspaceCwd });
    if (!result.ok) {
      toast.error("Failed to open terminal", {
        description: result.stderr,
      });
      return;
    }
    toast.success("Opened workspace in terminal");
  }

  async function handleCopyWorkspaceCommand(command: string) {
    try {
      await copyTextToClipboard(command);
      toast.success("Workspace command copied", {
        description: command,
      });
    } catch (error) {
      toast.error("Failed to copy workspace command", {
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
      toast.success(`${label} command copied`, {
        description: command,
      });
    } catch (error) {
      toast.error("Failed to copy command", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
    await handleOpenTerminal();
  }

  async function handleSyncOriginMain() {
    const syncOriginMain = window.api?.tooling?.syncOriginMain;
    if (!workspaceCwd || !syncOriginMain) {
      toast.error("Workspace sync unavailable");
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
      toast.error("Workspace sync failed", {
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
    ? new Date(snapshot.checkedAt).toLocaleString()
    : null;

  return (
    <SettingsCard
      title="Workspace Sync"
      description="Track how this workspace relates to the default remote branch (origin/main or origin/master), then fast-forward safely when no local commits or uncommitted edits block the update."
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerLead)}>
          <div className={sx(styles.badgeRow)}>
            <StatusBadge
              state={workspace?.state ?? "unknown"}
              label={WorkspaceStateLabel(workspace?.state ?? "unknown")}
            />
            {workspace?.dirty ? (
              <Badge variant="destructive">
                {workspace.dirtyFileCount} dirty
              </Badge>
            ) : (
              <Badge variant="secondary">clean</Badge>
            )}
          </div>
          <div className={sx(styles.summaryBlock)}>
            <p className={sx(styles.summary)}>
              {workspace?.summary ?? "Open a workspace to inspect sync status."}
            </p>
            <p className={sx(styles.path)}>
              {workspaceCwd ?? "No workspace path is selected."}
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
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!workspaceCwd}
            onClick={() => void handleOpenTerminal()}
          >
            <TerminalSquare className={sx(styles.actionIcon)} />
            Open Terminal
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
            Sync {workspace?.baseBranch ?? "origin/main"}
          </Button>
        </div>
      </div>

      {workspace ? (
        <div className={sx(styles.detailGrid)}>
          <div className={sx(styles.detailPanel)}>
            <div className={sx(styles.infoRows)}>
              <InfoRow label="Branch" value={workspace.branch} />
              <InfoRow label="Tracking" value={workspace.trackingBranch} />
              <InfoRow label="origin" value={workspace.originUrl} monospace />
              <InfoRow
                label="Relation"
                value={
                  workspace.ahead !== null && workspace.behind !== null
                    ? `${workspace.ahead} ahead / ${workspace.behind} behind`
                    : workspace.summary
                }
              />
              <InfoRow label="Last Checked" value={checkedAt} />
            </div>
          </div>

          <div className={sx(styles.detailPanel)}>
            <div className={sx(styles.nextStep)}>
              <p className={sx(styles.nextStepTitle)}>Next step</p>
              <p className={sx(styles.nextStepBody)}>
                {workspace.detail}
              </p>
              {workspace.recommendedCommand ? (
                <div className={sx(styles.commandBlock)}>
                  <p className={sx(styles.commandLabel)}>
                    Suggested Command
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
                      Copy Command
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!workspaceCwd}
                      onClick={() =>
                        void handleCopyRepairAndOpenTerminal(
                          workspace.recommendedCommand ?? "",
                          "Workspace",
                        )
                      }
                    >
                      <TerminalSquare className={sx(styles.actionIcon)} />
                      Copy + Open Terminal
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
            Last action output
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

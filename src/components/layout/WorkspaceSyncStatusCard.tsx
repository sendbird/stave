import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { Badge, Button, toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  ToolingStatusSnapshot,
  WorkspaceSyncStatus,
} from "@/lib/tooling-status";
import { cn } from "@/lib/utils";
import { InfoRow, SettingsCard, StatusBadge } from "./settings-dialog.shared";

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
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/80 bg-background/80 px-4 py-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {workspace?.summary ?? "Open a workspace to inspect sync status."}
            </p>
            <p className="break-all text-sm text-muted-foreground">
              {workspaceCwd ?? "No workspace path is selected."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={viewState.status === "loading"}
            onClick={() => setRefreshNonce((value) => value + 1)}
          >
            <RefreshCcw
              className={cn(
                "size-4",
                viewState.status === "loading" && "animate-spin",
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
            <TerminalSquare className="size-4" />
            Open Terminal
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!workspace?.canFastForwardOriginMain || syncBusy}
            onClick={() => void handleSyncOriginMain()}
          >
            {syncBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Sync {workspace?.baseBranch ?? "origin/main"}
          </Button>
        </div>
      </div>

      {workspace ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-background/80 p-4">
            <div className="space-y-2">
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

          <div className="rounded-xl border border-border/80 bg-background/80 p-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Next step</p>
              <p className="text-sm text-muted-foreground">{workspace.detail}</p>
              {workspace.recommendedCommand ? (
                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Suggested Command
                  </p>
                  <p className="font-mono text-xs leading-5 text-foreground break-all">
                    {workspace.recommendedCommand}
                  </p>
                  <div className="flex flex-wrap gap-2">
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
                      <Copy className="size-4" />
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
                      <TerminalSquare className="size-4" />
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
        <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldAlert className="size-4 text-muted-foreground" />
            Last action output
          </p>
          <p className="mt-2 font-mono text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
            {actionDetail}
          </p>
        </div>
      ) : null}

      {viewState.status === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {viewState.detail}
        </div>
      ) : null}
    </SettingsCard>
  );
}

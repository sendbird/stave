import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, toast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  ToolingStatusEntry,
  ToolingStatusId,
  ToolingStatusSnapshot,
  ToolingStatusState,
  WorkspaceSyncStatus,
} from "@/lib/tooling-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  SectionHeading,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

const TOOL_PURPOSE_BY_ID: Record<ToolingStatusId, string> = {
  shell: "Integrated terminal sessions and command execution surfaces.",
  git: "Workspace branch, diff, sync, and source-control actions.",
  gh: "Pull request creation, PR status refresh, merge, and branch update flows.",
  claude: "Claude Code turns, plugin refresh, and Claude-native diagnostics.",
  codex: "Codex turns, Stave Auto routing, and Codex-native execution flows.",
};

const AUTH_COMMAND_BY_ID: Partial<Record<ToolingStatusId, string>> = {
  gh: "gh auth login",
  claude: "claude auth login",
  codex: "codex login",
};

function StatusBadge(args: {
  state: ToolingStatusState | WorkspaceSyncStatus["state"];
  label: string;
}) {
  const className =
    args.state === "ready" || args.state === "synced"
      ? "border-success/30 bg-success/10 text-success dark:bg-success/15"
      : args.state === "warning"
        || args.state === "behind"
        || args.state === "ahead"
        || args.state === "dirty"
      ? "border-warning/40 bg-warning/10 text-warning dark:bg-warning/15"
      : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-6 border px-2.5 font-medium tracking-normal",
        className,
      )}
    >
      {args.label}
    </Badge>
  );
}

function AuthBadge(args: { tool: ToolingStatusEntry }) {
  const label =
    args.tool.authState === "authenticated"
      ? "Authenticated"
      : args.tool.authState === "unauthenticated"
        ? "Login Required"
        : args.tool.authState === "not-required"
          ? "No Auth"
          : "Unknown Auth";

  const className =
    args.tool.authState === "authenticated"
      ? "border-success/30 bg-success/10 text-success dark:bg-success/15"
      : args.tool.authState === "unauthenticated"
        ? "border-warning/40 bg-warning/10 text-warning dark:bg-warning/15"
        : "border-border/80 bg-muted/30 text-muted-foreground";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-6 border px-2.5 font-medium tracking-normal",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

function WorkspaceStateLabel(state: WorkspaceSyncStatus["state"]) {
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

function ToolStateLabel(state: ToolingStatusState) {
  switch (state) {
    case "ready":
      return "Ready";
    case "warning":
      return "Needs Attention";
    case "error":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

function ToolIcon(args: { id: ToolingStatusId }) {
  const Icon = args.id === "shell"
    ? TerminalSquare
    : args.id === "git"
      ? GitBranch
      : args.id === "gh"
        ? GitPullRequest
        : args.id === "claude"
          ? Bot
          : Code2;

  return <Icon className="size-4" />;
}

function InfoRow(args: {
  label: string;
  value: string | null;
  monospace?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{args.label}</span>
      <span
        className={cn(
          "max-w-[70%] text-right text-foreground break-all",
          args.monospace && "font-mono text-xs",
        )}
      >
        {args.value ?? "-"}
      </span>
    </div>
  );
}

function PathRow(args: { label: string; value: string | null }) {
  if (!args.value) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{args.label}</span>
        <span className="text-foreground">-</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{args.label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate font-mono text-xs text-foreground">
          {args.value}
        </span>
        <button
          type="button"
          className="shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          onClick={() => {
            void copyTextToClipboard(args.value!).then(() => {
              toast.success("Path copied");
            });
          }}
        >
          <Copy className="size-3" />
        </button>
      </div>
    </div>
  );
}

function ToolCard(args: {
  tool: ToolingStatusEntry;
  canOpenTerminal: boolean;
  onOpenTerminal: () => Promise<void>;
  onCopyRepairCommand: (command: string, label: string) => Promise<void>;
  onCopyRepairAndOpenTerminal: (command: string, label: string) => Promise<void>;
}) {
  const repairCommand = AUTH_COMMAND_BY_ID[args.tool.id] ?? null;

  return (
    <div className="rounded-xl border border-border/80 bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/30 text-muted-foreground">
              <ToolIcon id={args.tool.id} />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {args.tool.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {TOOL_PURPOSE_BY_ID[args.tool.id]}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            state={args.tool.state}
            label={ToolStateLabel(args.tool.state)}
          />
          <AuthBadge tool={args.tool} />
          {args.tool.version ? (
            <Badge
              variant="secondary"
              className="h-6 border border-border/60 bg-muted/40 px-2.5 font-mono text-xs font-normal tracking-normal text-muted-foreground"
            >
              {args.tool.version}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <InfoRow label="Summary" value={args.tool.summary} />
        <PathRow label="Executable" value={args.tool.executablePath} />
      </div>

      {args.tool.detail ? (
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <p className="font-mono text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
            {args.tool.detail}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
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
              <Copy className="size-4" />
              Copy Login Command
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!args.canOpenTerminal}
              onClick={() =>
                void args.onCopyRepairAndOpenTerminal(
                  repairCommand,
                  args.tool.label,
                )}
            >
              <TerminalSquare className="size-4" />
              Fix In Terminal
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!args.canOpenTerminal}
            onClick={() => void args.onOpenTerminal()}
          >
            <TerminalSquare className="size-4" />
            Open Terminal
          </Button>
        )}
      </div>
    </div>
  );
}

export function ToolingSection() {
  const [
    activeWorkspaceId,
    projectPath,
    workspacePathById,
    claudeBinaryPath,
    codexBinaryPath,
  ] = useAppStore(
    useShallow((state) => [
      state.activeWorkspaceId,
      state.projectPath,
      state.workspacePathById,
      state.settings.claudeBinaryPath,
      state.settings.codexBinaryPath,
    ] as const),
  );
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? null;
  const [viewState, setViewState] = useState<{
    status: "loading" | "ready" | "error";
    snapshot: ToolingStatusSnapshot | null;
    detail: string;
  }>({
    status: "loading",
    snapshot: null,
    detail: "Refreshing native tooling status...",
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
      detail: "Refreshing native tooling status...",
    }));

    void (async () => {
      try {
        const snapshot = await getStatus({
          cwd: workspaceCwd ?? undefined,
          claudeBinaryPath: claudeBinaryPath || undefined,
          codexBinaryPath: codexBinaryPath || undefined,
        });
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
          detail: error instanceof Error
            ? error.message
            : "Failed to load tooling diagnostics.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [claudeBinaryPath, codexBinaryPath, refreshNonce, workspaceCwd]);

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

  async function handleCopyRepairCommand(command: string, label: string) {
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
  }

  async function handleCopyRepairAndOpenTerminal(command: string, label: string) {
    await handleCopyRepairCommand(command, label);
    await handleOpenTerminal();
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
    <>
      <SectionHeading
        title="Tooling"
        description="Inspect the native shell and CLI integrations Stave depends on, then refresh or repair them without leaving Settings."
      />
      <SectionStack>
        <SettingsCard
          title="Current Workspace"
          description="Track how the active workspace relates to the default remote branch (origin/main or origin/master), then fast-forward safely when no local commits or uncommitted edits block the update."
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
                  <Badge variant="secondary">
                    clean
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {workspace?.summary
                    ?? "Open a workspace to inspect sync status."}
                </p>
                <p className="break-all text-sm text-muted-foreground">
                  {workspaceCwd ?? "No active workspace path is selected."}
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
                  <InfoRow
                    label="Tracking"
                    value={workspace.trackingBranch}
                  />
                  <InfoRow
                    label="origin"
                    value={workspace.originUrl}
                    monospace
                  />
                  <InfoRow
                    label="Relation"
                    value={
                      workspace.ahead !== null && workspace.behind !== null
                        ? `${workspace.ahead} ahead / ${workspace.behind} behind`
                        : workspace.summary
                    }
                  />
                  <InfoRow
                    label="Last Checked"
                    value={checkedAt}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-background/80 p-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Next step
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {workspace.detail}
                  </p>
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
                            )}
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
                            )}
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

        <SettingsCard
          title="Native Tooling Status"
          description="These checks mirror the native binaries and auth surfaces Stave uses for provider turns, PR actions, and terminal-backed workflows."
        >
          {snapshot ? (
            <div className="grid gap-3">
              {snapshot.tools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  canOpenTerminal={Boolean(workspaceCwd)}
                  onOpenTerminal={handleOpenTerminal}
                  onCopyRepairCommand={handleCopyRepairCommand}
                  onCopyRepairAndOpenTerminal={handleCopyRepairAndOpenTerminal}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {viewState.detail}
            </div>
          )}
        </SettingsCard>
      </SectionStack>
    </>
  );
}

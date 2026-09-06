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
import { sx } from "@/components/ads/utils/stylex";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  ToolingStatusEntry,
  ToolingStatusId,
  ToolingStatusSnapshot,
  ToolingStatusState,
} from "@/lib/tooling-status";
import { useAppStore } from "@/store/app.store";
import {
  InfoRow,
  SectionStack,
  SettingsCard,
  StatusBadge,
} from "./settings-dialog.shared";
import { toolingStyles } from "./settings-dialog-tooling-section.styles";

const TOOL_PURPOSE_BY_ID: Record<ToolingStatusId, string> = {
  shell: "Integrated terminal sessions and command execution surfaces.",
  git: "Workspace branch, diff, sync, and source-control actions.",
  gh: "Pull request creation, PR status refresh, merge, and branch update flows.",
  claude: "Claude Code turns, plugin refresh, and Claude-native diagnostics.",
  codex: "Codex turns and Codex-native execution flows.",
  cursor: "Cursor Agent turns over the Agent Client Protocol.",
  kiro: "Kiro turns over the Agent Client Protocol.",
};

const AUTH_COMMAND_BY_ID: Partial<Record<ToolingStatusId, string>> = {
  gh: "gh auth login",
  claude: "claude auth login",
  codex: "codex login",
  cursor: "agent login",
  kiro: "kiro-cli login",
};

function AuthBadge(args: { tool: ToolingStatusEntry }) {
  const label =
    args.tool.authState === "authenticated"
      ? "Authenticated"
      : args.tool.authState === "unauthenticated"
        ? "Login Required"
        : args.tool.authState === "not-required"
          ? "No Auth"
          : "Unknown Auth";

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
        <Button
          type="button"
          variant="quiet"
          iconOnly
          size="xs"
          aria-label={`Copy ${args.label}`}
          xstyle={toolingStyles.copyButton}
          onClick={() => {
            void copyTextToClipboard(args.value!).then(() => {
              toast.success("Path copied");
            });
          }}
        >
          <Copy className={sx(toolingStyles.copyIcon)} />
        </Button>
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
        <InfoRow label="Summary" value={args.tool.summary} />
        <PathRow label="Executable" value={args.tool.executablePath} />
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
                )
              }
            >
              <TerminalSquare className={sx(toolingStyles.actionIcon)} />
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
            <TerminalSquare className={sx(toolingStyles.actionIcon)} />
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
    cursorBinaryPath,
    kiroBinaryPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.projectPath,
          state.workspacePathById,
          state.settings.claudeBinaryPath,
          state.settings.codexBinaryPath,
          state.settings.cursorBinaryPath,
          state.settings.kiroBinaryPath,
        ] as const,
    ),
  );
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? null;
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
          cursorBinaryPath: cursorBinaryPath || undefined,
          kiroBinaryPath: kiroBinaryPath || undefined,
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
          detail:
            error instanceof Error
              ? error.message
              : "Failed to load tooling diagnostics.",
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
    refreshNonce,
    workspaceCwd,
  ]);

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
        <SettingsCard
          title="Native Tooling Status"
          description="These checks mirror the native binaries and auth surfaces Stave uses for provider turns, PR actions, and terminal-backed workflows."
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
              Refresh
            </Button>
          }
        >
          {snapshot ? (
            <div className={sx(toolingStyles.toolsGrid)}>
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
            <div className={sx(toolingStyles.emptyState)}>
              {viewState.detail}
            </div>
          )}
        </SettingsCard>
      </SectionStack>
    </>
  );
}

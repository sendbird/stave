import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  FolderTree,
  SquareTerminal,
  FolderOpen,
  ChevronDown,
  Copy,
  GitGraph,
  PanelLeft,
} from "lucide-react";
import { GhosttyIcon, VSCodeIcon } from "@/components/brand-icons";
import * as stylex from "@stylexjs/stylex";
import { useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  COMMIT_GRAPH_TITLE,
  OPEN_COMMIT_GRAPH_TITLE,
} from "@/lib/git-graph/presentation";
import { focusOrCreateGitGraphSurface } from "@/components/panes/pane-host-controller";
import { resolveOpenableGitGraphWorkspaceId } from "@/store/app-store-editor-actions";
import { useAppStore } from "@/store/app.store";
import { TopBarBranchDropdown } from "@/components/layout/TopBarBranchDropdown";
import { TopBarFileSearch } from "@/components/layout/TopBarFileSearch";
import { TopBarFleetAttention } from "@/components/layout/TopBarFleetAttention";
import { TopBarNotifications } from "@/components/layout/TopBarNotifications";
import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { TopBarRoutines } from "@/components/layout/TopBarRoutines";
import { TopBarTasks } from "@/components/layout/TopBarTasks";
import { TopBarStandaloneCli } from "@/components/layout/TopBarStandaloneCli";
import { TopBarUpdate } from "@/components/layout/TopBarUpdate";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import { formatWorkspacePathLabel } from "@/store/project.utils";
import { sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";
import { topBarStyles } from "./top-bar.styles";

const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";
const TOP_BAR_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const TOP_BAR_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function TopBar() {
  const [workspacePathMenuOpen, setWorkspacePathMenuOpen] = useState(false);
  const [
    activeWorkspaceId,
    workspaces,
    workspacePathById,
    projectPath,
    workspaceSidebarCollapsed,
    setLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaces,
          state.workspacePathById,
          state.projectPath,
          state.layout.workspaceSidebarCollapsed,
          state.setLayout,
        ] as const,
    ),
  );
  const hasProjectContext = Boolean(projectPath?.trim());
  const activeWorkspacePath = hasProjectContext
    ? (workspacePathById[activeWorkspaceId] ?? projectPath ?? "")
    : "";
  const workspacePathLabel = formatWorkspacePathLabel({
    workspacePath: activeWorkspacePath,
    projectPath,
  });
  const canOpenGitGraph = Boolean(
    resolveOpenableGitGraphWorkspaceId({
      activeWorkspaceId,
      projectPath,
      workspaces,
      workspacePathById,
    }),
  );

  return (
    <header
      data-testid="top-bar"
      className={sx(topBarStyles.header)}
      style={TOP_BAR_DRAG_STYLE}
    >
      <div className={sx(topBarStyles.lead)}>
        <TooltipProvider>
          {workspaceSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    xstyle={topBarStyles.sidebarToggle}
                    style={TOP_BAR_NO_DRAG_STYLE}
                    onClick={() =>
                      setLayout({
                        patch: { workspaceSidebarCollapsed: false },
                      })
                    }
                    aria-label="expand-project-list"
                  />
                }
              >
                <PanelLeft />
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand Project List</TooltipContent>
            </Tooltip>
          ) : null}
          {hasProjectContext && activeWorkspacePath ? (
            <div
              className={sx(topBarStyles.pathGroup)}
              style={TOP_BAR_NO_DRAG_STYLE}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className={sx(topBarStyles.pathChip)} />
                  }
                >
                  <FolderTree {...stylex.props(topBarStyles.pathIcon)} />
                  <span className={sx(topBarStyles.pathLabel)}>
                    {workspacePathLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {activeWorkspacePath}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu
                open={workspacePathMenuOpen}
                onOpenChange={setWorkspacePathMenuOpen}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span {...stylex.props(layoutShellStyles.inlineFlex)} />
                    }
                  >
                    <DropdownMenuTrigger
                      render={
                        <AdsButton
                          layout="host"
                          type="button"
                          xstyle={topBarStyles.pathMenuTrigger}
                          aria-label="open-workspace-path-actions"
                        />
                      }
                    >
                      <ChevronDown />
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open in…</TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                  align="start"
                  className={sx(topBarStyles.pathMenu)}
                >
                  <DropdownMenuItem
                    onSelect={() => {
                      setWorkspacePathMenuOpen(false);
                      void window.api?.shell?.showInFinder?.({
                        path: activeWorkspacePath,
                      });
                    }}
                  >
                    <FolderOpen {...stylex.props(layoutShellStyles.icon16)} />
                    Open in Finder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setWorkspacePathMenuOpen(false);
                      void window.api?.shell?.openInVSCode?.({
                        path: activeWorkspacePath,
                      });
                    }}
                  >
                    <VSCodeIcon {...stylex.props(layoutShellStyles.icon16)} />
                    Open in VS Code
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setWorkspacePathMenuOpen(false);
                      void window.api?.shell?.openInGhostty?.({
                        path: activeWorkspacePath,
                      });
                    }}
                  >
                    <GhosttyIcon {...stylex.props(layoutShellStyles.icon16)} />
                    Open in Ghostty
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setWorkspacePathMenuOpen(false);
                      void window.api?.shell?.openInTerminal?.({
                        path: activeWorkspacePath,
                      });
                    }}
                  >
                    <SquareTerminal {...stylex.props(layoutShellStyles.icon16)} />
                    Open in Terminal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setWorkspacePathMenuOpen(false);
                      void copyTextToClipboard(activeWorkspacePath).then(
                        () => toast.success("Workspace path copied"),
                        () => toast.error("Could not copy workspace path"),
                      );
                    }}
                  >
                    <Copy {...stylex.props(layoutShellStyles.icon16)} />
                    Copy workspace path
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {hasProjectContext ? (
            <TopBarBranchDropdown noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          ) : null}
          {hasProjectContext ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span {...stylex.props(layoutShellStyles.inlineFlex)} />
                }
              >
                <Button
                  variant="ghost"
                  size="sm"
                  xstyle={topBarStyles.gitGraphButton}
                  style={TOP_BAR_NO_DRAG_STYLE}
                  disabled={!canOpenGitGraph}
                  onClick={focusOrCreateGitGraphSurface}
                  aria-label={COMMIT_GRAPH_TITLE}
                >
                  <GitGraph />
                  <span>{COMMIT_GRAPH_TITLE}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canOpenGitGraph
                  ? OPEN_COMMIT_GRAPH_TITLE
                  : "Select an active workspace to open the commit graph"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {hasProjectContext ? (
            <TopBarOpenPR
              key={`${activeWorkspaceId}:${activeWorkspacePath}`}
              noDragStyle={TOP_BAR_NO_DRAG_STYLE}
            />
          ) : null}
        </TooltipProvider>
      </div>
      <div className={sx(topBarStyles.trail)}>
        <div className={sx(topBarStyles.searchSlot)}>
          {hasProjectContext ? (
            <TopBarFileSearch noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          ) : null}
        </div>

        {hasProjectContext ? (
          <TopBarFleetAttention noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        ) : null}
        <TopBarTasks noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        <TopBarRoutines noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        <TopBarStandaloneCli noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        {hasProjectContext ? (
          <TopBarNotifications noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        ) : null}
        <TopBarUpdate noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        {IS_MAC ? null : (
          <div
            className={sx(topBarStyles.windowControls)}
            style={TOP_BAR_NO_DRAG_STYLE}
          >
            <TopBarWindowControls noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          </div>
        )}
      </div>
    </header>
  );
}

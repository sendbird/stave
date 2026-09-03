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
      className="relative z-30 flex h-12 items-center justify-between gap-3 border-b border-border/70 bg-card px-3.5"
      style={TOP_BAR_DRAG_STYLE}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <TooltipProvider>
          {workspaceSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
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
                <PanelLeft className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand Project List</TooltipContent>
            </Tooltip>
          ) : null}
          {hasProjectContext && activeWorkspacePath ? (
            <div
              className="flex min-w-0 items-center"
              style={TOP_BAR_NO_DRAG_STYLE}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="inline-flex h-7 max-w-[220px] items-center gap-2 rounded-l-md border border-r-0 border-border/60 bg-background/60 px-2.5 text-xs text-muted-foreground" />
                  }
                >
                  <FolderTree className="size-3.5 shrink-0" />
                  <span className="truncate font-mono">
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
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-r-md border border-border/60 bg-background/60 p-0 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                          aria-label="open-workspace-path-actions"
                        />
                      }
                    >
                      <ChevronDown className="size-3.5" />
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open in…</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[184px]">
                  <DropdownMenuItem
                    onSelect={() => {
                      setWorkspacePathMenuOpen(false);
                      void window.api?.shell?.showInFinder?.({
                        path: activeWorkspacePath,
                      });
                    }}
                  >
                    <FolderOpen className="size-4" />
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
                    <VSCodeIcon className="size-4" />
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
                    <GhosttyIcon className="size-4" />
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
                    <SquareTerminal className="size-4" />
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
                    <Copy className="size-4" />
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
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 text-xs font-normal text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  style={TOP_BAR_NO_DRAG_STYLE}
                  disabled={!canOpenGitGraph}
                  onClick={focusOrCreateGitGraphSurface}
                  aria-label={COMMIT_GRAPH_TITLE}
                >
                  <GitGraph className="size-3.5 shrink-0" />
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
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="hidden min-w-0 flex-1 justify-end lg:flex [&>div]:min-w-0 [&>div]:w-full [&>div]:max-w-[380px]">
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
            className="flex shrink-0 items-center gap-1.5"
            style={TOP_BAR_NO_DRAG_STYLE}
          >
            <TopBarWindowControls noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          </div>
        )}
      </div>
    </header>
  );
}

import {
  FolderTree,
  SquareTerminal,
  FolderOpen,
  ChevronDown,
  PanelLeft,
} from "lucide-react";
import { GhosttyIcon, VSCodeIcon } from "@/components/brand-icons";
import { useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { TopBarBranchDropdown } from "@/components/layout/TopBarBranchDropdown";
import { TopBarFileSearch } from "@/components/layout/TopBarFileSearch";
import { TopBarNotifications } from "@/components/layout/TopBarNotifications";
import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { TopBarUpdate } from "@/components/layout/TopBarUpdate";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import {
  getRepoMapContextCache,
  setRepoMapContextCache,
} from "@/lib/fs/repo-map-context-cache";
import { formatRepoMapForContext } from "@/lib/fs/repo-map.types";
import { formatWorkspacePathLabel } from "@/store/project.utils";

const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";
const TOP_BAR_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const TOP_BAR_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function TopBar() {
  const [workspacePathMenuOpen, setWorkspacePathMenuOpen] = useState(false);
  const [
    activeWorkspaceId,
    workspacePathById,
    projectPath,
    workspaceSidebarCollapsed,
    setLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
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

  // Pre-warm the module-level repo-map context cache so the first AI turn in
  // this workspace can synchronously read it (a plain Map.get — no IPC).
  useEffect(() => {
    if (!hasProjectContext || !activeWorkspacePath) {
      return;
    }
    // Skip if already cached — avoids a redundant IPC round-trip.
    if (getRepoMapContextCache(activeWorkspacePath)) {
      return;
    }
    const getRepoMap = window.api?.fs?.getRepoMap;
    if (!getRepoMap) {
      return;
    }
    void getRepoMap({ rootPath: activeWorkspacePath })
      .then((result) => {
        if (result.ok && result.repoMap) {
          const snap = result.repoMap;
          setRepoMapContextCache(activeWorkspacePath, {
            text: formatRepoMapForContext(snap),
            snapshotUpdatedAt: snap.updatedAt,
            fileCount: snap.fileCount,
            codeFileCount: snap.codeFileCount,
            hotspotCount: snap.hotspots.length,
            entrypointCount: snap.entrypoints.length,
            docCount: snap.docs.length,
          });
        }
      })
      .catch(() => {
        // Pre-warming failure is non-fatal; the first turn simply won't have
        // the repo-map injected. Subsequent workspace switches will retry.
      });
  }, [activeWorkspacePath, hasProjectContext]);

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
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                  style={TOP_BAR_NO_DRAG_STYLE}
                  onClick={() =>
                    setLayout({
                      patch: { workspaceSidebarCollapsed: false },
                    })
                  }
                  aria-label="expand-project-list"
                >
                  <PanelLeft className="size-4" />
                </Button>
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
                <TooltipTrigger asChild>
                  <div className="inline-flex max-w-[220px] items-center gap-2 rounded-l-md border border-r-0 border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                    <FolderTree className="size-3.5 shrink-0" />
                    <span className="truncate font-mono">
                      {workspacePathLabel}
                    </span>
                  </div>
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
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-center rounded-r-md border border-border/60 bg-background/60 px-1 py-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                          aria-label="open-workspace-path-actions"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open in…</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[160px]">
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {hasProjectContext ? (
            <TopBarBranchDropdown noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
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
        <div className="hidden min-w-0 flex-1 justify-end lg:flex">
          {hasProjectContext ? (
            <TopBarFileSearch noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          ) : null}
        </div>

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

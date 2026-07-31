import { GitGraph, Globe, TerminalSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  focusOrCreateGitGraphSurface,
  focusOrCreateLensSurface,
  paneHost,
} from "@/components/panes/pane-host-controller";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import {
  RIGHT_RAIL_PANEL_ICONS,
  RIGHT_RAIL_PANEL_IDS,
  RIGHT_RAIL_PANEL_TITLES,
  type RightRailPanelId,
} from "@/lib/right-rail-panels";
import { cn } from "@/lib/utils";
import { gitGraphTabId } from "@/store/app-store-editor-actions";
import { useAppStore } from "@/store/app.store";

const RAIL_BUTTON_CLASS =
  "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10";
const RAIL_BUTTON_INACTIVE_CLASS =
  "hover:border-border/80 hover:bg-secondary/70";
const RAIL_ICON_CLASS = "size-3.5 lg:size-4";

export function RightRail() {
  const [
    hasProject,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    activeSurfaceKind,
    setLayout,
    activeEditorTabId,
    activeWorkspaceId,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          Boolean(state.projectPath),
          state.layout.sidebarOverlayVisible,
          state.layout.sidebarOverlayTab,
          state.activeSurface.kind,
          state.setLayout,
          state.activeEditorTabId,
          state.activeWorkspaceId,
        ] as const,
    ),
  );
  const hasLensApi = typeof window !== "undefined" && Boolean(window.api?.lens);

  function openLensSurface() {
    focusOrCreateLensSurface();
  }

  function toggleSidebarTab(tab: RightRailPanelId) {
    if (sidebarOverlayVisible && sidebarOverlayTab === tab) {
      setLayout({ patch: { sidebarOverlayVisible: false } });
      return;
    }
    setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: tab,
      },
    });
  }

  const lensActive = activeSurfaceKind === "lens";
  const terminalActive = activeSurfaceKind === "terminal";
  const gitGraphActive =
    activeSurfaceKind === "editor" &&
    activeEditorTabId === gitGraphTabId(activeWorkspaceId);
  return (
    <aside
      data-testid="workspace-bar"
      className="stave-workspace-rail flex h-full w-12 shrink-0 flex-col items-center py-2 lg:w-14 lg:py-3"
    >
      <TooltipProvider>
        <div className="flex w-full flex-col items-center gap-2">
          {RIGHT_RAIL_PANEL_IDS.map((panelId) => {
            const Icon = RIGHT_RAIL_PANEL_ICONS[panelId];
            const isActive =
              sidebarOverlayVisible && sidebarOverlayTab === panelId;

            return (
              <Tooltip key={panelId}>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Button
                    size="sm"
                    variant={isActive ? "default" : "ghost"}
                    disabled={!hasProject}
                    className={cn(
                      RAIL_BUTTON_CLASS,
                      !isActive && RAIL_BUTTON_INACTIVE_CLASS,
                    )}
                    onClick={() => toggleSidebarTab(panelId)}
                    aria-label={RIGHT_RAIL_PANEL_TITLES[panelId]}
                  >
                    <Icon className={RAIL_ICON_CLASS} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {RIGHT_RAIL_PANEL_TITLES[panelId]}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                size="sm"
                variant={gitGraphActive ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  RAIL_BUTTON_CLASS,
                  !gitGraphActive && RAIL_BUTTON_INACTIVE_CLASS,
                )}
                onClick={() => focusOrCreateGitGraphSurface()}
                aria-label="Git Graph"
              >
                <GitGraph className={RAIL_ICON_CLASS} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Git Graph</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                size="sm"
                variant={lensActive ? "default" : "ghost"}
                disabled={!hasProject || !hasLensApi}
                className={cn(
                  RAIL_BUTTON_CLASS,
                  !lensActive && RAIL_BUTTON_INACTIVE_CLASS,
                )}
                onClick={openLensSurface}
                aria-label="Lens"
              >
                <Globe className={RAIL_ICON_CLASS} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {hasLensApi ? "Lens" : "Lens is available in the desktop app"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant={terminalActive ? "default" : "ghost"}
                  disabled={!hasProject}
                  className={cn(
                    RAIL_BUTTON_CLASS,
                    !terminalActive && RAIL_BUTTON_INACTIVE_CLASS,
                  )}
                  onClick={() => paneHost.toggleTerminalGroup()}
                  aria-label="Terminal"
                />
              }
            >
              <TerminalSquare className={RAIL_ICON_CLASS} />
            </TooltipTrigger>
            <TooltipContent side="left">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}

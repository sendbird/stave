import { FileCode2, Globe, TerminalSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  focusOrCreateLensSurface,
  paneHost,
} from "@/components/panes/pane-host-controller";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { RIGHT_RAIL_PANEL_ICONS, RIGHT_RAIL_PANEL_IDS, RIGHT_RAIL_PANEL_TITLES, type RightRailPanelId } from "@/lib/right-rail-panels";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

const RAIL_BUTTON_CLASS = "h-9 w-9 rounded-md border border-transparent p-0 lg:h-10 lg:w-10";
const RAIL_BUTTON_INACTIVE_CLASS = "hover:border-border/80 hover:bg-secondary/70";
const RAIL_ICON_CLASS = "size-3.5 lg:size-4";

export function RightRail() {
  const [
    hasProject,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    activeSurfaceKind,
    activeEditorTabId,
    firstEditorTabId,
    setLayout,
  ] = useAppStore(useShallow((state) => [
    Boolean(state.projectPath),
    state.layout.sidebarOverlayVisible,
    state.layout.sidebarOverlayTab,
    state.activeSurface.kind,
    state.activeEditorTabId,
    state.editorTabs[0]?.id ?? null,
    state.setLayout,
  ] as const));
  const hasLensApi =
    typeof window !== "undefined" && Boolean(window.api?.lens);

  function focusEditorSurface() {
    const editorTabId = activeEditorTabId ?? firstEditorTabId;
    if (editorTabId) {
      paneHost.focusSurface({ kind: "editor", editorTabId });
    }
  }

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

  const editorTabId = activeEditorTabId ?? firstEditorTabId;
  const editorActive = activeSurfaceKind === "editor";
  const lensActive = activeSurfaceKind === "lens";
  const terminalActive = activeSurfaceKind === "terminal";
  return (
    <aside
      data-testid="workspace-bar"
      className="flex h-full w-12 shrink-0 flex-col items-center border-l border-border/70 bg-card/70 py-2 lg:w-14 lg:py-3"
    >
      <TooltipProvider>
        <div className="flex w-full flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  variant={editorActive ? "default" : "ghost"}
                  disabled={!hasProject || !editorTabId}
                  className={cn(
                    RAIL_BUTTON_CLASS,
                    !editorActive && RAIL_BUTTON_INACTIVE_CLASS,
                  )}
                  onClick={focusEditorSurface}
                  aria-label="Editor"
                >
                  <FileCode2 className={RAIL_ICON_CLASS} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              {editorTabId ? "Editor" : "Editor (no open files)"}
            </TooltipContent>
          </Tooltip>
          {RIGHT_RAIL_PANEL_IDS.map((panelId) => {
            const Icon = RIGHT_RAIL_PANEL_ICONS[panelId];
            const isActive = sidebarOverlayVisible && sidebarOverlayTab === panelId;

            return (
              <Tooltip key={panelId}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
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
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {RIGHT_RAIL_PANEL_TITLES[panelId]}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
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
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              {hasLensApi ? "Lens" : "Lens is available in the desktop app"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
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
              >
                <TerminalSquare className={RAIL_ICON_CLASS} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}

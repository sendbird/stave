import { Globe, TerminalSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
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
import { useRunningWorkspaceProcessCount } from "@/lib/workspace-scripts";
import { workspaceToolsRunningLabel } from "@/lib/workspace-tools-presentation";
import { cx, sx } from "@/components/ads/utils/stylex";
import { rightRailStyles } from "@/components/layout/right-rail.styles";
import { useAppStore } from "@/store/app.store";

function RightRailWorkspaceToolsButton(props: {
  disabled: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const [workspaceId, projectPath, workspacePath, workspaceName, branch] =
    useAppStore(
      useShallow((state) => {
        const workspaceId = state.activeWorkspaceId;
        const workspacePath =
          state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
        const branch = state.workspaceBranchById[workspaceId] ?? "";
        const workspaceName =
          (state.workspaces.find((workspace) => workspace.id === workspaceId)
            ?.name ??
            branch) ||
          "workspace";
        return [
          workspaceId,
          state.projectPath,
          workspacePath,
          workspaceName,
          branch || workspaceName,
        ] as const;
      }),
    );
  const runningCount = useRunningWorkspaceProcessCount(
    workspaceId && projectPath && workspacePath
      ? {
          workspaceId,
          projectPath,
          workspacePath,
          workspaceName,
          branch,
        }
      : null,
  );
  const Icon = RIGHT_RAIL_PANEL_ICONS.scripts;
  const label = workspaceToolsRunningLabel(runningCount);

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={sx(rightRailStyles.triggerHost)} />}>
        <Button
          size="sm"
          variant={props.isActive ? "default" : "ghost"}
          disabled={props.disabled}
          xstyle={[
            rightRailStyles.railButton,
            rightRailStyles.railButtonRelative,
            !props.isActive && rightRailStyles.railButtonInactive,
          ]}
          onClick={props.onClick}
          aria-label={label}
        >
          <Icon className={sx(rightRailStyles.railIcon)} />
          {runningCount > 0 ? (
            <span
              data-testid="workspace-tools-running-count"
              className={sx(rightRailStyles.runningBadge)}
            >
              {runningCount}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function RightRail() {
  const [
    hasProject,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    activeSurfaceKind,
    setLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          Boolean(state.projectPath),
          state.layout.sidebarOverlayVisible,
          state.layout.sidebarOverlayTab,
          state.activeSurface.kind,
          state.setLayout,
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
  return (
    <aside
      data-testid="workspace-bar"
      className={cx("stave-workspace-rail", sx(rightRailStyles.rail))}
    >
      <TooltipProvider>
        <div className={sx(rightRailStyles.stack)}>
          {RIGHT_RAIL_PANEL_IDS.map((panelId) => {
            const isActive =
              sidebarOverlayVisible && sidebarOverlayTab === panelId;

            if (panelId === "scripts") {
              return (
                <RightRailWorkspaceToolsButton
                  key={panelId}
                  disabled={!hasProject}
                  isActive={isActive}
                  onClick={() => toggleSidebarTab(panelId)}
                />
              );
            }

            const Icon = RIGHT_RAIL_PANEL_ICONS[panelId];
            return (
              <Tooltip key={panelId}>
                <TooltipTrigger render={<span className={sx(rightRailStyles.triggerHost)} />}>
                  <Button
                    size="sm"
                    variant={isActive ? "default" : "ghost"}
                    disabled={!hasProject}
                    xstyle={[
                      rightRailStyles.railButton,
                      !isActive && rightRailStyles.railButtonInactive,
                    ]}
                    onClick={() => toggleSidebarTab(panelId)}
                    aria-label={RIGHT_RAIL_PANEL_TITLES[panelId]}
                  >
                    <Icon className={sx(rightRailStyles.railIcon)} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {RIGHT_RAIL_PANEL_TITLES[panelId]}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger render={<span className={sx(rightRailStyles.triggerHost)} />}>
              <Button
                size="sm"
                variant={lensActive ? "default" : "ghost"}
                disabled={!hasProject || !hasLensApi}
                xstyle={[
                  rightRailStyles.railButton,
                  !lensActive && rightRailStyles.railButtonInactive,
                ]}
                onClick={openLensSurface}
                aria-label="Lens"
              >
                <Globe className={sx(rightRailStyles.railIcon)} />
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
                  xstyle={[
                    rightRailStyles.railButton,
                    !terminalActive && rightRailStyles.railButtonInactive,
                  ]}
                  onClick={() => paneHost.toggleTerminalGroup()}
                  aria-label="Terminal"
                />
              }
            >
              <TerminalSquare className={sx(rightRailStyles.railIcon)} />
            </TooltipTrigger>
            <TooltipContent side="left">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}

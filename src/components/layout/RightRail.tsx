import { i18n, useTranslation } from "@/i18n";
import { Globe, TerminalSquare, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  focusOrCreateLensSurface,
  paneHost,
} from "@/components/panes/pane-host-controller";
import {
  Toolbar,
  ToolbarButtonGroup,
} from "@/components/ads/components/Toolbar";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { ToolbarButton } from "@/components/ads/headless/toolbar";
import { Button } from "@/components/ui";
import {
  RIGHT_RAIL_PANEL_ICONS,
  RIGHT_RAIL_PANEL_IDS,
  RIGHT_RAIL_PANEL_TITLES,
  type RightRailPanelId,
} from "@/lib/right-rail-panels";
import type { KeybindingId } from "@/lib/keybindings/keybinding-registry";
import { useRunningWorkspaceProcessCount } from "@/lib/workspace-scripts";
import { workspaceToolsRunningLabel } from "@/lib/workspace-tools-presentation";
import { cx, sx } from "@/components/ads/utils/stylex";
import { rightRailStyles } from "@/components/layout/right-rail.styles";
import { CountBadge } from "@/components/system/CountBadge";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { useAppStore } from "@/store/app.store";

/** The `Cmd/Ctrl+K` shortcut each rail panel answers to, where one exists. */
const RIGHT_RAIL_PANEL_SHORTCUTS: Partial<Record<RightRailPanelId, KeybindingId>> = {
  explorer: "view.show-explorer",
  changes: "view.toggle-changes-panel",
  information: "view.show-information",
  scripts: "view.show-scripts",
};

/**
 * One rail toggle: a roving item of the rail's toolbar that keeps the rail's
 * own pressed look (the filled `default` button) instead of the toolbar's.
 * Disabled toggles stay reachable by arrow keys, as toolbar items do, and
 * explain themselves in the tooltip.
 */
function RailToggle(props: {
  label: string;
  /** Tooltip text when it differs from the button's name. */
  hint?: string;
  shortcut: KeybindingId | null;
  icon: LucideIcon;
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  indicator?: ReactNode;
}) {
  const shortcut = useShortcutHint(props.shortcut);
  const Icon = props.icon;
  return (
    <Tooltip
      content={props.hint ?? props.label}
      shortcut={props.disabled ? undefined : shortcut}
      side="left"
    >
      <ToolbarButton
        disabled={props.disabled}
        render={
          <Button
            size="sm"
            variant={props.pressed ? "default" : "ghost"}
            focusableWhenDisabled
            xstyle={[
              rightRailStyles.railButton,
              props.indicator !== undefined &&
                rightRailStyles.railButtonRelative,
              !props.pressed && rightRailStyles.railButtonInactive,
            ]}
            onClick={props.onClick}
            aria-label={props.label}
            aria-pressed={props.pressed}
            indicator={props.indicator}
          />
        }
      >
        <Icon className={sx(rightRailStyles.railIcon)} />
      </ToolbarButton>
    </Tooltip>
  );
}

function RightRailWorkspaceToolsButton(props: {
  disabled: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  useTranslation();
  const [workspaceId, repositoryPath, workspacePath, workspaceName, branch] =
    useAppStore(
      useShallow((state) => {
        const workspaceId = state.activeWorkspaceId;
        const workspacePath =
          state.workspacePathById[workspaceId] ?? state.repositoryPath ?? "";
        const branch = state.workspaceBranchById[workspaceId] ?? "";
        const workspaceName =
          (state.workspaces.find((workspace) => workspace.id === workspaceId)
            ?.name ??
            branch) ||
          "workspace";
        return [
          workspaceId,
          state.repositoryPath,
          workspacePath,
          workspaceName,
          branch || workspaceName,
        ] as const;
      }),
    );
  const runningCount = useRunningWorkspaceProcessCount(
    workspaceId && repositoryPath && workspacePath
      ? {
          workspaceId,
          repositoryPath,
          workspacePath,
          workspaceName,
          branch,
        }
      : null,
  );

  return (
    <RailToggle
      label={workspaceToolsRunningLabel(runningCount)}
      shortcut={RIGHT_RAIL_PANEL_SHORTCUTS.scripts ?? null}
      icon={RIGHT_RAIL_PANEL_ICONS.scripts}
      pressed={props.isActive}
      disabled={props.disabled}
      onClick={props.onClick}
      /*
       * `CountBadge` through ADS `Button indicator`, not a positioned
       * child. This rail was the fifth hand-written copy of the same accent
       * pill — the one `CountBadge` was created to delete — and the copy
       * had dropped the knockout ring, so it merged into the glyph it
       * overlapped. `indicator` also owns the corner, the overhang and
       * lifting the button's own overflow clamp, which is why the
       * hand-placed version had two flat sides.
       */
      indicator={
        runningCount > 0 ? (
          <span data-testid="workspace-tools-running-count">
            <CountBadge count={runningCount} />
          </span>
        ) : null
      }
    />
  );
}

/**
 * The workspace rail: one toolbar, so it is a single Tab stop and the arrow
 * keys move between its toggles. The panel toggles form one group and the
 * Lens and Terminal surfaces another.
 */
export function RightRail() {
  useTranslation();
  const [
    hasRepository,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    activeSurfaceKind,
    setLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          Boolean(state.repositoryPath),
          state.layout.sidebarOverlayVisible,
          state.layout.sidebarOverlayTab,
          state.activeSurface.kind,
          state.setLayout,
        ] as const,
    ),
  );
  const hasLensApi = typeof window !== "undefined" && Boolean(window.api?.lens);

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
      aria-label={i18n.t("shell:rightRail.workspacePanels")}
      className={cx("stave-workspace-rail", sx(rightRailStyles.rail))}
    >
      <Toolbar
        orientation="vertical"
        aria-label={i18n.t("shell:rightRail.workspacePanels")}
        xstyle={rightRailStyles.toolbar}
      >
        <ToolbarButtonGroup
          orientation="vertical"
          xstyle={rightRailStyles.toolbarGroup}
        >
          {RIGHT_RAIL_PANEL_IDS.map((panelId) => {
            const isActive =
              sidebarOverlayVisible && sidebarOverlayTab === panelId;

            if (panelId === "scripts") {
              return (
                <RightRailWorkspaceToolsButton
                  key={panelId}
                  disabled={!hasRepository}
                  isActive={isActive}
                  onClick={() => toggleSidebarTab(panelId)}
                />
              );
            }

            return (
              <RailToggle
                key={panelId}
                label={RIGHT_RAIL_PANEL_TITLES[panelId]}
                shortcut={RIGHT_RAIL_PANEL_SHORTCUTS[panelId] ?? null}
                icon={RIGHT_RAIL_PANEL_ICONS[panelId]}
                pressed={isActive}
                disabled={!hasRepository}
                onClick={() => toggleSidebarTab(panelId)}
              />
            );
          })}
        </ToolbarButtonGroup>
        <ToolbarButtonGroup
          orientation="vertical"
          xstyle={rightRailStyles.toolbarGroup}
        >
          <RailToggle
            label="Lens"
            hint={
              hasLensApi
                ? undefined
                : i18n.t("shell:rightRail.lensIsAvailableInTheDesktopApp")
            }
            shortcut="view.show-lens"
            icon={Globe}
            pressed={lensActive}
            disabled={!hasRepository || !hasLensApi}
            onClick={focusOrCreateLensSurface}
          />
          <RailToggle
            label={i18n.t("shell:rightRail.terminal")}
            shortcut="view.toggle-terminal"
            icon={TerminalSquare}
            pressed={terminalActive}
            disabled={!hasRepository}
            onClick={() => paneHost.toggleTerminalGroup()}
          />
        </ToolbarButtonGroup>
      </Toolbar>
    </aside>
  );
}

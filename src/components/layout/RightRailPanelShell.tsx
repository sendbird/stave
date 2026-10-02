import type { ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { panelBarStyles } from "@/components/layout/panel-bar.constants";
import { rightRailPanelShellStyles } from "@/components/layout/right-rail-panel-shell.styles";
import { RIGHT_RAIL_PANEL_ICONS, RIGHT_RAIL_PANEL_TITLES, type RightRailPanelId } from "@/lib/right-rail-panels";

/**
 * The one 46px bar on top of a right-rail panel. Every panel uses it, so a
 * panel that needs controls in its chrome (the Task panel's tabs) puts them
 * here instead of stacking a second bar under the title.
 */
export function RightRailPanelHeader(props: { children: ReactNode; actions?: ReactNode }) {
  return (
    <header className={sx(rightRailPanelShellStyles.header, panelBarStyles.bar)}>
      {props.children}
      {props.actions ? (
        <div className={sx(rightRailPanelShellStyles.actions)}>{props.actions}</div>
      ) : null}
    </header>
  );
}

/** The panel's icon and name, as the bar's heading. */
export function RightRailPanelTitle(props: { panelId: RightRailPanelId; title?: string }) {
  const Icon = RIGHT_RAIL_PANEL_ICONS[props.panelId];
  return (
    <h2 className={sx(panelBarStyles.headerTitle)}>
      <Icon className={sx(panelBarStyles.headerIcon)} />
      <span>{props.title ?? RIGHT_RAIL_PANEL_TITLES[props.panelId]}</span>
    </h2>
  );
}

export function RightRailPanelShell(props: {
  panelId: RightRailPanelId;
  title?: string;
  actions?: ReactNode;
  /**
   * The panel renders its own `RightRailPanelHeader` (the Task panel puts
   * its tabs in the bar), so the shell draws only the body.
   */
  ownHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={sx(rightRailPanelShellStyles.root)}>
      {props.ownHeader ? null : (
        <RightRailPanelHeader actions={props.actions}>
          <RightRailPanelTitle panelId={props.panelId} title={props.title} />
        </RightRailPanelHeader>
      )}
      <div className={sx(rightRailPanelShellStyles.body)}>
        {props.children}
      </div>
    </div>
  );
}

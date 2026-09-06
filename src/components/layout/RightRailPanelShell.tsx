import type { ReactNode } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { panelBarStyles } from "@/components/layout/panel-bar.constants";
import { rightRailPanelShellStyles } from "@/components/layout/right-rail-panel-shell.styles";
import { RIGHT_RAIL_PANEL_ICONS, RIGHT_RAIL_PANEL_TITLES, type RightRailPanelId } from "@/lib/right-rail-panels";

export function RightRailPanelShell(props: {
  panelId: RightRailPanelId;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const Icon = RIGHT_RAIL_PANEL_ICONS[props.panelId];

  return (
    <div className={sx(rightRailPanelShellStyles.root)}>
      <header className={sx(rightRailPanelShellStyles.header, panelBarStyles.bar)}>
        <h2 className={sx(panelBarStyles.headerTitle)}>
          <Icon className={sx(panelBarStyles.headerIcon)} />
          <span>{props.title ?? RIGHT_RAIL_PANEL_TITLES[props.panelId]}</span>
        </h2>
        {props.actions ? (
          <div className={sx(rightRailPanelShellStyles.actions)}>
            {props.actions}
          </div>
        ) : null}
      </header>
      <div className={sx(rightRailPanelShellStyles.body)}>
        {props.children}
      </div>
    </div>
  );
}

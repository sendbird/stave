import type { DockviewApi, IDockviewPanel } from "dockview-react";

/**
 * Creates an adjacent pane without collapsing the source group.
 *
 * Dockview removes an empty group when its last panel is moved out. For a
 * single-panel group, the newly-created empty group is therefore the split
 * destination itself; the next surface opened by the user is placed there.
 */
export function splitPanelInDirection(
  api: DockviewApi,
  panel: IDockviewPanel,
  direction: "right" | "below",
) {
  const group = api.addGroup({ referencePanel: panel, direction });
  if (panel.group.panels.length > 1) {
    panel.api.moveTo({ group });
  }
  return group;
}

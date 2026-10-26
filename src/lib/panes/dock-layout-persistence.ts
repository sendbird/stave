import type { PaneDockLayout } from "./types";

/**
 * The pane arrangement as it is saved, without momentary view state.
 *
 * A maximized group (Lens full view) is a way of looking at one pane, not part
 * of the arrangement. Saving it would bring a restart or a workspace switch
 * back with every other pane hidden, and whether it survived would depend on
 * whether restore happened to add a panel first, which leaves maximize.
 */
export function toPersistedDockLayout(layout: PaneDockLayout): PaneDockLayout {
  if (!("maximizedNode" in layout)) {
    return layout;
  }
  const persisted = { ...layout };
  delete persisted.maximizedNode;
  return persisted;
}

import { parsePanePanelId } from "@/lib/panes/types";

/**
 * Panel to treat as active when the store's active surface has no panel (e.g.
 * legacy state restored without that tab, or a tab dropped during reconcile).
 * Keeps whatever Dockview already activated, otherwise prefers a non-terminal
 * panel (terminals are keep-alive only), otherwise the first panel. Returns
 * null for an empty dock.
 */
export function resolveFallbackActivePanelId(args: {
  activePanelId: string | null;
  panelIds: readonly string[];
}): string | null {
  if (args.activePanelId) {
    return args.activePanelId;
  }
  const nonTerminal = args.panelIds.find((panelId) => {
    const surface = parsePanePanelId(panelId);
    return surface !== null && surface.kind !== "terminal";
  });
  return nonTerminal ?? args.panelIds[0] ?? null;
}

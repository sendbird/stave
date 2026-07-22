import { parsePanePanelId } from "@/lib/panes/types";

/** Share of the dock height a freshly created terminal group should take. */
export const TERMINAL_GROUP_DEFAULT_HEIGHT_RATIO = 0.3;

/** Smallest useful terminal group height in pixels. */
export const TERMINAL_GROUP_MIN_HEIGHT = 160;

export type TerminalPanelPosition =
  | { referencePanelId: string; direction: "within" }
  | { direction: "below" };

/** Panel ids that belong to terminal surfaces, preserving input order. */
export function findTerminalPanelIds(
  panelIds: readonly string[],
): string[] {
  return panelIds.filter(
    (panelId) => parsePanePanelId(panelId)?.kind === "terminal",
  );
}

/**
 * Placement for a new terminal panel: join the most recently added terminal
 * panel's group when one exists, otherwise split a dedicated bottom group off
 * the active group.
 */
export function resolveTerminalPanelPosition(
  panelIds: readonly string[],
): TerminalPanelPosition {
  const terminalPanelIds = findTerminalPanelIds(panelIds);
  const referencePanelId = terminalPanelIds[terminalPanelIds.length - 1];
  return referencePanelId
    ? { referencePanelId, direction: "within" }
    : { direction: "below" };
}

/**
 * Target pixel height for a freshly split terminal group (~30% of the dock),
 * clamped to a usable minimum and never exceeding the dock itself. Returns
 * null when the dock has not been laid out yet.
 */
export function resolveTerminalGroupHeight(
  totalHeight: number,
): number | null {
  if (!Number.isFinite(totalHeight) || totalHeight <= 0) {
    return null;
  }
  const target = Math.max(
    TERMINAL_GROUP_MIN_HEIGHT,
    Math.round(totalHeight * TERMINAL_GROUP_DEFAULT_HEIGHT_RATIO),
  );
  return Math.min(totalHeight, target);
}

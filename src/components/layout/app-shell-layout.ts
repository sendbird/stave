import {
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  normalizeRightPanelWidth,
} from "@/store/layout.utils";

export const MIN_CHAT_PANEL_WIDTH = 420;
export const MIN_EXPLORER_PANEL_WIDTH = RIGHT_PANEL_MIN_WIDTH;
export const PANEL_SEPARATOR_WIDTH = 1;

/**
 * The right panel's width in a content row this wide: the saved width inside
 * the panel's own range, then narrowed so the conversation keeps its minimum.
 * The panel never goes below its own minimum; a row too narrow for both shows
 * the panel as an overlay instead (see AppShell). `containerWidth` is null
 * before the row is measured.
 */
export function clampRightPanelWidth(args: {
  width: number;
  containerWidth: number | null;
}): number {
  const width = normalizeRightPanelWidth(args.width);
  if (args.containerWidth === null) {
    return width;
  }
  const roomBesideChat =
    args.containerWidth - MIN_CHAT_PANEL_WIDTH - PANEL_SEPARATOR_WIDTH;
  return Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    Math.min(width, roomBesideChat, RIGHT_PANEL_MAX_WIDTH),
  );
}

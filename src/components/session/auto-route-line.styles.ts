import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The single metadata line Auto leaves above a turn: muted caption text that
 * reads as provenance, not content. The fallback tint uses the theme's
 * warning text token, so it follows every built-in and custom theme.
 */
export const autoRouteLineStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  line: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-tight"],
    minHeight: 24,
    minWidth: 0,
  },
  // One 16px slot for both marks: the pending route loader (16px) and the
  // recorded route icon (12px), so the words do not move when one replaces
  // the other.
  iconSlot: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  icon: {
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  iconWarn: {
    color: vars["--ads-color-warning-text"],
  },
  lead: {
    flexShrink: 0,
  },
  model: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  metaWarn: {
    color: vars["--ads-color-warning-text"],
  },
  separator: {
    flexShrink: 0,
  },
  toggle: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-2"],
  },
  detail: {
    paddingInlineStart: vars["--ads-space-16"],
  },
  // Pending: the words share one live region; the clock sits outside it.
  pendingStatus: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  elapsed: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  // Mirrors the failed-send list: the pending turn sits after the virtual
  // list, so it carries its own spacing from the last row.
  pendingTurn: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    paddingTop: vars["--ads-space-16"],
    // The same room below as the list's last row, so the composer does not
    // crowd the pending line.
    paddingBottom: vars["--ads-space-24"],
    width: "100%",
  },
});

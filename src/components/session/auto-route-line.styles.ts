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
  // Pending: the shimmer phrase plus an elapsed clock and the skip action.
  pendingPhrase: {
    margin: 0,
    whiteSpace: "nowrap",
  },
  elapsed: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  skip: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    marginInlineStart: vars["--ads-space-4"],
  },
  // Mirrors the failed-send list: the pending turn sits after the virtual
  // list, so it carries its own spacing from the last row.
  pendingTurn: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    paddingTop: vars["--ads-space-16"],
    width: "100%",
  },
});

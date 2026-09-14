import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const conversationStyles = stylex.create({
  root: {
    position: "relative",
    display: "flex",
    minHeight: 0,
    flex: 1,
  },
  scroller: {
    minHeight: 0,
    flex: 1,
    overflowX: "hidden",
    overflowY: "auto",
  },
  innerLayout: {
    marginInline: "auto",
    display: "flex",
    width: "100%",
    maxWidth: "72rem",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingInline: {
      default: vars["--ads-space-12"],
      "@media (min-width: 640px)": vars["--ads-space-20"],
    },
    paddingBlock: vars["--ads-space-12"],
  },
  listContainer: {
    marginInline: "auto",
    width: "100%",
    maxWidth: "72rem",
    paddingInline: {
      default: vars["--ads-space-12"],
      "@media (min-width: 640px)": vars["--ads-space-20"],
    },
    paddingTop: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-20"],
    },
  },
  listItem: {
    paddingBottom: vars["--ads-space-12"],
    ":last-child": {
      paddingBottom: vars["--ads-space-24"],
    },
  },
  emptyState: {
    display: "flex",
    minHeight: 240,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  emptyIcon: {
    marginBottom: vars["--ads-space-12"],
    color: vars["--ads-color-text-muted"],
  },
  emptyTitle: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: `color-mix(in oklch, ${vars["--ads-color-text"]} 90%, transparent)`,
  },
  emptyDescription: {
    marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  /*
   * Placement only.
   *
   * The box is ADS's: `variant="floating" size="sm" iconOnly` is the raised
   * round viewport-level control, and it resolves a 32px SQUARE from
   * `controlSquares` plus `--ads-button-radius-*: radiusFull` and its own
   * elevation. What was here before hand-rolled three quarters of that —
   * `height: 32` with `paddingInline: space8` and no inline size, so the
   * control came out 40×32 and the `radiusFull` turned it into a lozenge
   * instead of a circle.
   */
  floatingButton: {
    position: "absolute",
    bottom: vars["--ads-space-12"],
    left: vars["--ads-space-12"],
  },
});

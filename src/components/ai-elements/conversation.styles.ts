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
    gap: vars.space12,
    paddingInline: {
      default: vars.space12,
      "@media (min-width: 640px)": vars.space20,
    },
    paddingBlock: vars.space12,
  },
  listContainer: {
    marginInline: "auto",
    width: "100%",
    maxWidth: "72rem",
    paddingInline: {
      default: vars.space12,
      "@media (min-width: 640px)": vars.space20,
    },
    paddingTop: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space20,
    },
  },
  listItem: {
    paddingBottom: vars.space12,
    ":last-child": {
      paddingBottom: vars.space24,
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
    marginBottom: vars.space12,
    color: vars.colorTextMuted,
  },
  emptyTitle: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    color: `color-mix(in oklch, ${vars.colorText} 90%, transparent)`,
  },
  emptyDescription: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
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
    bottom: vars.space12,
    left: vars.space12,
  },
});

import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import { transcriptMeasure } from "./transcript-measure.stylex";

const COLUMN = transcriptMeasure["--stave-transcript-column"];

/*
 * Every transcript container is the shared column plus its own inline padding,
 * so the rows inside it end exactly on the column's edges and stay centred on
 * the same axis as the composer.
 */
const columnMaxWidth = {
  default: `calc(${COLUMN} + 2 * ${vars["--aui-space-12"]})`,
  "@media (min-width: 640px)": `calc(${COLUMN} + 2 * ${vars["--aui-space-20"]})`,
};

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
    // The query container wide blocks measure against: they may grow past the
    // column toward the panel's edges, never past them.
    containerType: "inline-size",
  },
  innerLayout: {
    marginInline: "auto",
    display: "flex",
    width: "100%",
    maxWidth: columnMaxWidth,
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    paddingInline: {
      default: vars["--aui-space-12"],
      "@media (min-width: 640px)": vars["--aui-space-20"],
    },
    paddingBlock: vars["--aui-space-12"],
  },
  listContainer: {
    marginInline: "auto",
    width: "100%",
    maxWidth: columnMaxWidth,
    paddingInline: {
      default: vars["--aui-space-12"],
      "@media (min-width: 640px)": vars["--aui-space-20"],
    },
    paddingTop: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-20"],
    },
  },
  // Rows drawn after the virtual list (the pending send, failed sends, the
  // agent result) sit outside `listContainer`, so they take the same measure
  // here; otherwise they span the whole panel and touch its edges.
  column: {
    marginInline: "auto",
    width: "100%",
    maxWidth: columnMaxWidth,
    paddingInline: {
      default: vars["--aui-space-12"],
      "@media (min-width: 640px)": vars["--aui-space-20"],
    },
  },
  // The gap inside a turn. The gap between turns adds the user row's own top
  // padding (`chatPanelStyles.rowTurnStart`), so a turn boundary reads as one.
  listItem: {
    paddingBottom: vars["--aui-space-8"],
    ":last-child": {
      paddingBottom: vars["--aui-space-24"],
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
    marginBottom: vars["--aui-space-12"],
    color: vars["--aui-color-text-muted"],
  },
  emptyTitle: {
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: `color-mix(in oklch, ${vars["--aui-color-text"]} 90%, transparent)`,
  },
  emptyDescription: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    color: vars["--aui-color-text-muted"],
  },
  /*
   * Placement only.
   *
   * The box is AUI's: `variant="floating" size="sm" iconOnly` is the raised
   * round viewport-level control, and it resolves a 32px SQUARE from
   * `controlSquares` plus `--aui-button-radius-*: radiusFull` and its own
   * elevation. What was here before hand-rolled three quarters of that —
   * `height: 32` with `paddingInline: space8` and no inline size, so the
   * control came out 40×32 and the `radiusFull` turned it into a lozenge
   * instead of a circle.
   */
  /*
   * Centred on the transcript's axis, just above the composer, so it sits on
   * the column the reader follows rather than in the gutter beside it. The
   * `translate` property (not `transform`) leaves AUI's press transform alone.
   */
  floatingButton: {
    position: "absolute",
    bottom: vars["--aui-space-12"],
    left: "50%",
    translate: "-50% 0",
  },
});

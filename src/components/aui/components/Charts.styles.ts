import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/tokens.stylex";

/**
 * Upper bound for the side legend. It still grows with the card, but a legend
 * row must stay scannable: past this the swatch/label sit at one edge and the
 * value at the other, and the pair stops reading as a single row. Leftover
 * width goes to the split's `justify-content`, which centers plot + legend.
 */
const asideMaxInline = 360;

/**
 * The default entrance is opacity only (2026-11 consensus review): nothing the
 * reader is reading moves. The tooltip fades in when it first appears; the
 * plot fades in once when it mounts. A chart that plays its entrance (on by
 * default) uncovers its marks once instead (`Charts.entrance.ts`,
 * `chart-entrance-motion.css`); the fade is what every other chart gets.
 */
const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const styles = stylex.create({
  frame: {
    // The card stretches to its row (grid/flex default) so neighbours in the
    // same row share one height; its own content stays pinned to the top rather
    // than drifting apart as the row grows to the tallest card.
    alignContent: "start",
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    color: vars["--aui-color-text"],
    // The card is the query container: legends adapt to the card's own width, so
    // the same chart works in a 2-up and a 4-up grid with no call-site flags.
    containerName: "atelier-chart",
    containerType: "inline-size",
    display: "grid",
    // F6 card chrome: 8px between the header group (title, value, top legend)
    // and the plot; the header keeps its own 4px rhythm.
    gap: vars["--aui-space-8"],
    // Charts fill the box they are placed in. Capping the frame here is what
    // leaves dead space on the right of a wide grid cell — width belongs to the
    // page layout (grid column / max-width wrapper), not to the chart card.
    inlineSize: "100%",
    minInlineSize: 0,
    // 12 / 16: the mockup's 14/16/12, on the space scale.
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  // The table remains available to assistive technology, but its intrinsic
  // column widths must not enlarge a page's scrollable area from inside the
  // 1px visually-hidden wrapper.
  dataTable: {
    inlineSize: 1,
    maxInlineSize: 1,
    tableLayout: "fixed",
  },
  plot: {
    // The chart's one entrance: the plot fades in over the normal step when it
    // mounts (first paint, or data arriving after loading). Opacity only, so
    // it stays under reduced motion; `none` fill hands back to the refreshing
    // dim once it ends.
    animationDuration: vars["--aui-motion-duration-normal"],
    animationName: fadeIn,
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
    inlineSize: "100%",
    minInlineSize: 0,
    position: "relative",
  },
  // A chart that played its entrance (`Charts.entrance.ts`): the frame was
  // there from the first frame, so the plot does not fade as well.
  plotEntered: {
    animationName: "none",
  },
  // Centered over the plot box, which is the same box the arc is centered in.
  // It never takes the pointer: the wedges underneath own hover, and a label
  // sitting in the hole must not create a dead spot in the middle of them.
  // The keyboard-explorable plot: fills the plot box so the focus ring traces
  // the plot, radius-matched to the card's inner corner.
  // A refetch over drawn data: the last plot stays readable but visibly
  // provisional, and nothing moves — the opacity is the whole change.
  plotRefreshing: {
    opacity: vars["--aui-opacity-disabled"],
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionProperty: "opacity",
  },
  explore: {
    blockSize: "100%",
    borderRadius: vars["--aui-radius-control"],
    inlineSize: "100%",
    position: "relative",
  },
  plotOverlay: {
    alignItems: "center",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
  },
  emptyPlot: {
    alignItems: "center",
    blockSize: "100%",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    justifyContent: "center",
    lineHeight: vars["--aui-line-height-body"],
    textAlign: "center",
  },
  // Radial forms scale with height; capping the plot to a square keeps the arc
  // centered instead of stranding the plot box's unused width beside it.
  plotSquare: {
    marginInline: "auto",
  },
  // Stacked (narrow) form centers the capped plot over the chips below it; the
  // side form leaves centering to the split row.
  plotSquareAuto: {
    marginInline: {
      default: 0,
      "@container atelier-chart (max-width: 419px)": "auto",
    },
  },
  split: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-16"],
    // Both halves are capped (plot by its square, legend by `asideMaxInline`),
    // so on a very wide card the pair centers instead of letting the legend
    // stretch its label away from its value.
    justifyContent: "center",
    minInlineSize: 0,
  },
  splitColumn: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    justifyContent: "normal",
  },
  splitAuto: {
    alignItems: {
      default: "center",
      "@container atelier-chart (max-width: 419px)": "stretch",
    },
    flexDirection: {
      default: "row",
      "@container atelier-chart (max-width: 419px)": "column",
    },
    gap: {
      default: vars["--aui-space-16"],
      "@container atelier-chart (max-width: 419px)": vars["--aui-space-12"],
    },
    justifyContent: {
      default: "center",
      "@container atelier-chart (max-width: 419px)": "normal",
    },
  },
  plotSplit: {
    flexBasis: 200,
    flexGrow: 1,
    flexShrink: 1,
    minInlineSize: 180,
  },
  plotFull: {
    flexBasis: "auto",
    minInlineSize: 0,
  },
  plotAuto: {
    flexBasis: {
      default: 200,
      "@container atelier-chart (max-width: 419px)": "auto",
    },
    minInlineSize: {
      default: 180,
      "@container atelier-chart (max-width: 419px)": 0,
    },
  },
  aside: {
    flexBasis: 220,
    flexGrow: 1,
    flexShrink: 1,
    // A legend is a reading column, not a table spanning the card: past ~360px
    // the label and its value drift too far apart to scan as one row.
    maxInlineSize: asideMaxInline,
    minInlineSize: 200,
  },
  asideFull: {
    flexBasis: "auto",
    maxInlineSize: "none",
    minInlineSize: 0,
  },
  asideAuto: {
    flexBasis: {
      default: 220,
      "@container atelier-chart (max-width: 419px)": "auto",
    },
    maxInlineSize: {
      default: asideMaxInline,
      "@container atelier-chart (max-width: 419px)": "none",
    },
    minInlineSize: {
      default: 200,
      "@container atelier-chart (max-width: 419px)": 0,
    },
  },
  legend: {
    display: "grid",
    gap: vars["--aui-space-4"],
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  // Compact form: wrapped chips under the plot, values inline, share dropped.
  legendCompact: {
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: vars["--aui-space-4"],
  },
  legendAuto: {
    columnGap: {
      default: vars["--aui-space-4"],
      "@container atelier-chart (max-width: 419px)": vars["--aui-space-12"],
    },
    display: {
      default: "grid",
      "@container atelier-chart (max-width: 419px)": "flex",
    },
    flexWrap: "wrap",
  },
  // F6: one wrapping line of identity chips under the title — 12px apart,
  // 4px from swatch to caption label, read before the plot.
  legendTop: {
    columnGap: vars["--aui-space-12"],
  },
  legendLabelTop: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    maxInlineSize: "24ch",
  },
  // A line or area series: a 10×2 stroke rather than a dot.
  legendMarkLine: {
    blockSize: 2,
    inlineSize: 10,
  },
  // A comparison (dashed) or a reference line (dotted): the rule itself.
  legendMarkRule: {
    backgroundColor: "transparent",
    blockSize: 0,
    borderBlockStartStyle: "dashed",
    borderBlockStartWidth: vars["--aui-ring-width-sm"],
    borderRadius: 0,
    inlineSize: 10,
  },
  legendMarkDotted: {
    borderBlockStartStyle: "dotted",
  },
  legendItem: {
    display: "grid",
    minInlineSize: 0,
  },
  legendRow: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    textAlign: "start",
  },
  legendRowCompact: {
    columnGap: vars["--aui-space-4"],
    display: "flex",
    paddingBlock: 0,
  },
  legendRowAuto: {
    columnGap: {
      default: vars["--aui-space-8"],
      "@container atelier-chart (max-width: 419px)": vars["--aui-space-4"],
    },
    display: {
      default: "grid",
      "@container atelier-chart (max-width: 419px)": "flex",
    },
    paddingBlock: {
      default: vars["--aui-space-4"],
      "@container atelier-chart (max-width: 419px)": 0,
    },
  },
  legendButton: {
    backgroundColor: {
      default: "transparent",
      ":active": vars["--aui-color-overlay-pressed"],
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars["--aui-color-overlay-pressed"],
        ":hover": vars["--aui-color-overlay-hover"],
      },
    },
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "none",
    cursor: "pointer",
    marginInline: `calc(${vars["--aui-space-4"]} * -1)`,
    paddingInline: vars["--aui-space-4"],
  },
  legendRowHidden: {
    opacity: vars["--aui-opacity-disabled"],
  },
  legendSwatch: {
    blockSize: 8,
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    inlineSize: 8,
  },
  legendLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Chips wrap as whole units rather than squeezing labels to an ellipsis, but
  // one runaway label must not push the row past the card.
  legendLabelCompact: {
    flexShrink: 0,
    maxInlineSize: "18ch",
  },
  legendLabelAuto: {
    flexShrink: {
      default: 1,
      "@container atelier-chart (max-width: 419px)": 0,
    },
    maxInlineSize: {
      default: "none",
      "@container atelier-chart (max-width: 419px)": "18ch",
    },
  },
  // Figures in the UI face with tabular digits (2026-11 refresh): they still
  // line up down a column, without the code-editor look of a mono face.
  legendValue: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-body"],
  },
  legendShare: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    minInlineSize: "3ch",
    textAlign: "end",
  },
  // The share column is the first thing to go when the card gets narrow: the
  // chip form trades it for fitting four charts in a row.
  legendShareCompact: {
    display: "none",
  },
  legendShareAuto: {
    display: {
      default: "block",
      "@container atelier-chart (max-width: 419px)": "none",
    },
  },
  sparkline: {
    display: "inline-block",
  },
  // The chart tooltip is a transient popup anchored to the pointer, so it
  // wears the menu/popover surface (panel radius, overlay elevation) rather
  // than a control's, and fades in over the fast step instead of popping.
  // S5 popup chrome (F6): ring hairline + the wide, soft overlay drop.
  tooltip: {
    animationDuration: {
      default: vars["--aui-motion-duration-fast"],
      // Opacity only, so reduced motion keeps a shorter fade, not a snap.
      "@media (prefers-reduced-motion: reduce)": "60ms",
    },
    animationFillMode: "both",
    animationName: fadeIn,
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-overlay"],
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: "9rem",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  tooltipStill: {
    animationName: "none",
  },
  tooltipLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-caption"],
    paddingBlockEnd: vars["--aui-space-2"],
  },
  tooltipRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  tooltipSwatch: {
    blockSize: 8,
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    inlineSize: 8,
  },
  tooltipSwatchLine: {
    blockSize: 12,
    borderRadius: vars["--aui-radius-full"],
    inlineSize: 3,
  },
  tooltipSwatchDashed: {
    backgroundColor: "transparent",
    blockSize: 0,
    borderBlockStartStyle: "dashed",
    borderBlockStartWidth: vars["--aui-ring-width-sm"],
    borderRadius: 0,
    inlineSize: 10,
  },
  tooltipName: {
    color: vars["--aui-color-text-muted"],
    flexGrow: 1,
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
    marginInlineEnd: vars["--aui-space-12"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tooltipValue: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-body"],
    marginInlineStart: "auto",
  },
});

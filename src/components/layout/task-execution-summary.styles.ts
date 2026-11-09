import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

/** Tile grid breakpoints: three across once there is room, six when compact. */
const MEDIUM = "@media (min-width: 40rem)";
/**
 * The shelf tiles size to the shelf, not the window: a 26rem docked shelf in a
 * 90rem window is still narrow. Container queries need the root to be a
 * container, so `root` opts in.
 */
const WIDE_SHELF = "@container (min-width: 40rem)";
/**
 * Two-up tiles need about this much rail before labels like "Verification"
 * stop clipping. Narrower than that, the panel footer stacks one tile per row.
 */
const PANEL_TWO_UP = "@container (min-width: 24rem)";

export const summaryStyles = stylex.create({
  root: {
    containerType: "inline-size",
    minWidth: 0,
  },
  grid: {
    display: "grid",
    gap: vars["--aui-space-8"],
    gridAutoRows: "1fr",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  gridSpaced: {
    marginTop: vars["--aui-space-8"],
  },
  gridMedium: {
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [MEDIUM]: "repeat(3, minmax(0, 1fr))",
    },
  },
  // Four outcome tiles in the shelf: two-up until the shelf is wide enough
  // for a single row, never a three-up that strands one tile alone.
  gridCompact: {
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [WIDE_SHELF]: "repeat(4, minmax(0, 1fr))",
    },
  },
  // Panel footer: one tile per row while the rail is squeezed, two-up once
  // each tile has room for its label.
  gridPanel: {
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [PANEL_TWO_UP]: "repeat(2, minmax(0, 1fr))",
    },
  },
  /**
   * The Task panel's footer is one surface: a single bordered card whose
   * tiles are divided by hairlines (the grid's gap over a border-coloured
   * fill), not a stack of separately bordered boxes. The shelf keeps its
   * own tiles.
   */
  gridPanelSurface: {
    backgroundColor: vars["--aui-color-border"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    gap: vars["--aui-border-width-hairline"],
    overflow: "hidden",
  },
  tilePanel: {
    borderRadius: 0,
    borderWidth: 0,
    // A lone last tile in a two-up row spans it, so no border-coloured cell
    // shows through beside it.
    gridColumn: {
      default: null,
      ":nth-child(odd)": { default: null, ":last-child": "1 / -1" },
    },
  },
  tile: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minWidth: 0,
    overflow: "hidden",
    paddingBlock: 10,
    paddingInline: vars["--aui-space-12"],
  },
  tileCompact: {
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 10,
  },
  // The head is a quiet caption row: a small muted glyph, the label, and the
  // provenance dot pushed to the far edge. Nothing in it carries color; the
  // figure below does that, and only when it has a state to report.
  tileHead: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  tileIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  tileLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.04em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  readout: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    marginTop: 6,
    minWidth: 0,
  },
  figure: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.02em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  figureRoomy: {
    fontSize: vars["--aui-font-size-heading"],
    lineHeight: vars["--aui-line-height-heading"],
  },
  figureCompact: {
    fontSize: vars["--aui-font-size-lead"],
    lineHeight: vars["--aui-line-height-lead"],
  },
  figureDefault: {
    color: vars["--aui-color-text"],
  },
  emptyValue: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    marginTop: vars["--aui-space-4"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  partRow: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  part: {
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  toneDefault: {
    color: vars["--aui-color-text-muted"],
  },
  toneSuccess: {
    color: vars["--aui-color-success-text"],
  },
  toneWarning: {
    color: vars["--aui-color-warning-text"],
  },
  toneDanger: {
    color: vars["--aui-color-danger-text"],
  },
  toneAdded: {
    color: vars["--aui-color-diff-added-text"],
  },
  toneRemoved: {
    color: vars["--aui-color-diff-removed-text"],
  },
  // The meter sits under the figure as a second reading of the same number.
  meter: {
    marginTop: vars["--aui-space-2"],
  },
  provenanceDot: {
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    height: 6,
    marginInlineStart: "auto",
    width: 6,
  },
  provenanceReported: {
    backgroundColor: vars["--aui-color-text-muted"],
  },
  provenanceDerived: {
    borderColor: vars["--aui-color-text-muted"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  provenanceUnavailable: {
    backgroundColor: vars["--aui-color-text-muted"],
  },
  activityRow: {
    alignItems: "flex-start",
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  activityIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 14,
    marginTop: vars["--aui-space-2"],
    width: 14,
  },
  activityBody: {
    minWidth: 0,
  },
  activityHeading: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  activityText: {
    color: vars["--aui-color-text"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-2"],
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
  },
  activityTextClampOne: {
    WebkitLineClamp: 1,
  },
  activityTextClampTwo: {
    WebkitLineClamp: 2,
  },
  activityDetail: {
    color: vars["--aui-color-text-muted"],
  },
  activityProvenance: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    marginInlineStart: "auto",
  },
});

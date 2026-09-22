import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

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
    gap: vars["--ads-space-8"],
    gridAutoRows: "1fr",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  gridSpaced: {
    marginTop: vars["--ads-space-8"],
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
  tile: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minWidth: 0,
    overflow: "hidden",
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
    position: "relative",
  },
  tileCompact: {
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
  },
  /**
   * Identity color for a stat that has a reading. An empty tile stays
   * border-only so "Not reported" does not compete with a real number.
   */
  accentBar: {
    insetBlock: 0,
    insetInlineStart: 0,
    position: "absolute",
    width: 3,
  },
  accentInfo: {
    backgroundColor: vars["--ads-color-info"],
  },
  accentSuccess: {
    backgroundColor: vars["--ads-color-success"],
  },
  accentWarning: {
    backgroundColor: vars["--ads-color-warning"],
  },
  accentDanger: {
    backgroundColor: vars["--ads-color-danger"],
  },
  tileHead: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  iconWell: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    flexShrink: 0,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  wellMuted: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
  },
  wellInfo: {
    backgroundColor: vars["--ads-color-info-soft"],
  },
  wellSuccess: {
    backgroundColor: vars["--ads-color-success-soft"],
  },
  wellWarning: {
    backgroundColor: vars["--ads-color-warning-soft"],
  },
  wellDanger: {
    backgroundColor: vars["--ads-color-danger-soft"],
  },
  tileIcon: {
    flexShrink: 0,
    height: 13,
    width: 13,
  },
  iconMuted: {
    color: vars["--ads-color-text-muted"],
  },
  iconInfo: {
    color: vars["--ads-color-info"],
  },
  iconSuccess: {
    color: vars["--ads-color-success"],
  },
  iconWarning: {
    color: vars["--ads-color-warning"],
  },
  iconDanger: {
    color: vars["--ads-color-danger"],
  },
  tileLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.04em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  headAside: {
    flexShrink: 0,
    marginInlineStart: "auto",
  },
  readout: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    marginTop: 6,
    minWidth: 0,
  },
  figure: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.02em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  figureRoomy: {
    fontSize: vars["--ads-font-size-heading"],
    lineHeight: vars["--ads-line-height-heading"],
  },
  figureCompact: {
    fontSize: vars["--ads-font-size-lead"],
    lineHeight: vars["--ads-line-height-lead"],
  },
  figureDefault: {
    color: vars["--ads-color-text"],
  },
  emptyValue: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-regular"],
    marginTop: vars["--ads-space-4"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  partRow: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  part: {
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  toneDefault: {
    color: vars["--ads-color-text-muted"],
  },
  toneInfo: {
    color: vars["--ads-color-info-text"],
  },
  toneSuccess: {
    color: vars["--ads-color-success-text"],
  },
  toneWarning: {
    color: vars["--ads-color-warning-text"],
  },
  toneDanger: {
    color: vars["--ads-color-danger-text"],
  },
  toneAdded: {
    color: vars["--ads-color-diff-added-text"],
  },
  toneRemoved: {
    color: vars["--ads-color-diff-removed-text"],
  },
  meterTrack: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-full"],
    height: 6,
    overflow: "hidden",
    width: "100%",
  },
  meterFill: {
    borderRadius: vars["--ads-radius-full"],
    height: "100%",
  },
  meterInfo: {
    backgroundColor: {
      default: vars["--ads-color-info"],
      "@media (forced-colors: active)": "CanvasText",
    },
  },
  meterSuccess: {
    backgroundColor: {
      default: vars["--ads-color-success"],
      "@media (forced-colors: active)": "CanvasText",
    },
  },
  meterWarning: {
    backgroundColor: {
      default: vars["--ads-color-warning"],
      "@media (forced-colors: active)": "CanvasText",
    },
  },
  meterDanger: {
    backgroundColor: {
      default: vars["--ads-color-danger"],
      "@media (forced-colors: active)": "CanvasText",
    },
  },
  provenanceDot: {
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  provenanceReported: {
    backgroundColor: vars["--ads-color-text-muted"],
  },
  provenanceDerived: {
    borderColor: vars["--ads-color-text-muted"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  provenanceUnavailable: {
    backgroundColor: vars["--ads-color-text-subtle"],
  },
  activityRow: {
    alignItems: "flex-start",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  activityIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 14,
    marginTop: vars["--ads-space-2"],
    width: 14,
  },
  activityBody: {
    minWidth: 0,
  },
  activityHeading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  activityText: {
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
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
    color: vars["--ads-color-text-muted"],
  },
  activityProvenance: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    marginInlineStart: "auto",
  },
});

import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** Tile grid breakpoints: three across once there is room, six when compact. */
const MEDIUM = "@media (min-width: 40rem)";
const WIDE = "@media (min-width: 80rem)";

export const summaryStyles = stylex.create({
  root: {
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
  gridCompact: {
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [MEDIUM]: "repeat(3, minmax(0, 1fr))",
      [WIDE]: "repeat(6, minmax(0, 1fr))",
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
    paddingBlock: 10,
    paddingInline: vars["--ads-space-12"],
  },
  tileCompact: {
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
  },
  tileHead: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  tileIcon: {
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  tileLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  tileValue: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    marginTop: vars["--ads-space-4"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileValueRoomy: {
    fontSize: vars["--ads-font-size-caption"],
  },
  tileValueCompact: {
    fontSize: vars["--ads-font-size-micro"],
  },
  tileValueUnavailable: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-regular"],
  },
  toneDefault: {
    color: vars["--ads-color-text"],
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
  toneIconDefault: {
    color: vars["--ads-color-text-muted"],
  },
  provenanceDot: {
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 6,
    marginInlineStart: "auto",
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
    fontSize: vars["--ads-font-size-micro"],
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
    fontSize: vars["--ads-font-size-micro"],
    marginInlineStart: "auto",
  },
});

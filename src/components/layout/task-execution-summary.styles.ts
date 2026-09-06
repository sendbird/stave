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
    gap: vars.space8,
    gridAutoRows: "1fr",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  gridSpaced: {
    marginTop: vars.space8,
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
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minWidth: 0,
    paddingBlock: 10,
    paddingInline: vars.space12,
  },
  tileCompact: {
    paddingBlock: vars.space8,
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
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  tileValue: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
    marginTop: vars.space4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileValueRoomy: {
    fontSize: vars.fontSizeCaption,
  },
  tileValueCompact: {
    fontSize: vars.fontSizeMicro,
  },
  tileValueUnavailable: {
    color: vars.colorTextMuted,
    fontWeight: vars.fontWeightRegular,
  },
  toneDefault: {
    color: vars.colorText,
  },
  toneSuccess: {
    color: vars.colorSuccessText,
  },
  toneWarning: {
    color: vars.colorWarningText,
  },
  toneDanger: {
    color: vars.colorDangerText,
  },
  toneIconDefault: {
    color: vars.colorTextMuted,
  },
  provenanceDot: {
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 6,
    marginInlineStart: "auto",
    width: 6,
  },
  provenanceReported: {
    backgroundColor: vars.colorTextMuted,
  },
  provenanceDerived: {
    borderColor: vars.colorTextMuted,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  provenanceUnavailable: {
    backgroundColor: vars.colorTextSubtle,
  },
  activityRow: {
    alignItems: "flex-start",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  activityIcon: {
    color: vars.colorAccent,
    flexShrink: 0,
    height: 14,
    marginTop: vars.space2,
    width: 14,
  },
  activityBody: {
    minWidth: 0,
  },
  activityHeading: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  activityText: {
    color: vars.colorText,
    display: "-webkit-box",
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space2,
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
    color: vars.colorTextMuted,
  },
  activityProvenance: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    marginInlineStart: "auto",
  },
});

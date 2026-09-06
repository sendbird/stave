import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const controlMenuStyles = stylex.create({
  segmentGroup: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars.space2,
    borderRadius: vars.radiusControl,
    backgroundColor: `color-mix(in oklch, ${vars.colorSurfaceTint} 60%, transparent)`,
    padding: vars.space2,
  },
  segment: {
    borderRadius: "5px",
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    transitionProperty: "background-color, border-color, color",
    transitionDuration: vars.motionDurationFast,
    transitionTimingFunction: vars.motionEaseStandard,
  },
  segmentSelected: {
    backgroundColor: vars.colorSurface,
    color: vars.colorText,
    boxShadow: vars.elevationRaised,
  },
  segmentUnselected: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space2,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space12,
    borderRadius: vars.radiusControl,
    paddingInline: vars.space8,
    paddingBlock: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars.colorSurfaceTint} 40%, transparent)`,
    },
  },
  rowLabel: { minWidth: 0 },
  rowTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    color: vars.colorText,
  },
  rowDescription: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  footerNote: {
    paddingInline: vars.space8,
    paddingTop: 6,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
  },
  resetWrap: {
    paddingInline: vars.space8,
    paddingTop: vars.space4,
  },
  resetButton: {
    gap: 6,
    fontSize: vars.fontSizeCaption,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  resetIcon: { width: 12, height: 12 },
});

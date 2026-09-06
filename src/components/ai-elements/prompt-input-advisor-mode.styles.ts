import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const advisorModeStyles = stylex.create({
  pillOff: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  pillActive: {
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  iconWarning: { color: vars.colorWarning },
  effortBadge: {
    flexShrink: 0,
    borderRadius: vars.radiusMark,
    backgroundColor: `color-mix(in oklch, ${vars.colorSurfaceTint} 70%, transparent)`,
    paddingInline: vars.space4,
    fontSize: vars.fontSizeMicro,
    lineHeight: "16px",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorTextMuted,
  },
  unreachableBadge: {
    flexShrink: 0,
    borderRadius: vars.radiusMark,
    backgroundColor: vars.colorWarningSoft,
    paddingInline: vars.space4,
    fontSize: vars.fontSizeMicro,
    lineHeight: "16px",
    fontWeight: vars.fontWeightMedium,
    color: vars.colorWarningText,
  },
  tooltip: { maxWidth: "18rem" },
  popover: { width: "23rem" },
  providerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: vars.space4,
  },
  modelIconLead: {
    width: 16,
    height: 16,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  modelIconSize: { width: "0.875rem", height: "0.875rem" },
  nowrap: { whiteSpace: "nowrap" },
});

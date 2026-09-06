import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const workerModeStyles = stylex.create({
  pillOff: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  pillActive: {
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  iconWarning: { color: vars.colorWarning },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
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
  tooltip: { maxWidth: "18rem" },
  popover: { width: "25rem" },
  modelFallbackIcon: {
    display: "flex",
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorTextMuted,
  },
  nowrap: { whiteSpace: "nowrap" },
  modelIconSize: { width: "0.875rem", height: "0.875rem" },
});

import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const advisorModeStyles = stylex.create({
  pillOff: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  pillActive: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  iconWarning: { color: vars["--ads-color-warning"] },
  effortBadge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "16px",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  unreachableBadge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-mark"],
    backgroundColor: vars["--ads-color-warning-soft"],
    paddingInline: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "16px",
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-warning-text"],
  },
  tooltip: { maxWidth: "18rem" },
  popover: { width: "23rem" },
  providerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: vars["--ads-space-4"],
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

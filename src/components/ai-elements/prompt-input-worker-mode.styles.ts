import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const workerModeStyles = stylex.create({
  pillOff: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  pillActive: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  iconWarning: { color: vars["--ads-color-warning"] },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
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
  tooltip: { maxWidth: "18rem" },
  popover: { width: "25rem" },
  modelFallbackIcon: {
    display: "flex",
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text-muted"],
  },
  nowrap: { whiteSpace: "nowrap" },
  modelIconSize: { width: "0.875rem", height: "0.875rem" },
});

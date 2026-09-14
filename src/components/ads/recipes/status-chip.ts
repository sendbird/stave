import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export type StatusChipSize = "sm" | "md";
export type StatusChipTone =
  | "neutral"
  | "accent"
  | "info"
  | "warning"
  | "success"
  | "danger";
export type StatusChipVariant = "soft" | "outline";

/**
 * Shared visual contract for small semantic status objects. It deliberately
 * reads the existing semantic role pairs (`*Soft` + `*Text`) rather than
 * introducing component-specific color values.
 */
export const statusChip = stylex.create({
  root: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    justifySelf: "start",
    lineHeight: vars["--ads-line-height-tight"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: 0,
    whiteSpace: "nowrap",
  },
  md: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: 24,
    paddingInline: vars["--ads-space-8"],
  },
  sm: {
    fontSize: vars["--ads-font-size-micro"],
    minBlockSize: 20,
    paddingInline: vars["--ads-space-4"],
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: vars["--ads-color-border"],
  },
  softNeutral: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    color: vars["--ads-color-text-muted"],
  },
  softAccent: {
    backgroundColor: vars["--ads-color-accent-soft"],
    color: vars["--ads-color-accent"],
  },
  softInfo: {
    backgroundColor: vars["--ads-color-info-soft"],
    color: vars["--ads-color-info-text"],
  },
  softWarning: {
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning-text"],
  },
  softSuccess: {
    backgroundColor: vars["--ads-color-success-soft"],
    color: vars["--ads-color-success-text"],
  },
  softDanger: {
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-danger-text"],
  },
  outlineNeutral: { color: vars["--ads-color-text-muted"] },
  outlineAccent: { color: vars["--ads-color-accent"] },
  outlineInfo: { color: vars["--ads-color-info-text"] },
  outlineWarning: { color: vars["--ads-color-warning-text"] },
  outlineSuccess: { color: vars["--ads-color-success-text"] },
  outlineDanger: { color: vars["--ads-color-danger-text"] },
});

export const statusChipSizeStyles = {
  md: statusChip.md,
  sm: statusChip.sm,
} as const;

export const statusChipSoftToneStyles = {
  accent: statusChip.softAccent,
  danger: statusChip.softDanger,
  info: statusChip.softInfo,
  neutral: statusChip.softNeutral,
  success: statusChip.softSuccess,
  warning: statusChip.softWarning,
} as const;

export const statusChipOutlineToneStyles = {
  accent: statusChip.outlineAccent,
  danger: statusChip.outlineDanger,
  info: statusChip.outlineInfo,
  neutral: statusChip.outlineNeutral,
  success: statusChip.outlineSuccess,
  warning: statusChip.outlineWarning,
} as const;

export const statusChipIconSizes: Record<StatusChipSize, number> = {
  md: 14,
  sm: 12,
};

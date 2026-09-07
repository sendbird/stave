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
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    justifySelf: "start",
    lineHeight: vars.lineHeightTight,
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: 0,
    whiteSpace: "nowrap",
  },
  md: {
    fontSize: vars.fontSizeCaption,
    minBlockSize: 24,
    paddingInline: vars.space8,
  },
  sm: {
    fontSize: vars.fontSizeMicro,
    minBlockSize: 20,
    paddingInline: vars.space4,
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: vars.colorBorder,
  },
  softNeutral: {
    backgroundColor: vars.colorCanvasSubtle,
    color: vars.colorTextMuted,
  },
  softAccent: {
    backgroundColor: vars.colorAccentSoft,
    color: vars.colorAccent,
  },
  softInfo: {
    backgroundColor: vars.colorInfoSoft,
    color: vars.colorInfoText,
  },
  softWarning: {
    backgroundColor: vars.colorWarningSoft,
    color: vars.colorWarningText,
  },
  softSuccess: {
    backgroundColor: vars.colorSuccessSoft,
    color: vars.colorSuccessText,
  },
  softDanger: {
    backgroundColor: vars.colorDangerSoft,
    color: vars.colorDangerText,
  },
  outlineNeutral: { color: vars.colorTextMuted },
  outlineAccent: { color: vars.colorAccent },
  outlineInfo: { color: vars.colorInfoText },
  outlineWarning: { color: vars.colorWarningText },
  outlineSuccess: { color: vars.colorSuccessText },
  outlineDanger: { color: vars.colorDangerText },
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

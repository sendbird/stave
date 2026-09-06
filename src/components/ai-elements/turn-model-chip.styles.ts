import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnModelChipStyles = stylex.create({
  chip: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: vars.space2,
    overflow: "hidden",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 50%, transparent)`,
    padding: vars.space2,
    verticalAlign: "middle",
  },
  nameSegment: {
    display: "flex",
    height: "1.5rem",
    minWidth: 0,
    alignItems: "center",
    gap: "0.375rem",
    paddingInline: "0.375rem",
  },
  icon: {
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
  },
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  detail: {
    display: "flex",
    height: "1.5rem",
    flexShrink: 0,
    alignItems: "center",
    borderRadius: "0.32rem",
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    paddingInline: "0.375rem",
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
  },
  detailNeutral: {
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 45%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 70%, transparent)`,
    color: vars.colorTextMuted,
  },
  detailFast: {
    borderColor:
      "color-mix(in oklch, var(--prompt-role-fast) 30%, transparent)",
    backgroundColor:
      "color-mix(in oklch, var(--prompt-role-fast) 10%, transparent)",
    color: "var(--prompt-role-fast)",
  },
  detailThinking: {
    borderColor:
      "color-mix(in oklch, var(--prompt-role-thinking) 30%, transparent)",
    backgroundColor:
      "color-mix(in oklch, var(--prompt-role-thinking) 10%, transparent)",
    color: "var(--prompt-role-thinking)",
  },
});

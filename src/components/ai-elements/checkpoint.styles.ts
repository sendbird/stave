import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const checkpointStyles = stylex.create({
  compacting: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    paddingBlock: vars.space2,
    fontSize: "0.75em",
    color: vars.colorTextMuted,
  },
  compactingLoader: { flexShrink: 0 },

  divider: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    paddingBlock: vars.space4,
    fontSize: "0.75em",
    color: vars.colorTextMuted,
    userSelect: "none",
  },
  line: {
    height: 1,
    flex: 1,
    backgroundColor: `color-mix(in oklch, ${vars.colorBorder} 60%, transparent)`,
  },
  chip: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars.radiusFull,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 50%, transparent)`,
    paddingInline: "0.375rem",
    paddingBlock: vars.space2,
  },
  chipLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    paddingInline: vars.space4,
    fontWeight: vars.fontWeightMedium,
  },
  chipIcon: { width: 12, height: 12, flexShrink: 0 },
  confirmRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space4,
  },

  action: {
    height: 20,
    paddingInline: "0.375rem",
    fontSize: "0.6875em",
  },
  actionDanger: {
    color: {
      default: vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
  actionIcon: { marginRight: vars.space4, width: 12, height: 12 },
  actionLoader: { marginRight: vars.space4 },
});

import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnModelChipStyles = stylex.create({
  row: {
    display: "inline-flex",
    maxWidth: "100%",
    height: vars.controlHeightXs,
    alignItems: "center",
    gap: vars.space8,
    overflow: "hidden",
    verticalAlign: "middle",
  },
  nameSegment: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars.space8,
  },
  icon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    flexShrink: 0,
  },
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    color: vars.colorText,
  },
  detail: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightRegular,
    lineHeight: vars.lineHeightTight,
    color: vars.colorTextMuted,
  },
  context: {
    flexShrink: 0,
  },
  thinking: {
    color: "var(--prompt-role-thinking)",
  },
  fast: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    color: "var(--prompt-role-fast)",
  },
  fastIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    fill: "currentColor",
  },
});

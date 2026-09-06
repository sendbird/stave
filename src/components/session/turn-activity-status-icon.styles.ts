import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const turnActivityStatusIconStyles = stylex.create({
  // Fixed 16px slot every status glyph centres inside, so a 14px running icon
  // and a 16px completed check occupy the same column.
  slot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  iconLg: {
    height: 16,
    width: 16,
  },
  iconSm: {
    height: 14,
    width: 14,
  },
  success: {
    color: vars.colorSuccess,
  },
  danger: {
    color: vars.colorDanger,
  },
  warning: {
    color: vars.colorWarning,
  },
  pending: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 45%, transparent)`,
  },
  running: {
    color: vars.colorTextMuted,
  },
});

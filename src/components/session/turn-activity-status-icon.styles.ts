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
    color: vars["--ads-color-success"],
  },
  danger: {
    color: vars["--ads-color-danger"],
  },
  warning: {
    color: vars["--ads-color-warning"],
  },
  pending: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 45%, transparent)`,
  },
  running: {
    color: vars["--ads-color-text-muted"],
  },
});

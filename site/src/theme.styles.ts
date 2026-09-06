import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const themeStyles = stylex.create({
  icon: {
    inlineSize: vars.controlIconSizeMd,
    blockSize: vars.controlIconSizeMd,
  },
  activeMark: {
    marginInlineStart: "auto",
    fontSize: vars.fontSizeCaption,
  },
  menuContent: {
    inlineSize: "9rem",
  },
});

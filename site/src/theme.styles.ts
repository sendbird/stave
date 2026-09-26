import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const themeStyles = stylex.create({
  icon: {
    inlineSize: vars["--ads-control-icon-size-md"],
    blockSize: vars["--ads-control-icon-size-md"],
  },
  activeMark: {
    marginInlineStart: "auto",
    fontSize: vars["--ads-font-size-caption"],
  },
  menuContent: {
    inlineSize: "9rem",
  },
});

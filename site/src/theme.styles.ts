import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const themeStyles = stylex.create({
  icon: {
    inlineSize: vars["--aui-control-icon-size-md"],
    blockSize: vars["--aui-control-icon-size-md"],
  },
  activeMark: {
    marginInlineStart: "auto",
    fontSize: vars["--aui-font-size-caption"],
  },
  menuContent: {
    inlineSize: "9rem",
  },
});

import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const workspaceAccountLimitIconStyles = stylex.create({
  trigger: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  icon: {
    color: vars.colorDangerText,
    height: 14,
    width: 14,
  },
});

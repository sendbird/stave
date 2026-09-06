import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const commitContextMenuStyles = stylex.create({
  dialogNarrow: {
    maxWidth: "24rem",
  },
  destructiveHeader: {
    marginBottom: vars.space4,
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    color: vars.colorDangerText,
  },
  destructiveIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  destructiveTitle: {
    color: vars.colorDangerText,
  },
  menu: {
    width: "14rem",
  },
  menuLabel: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    color: vars.colorTextMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
});

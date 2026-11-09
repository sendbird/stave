import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const commitContextMenuStyles = stylex.create({
  dialogNarrow: {
    maxWidth: "24rem",
  },
  destructiveHeader: {
    marginBottom: vars["--aui-space-4"],
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    color: vars["--aui-color-danger-text"],
  },
  destructiveIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  destructiveTitle: {
    color: vars["--aui-color-danger-text"],
  },
  menu: {
    width: "14rem",
  },
  menuLabel: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
});

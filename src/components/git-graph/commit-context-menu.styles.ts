import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const commitContextMenuStyles = stylex.create({
  dialogNarrow: {
    maxWidth: "24rem",
  },
  destructiveHeader: {
    marginBottom: vars["--ads-space-4"],
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    color: vars["--ads-color-danger-text"],
  },
  destructiveIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  destructiveTitle: {
    color: vars["--ads-color-danger-text"],
  },
  menu: {
    width: "14rem",
  },
  menuLabel: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuIcon: {
    width: 16,
    height: 16,
  },
});

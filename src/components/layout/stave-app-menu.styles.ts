import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const staveAppMenuStyles = stylex.create({
  trigger: {
    backgroundColor: {
      default: vars["--aui-color-surface"],
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    gap: 6,
    height: 32,
    paddingInline: "0.625rem",
  },
  triggerCompact: {
    backgroundColor: {
      default: vars["--aui-color-canvas"],
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    height: 40,
    padding: 0,
    width: 40,
  },
  triggerOpen: {
    backgroundColor: vars["--aui-color-overlay-pressed"],
    borderColor: vars["--aui-color-accent"],
  },
  logo: { borderRadius: vars["--aui-radius-mark"], height: 16, width: 16 },
  menu: { width: 256 },
  itemIcon: { color: vars["--aui-color-text-muted"], height: 16, width: 16 },
  shortcut: { fontSize: vars["--aui-font-size-micro"], letterSpacing: "normal" },
});

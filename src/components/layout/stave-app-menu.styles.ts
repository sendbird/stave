import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const staveAppMenuStyles = stylex.create({
  trigger: {
    backgroundColor: {
      default: vars["--ads-color-surface"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    gap: 6,
    height: 32,
    paddingInline: "0.625rem",
  },
  triggerCompact: {
    backgroundColor: {
      default: vars["--ads-color-canvas"],
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    height: 40,
    padding: 0,
    width: 40,
  },
  triggerOpen: {
    backgroundColor: vars["--ads-color-overlay-pressed"],
    borderColor: vars["--ads-color-accent"],
  },
  logo: { borderRadius: vars["--ads-radius-mark"], height: 16, width: 16 },
  menu: { width: 256 },
  itemIcon: { color: vars["--ads-color-text-muted"], height: 16, width: 16 },
  shortcut: { fontSize: vars["--ads-font-size-micro"], letterSpacing: "normal" },
});

import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const staveAppMenuStyles = stylex.create({
  trigger: {
    backgroundColor: {
      default: vars.colorSurface,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    gap: 6,
    height: 32,
    paddingInline: "0.625rem",
  },
  triggerCompact: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: 40,
    padding: 0,
    width: 40,
  },
  triggerOpen: {
    backgroundColor: vars.colorOverlayPressed,
    borderColor: vars.colorAccent,
  },
  logo: { borderRadius: vars.radiusMark, height: 16, width: 16 },
  menu: { width: 256 },
  itemIcon: { color: vars.colorTextMuted, height: 16, width: 16 },
  shortcut: { fontSize: 11, letterSpacing: "normal" },
});

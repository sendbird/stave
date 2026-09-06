import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const sheetLayout = stylex.create({
  overlay: { position: "fixed", inset: 0, backgroundColor: "var(--overlay)" },
  surface: {
    position: "fixed", display: "flex", flexDirection: "column", gap: vars.space16,
    backgroundClip: "padding-box", fontSize: vars.fontSizeBody,
    transitionProperty: "translate, opacity", transitionDuration: "200ms", transitionTimingFunction: vars.motionEaseStandard,
    opacity: { default: 1, ":is([data-starting-style], [data-ending-style])": 0 },
  },
  left: {
    insetBlock: 0, left: 0, height: "100%", width: "75%", borderRightWidth: vars.borderWidthHairline,
    maxWidth: { default: null, "@media (min-width: 640px)": "24rem" },
    translate: { default: "0 0", ":is([data-starting-style], [data-ending-style])": "-2.5rem 0" },
  },
  right: {
    insetBlock: 0, right: 0, height: "100%", width: "75%", borderLeftWidth: vars.borderWidthHairline,
    maxWidth: { default: null, "@media (min-width: 640px)": "24rem" },
    translate: { default: "0 0", ":is([data-starting-style], [data-ending-style])": "2.5rem 0" },
  },
  top: {
    insetInline: 0, top: 0, height: "auto", borderBottomWidth: vars.borderWidthHairline,
    translate: { default: "0 0", ":is([data-starting-style], [data-ending-style])": "0 -2.5rem" },
  },
  bottom: {
    insetInline: 0, bottom: 0, height: "auto", borderTopWidth: vars.borderWidthHairline,
    translate: { default: "0 0", ":is([data-starting-style], [data-ending-style])": "0 2.5rem" },
  },
  header: { display: "flex", flexDirection: "column", gap: 6, padding: vars.space16 },
  footer: { marginTop: "auto", display: "flex", flexDirection: "column", gap: vars.space8, padding: vars.space16 },
});

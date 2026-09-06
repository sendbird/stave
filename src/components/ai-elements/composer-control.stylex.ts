import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const toolbarMarker = stylex.defineMarker();
export const wingMarker = stylex.defineMarker();
export const shelfMarker = stylex.defineMarker();
export const menuMarker = stylex.defineMarker();

/** Lane owners determine geometry; providers and actions determine behavior. */
export const controlStyles = stylex.create({
  button: {
    height: { default: 36, [stylex.when.ancestor(":is(*)", toolbarMarker)]: 36, [stylex.when.ancestor(":is(*)", wingMarker)]: 32, [stylex.when.ancestor(":is(*)", shelfMarker)]: 24, [stylex.when.ancestor(":is(*)", menuMarker)]: 32 },
    minHeight: { default: null, [stylex.when.ancestor(":is(*)", toolbarMarker)]: 36, [stylex.when.ancestor(":is(*)", wingMarker)]: 32, [stylex.when.ancestor(":is(*)", shelfMarker)]: 24, [stylex.when.ancestor(":is(*)", menuMarker)]: 32 },
    gap: { default: 6, [stylex.when.ancestor(":is(*)", wingMarker)]: vars.space8, [stylex.when.ancestor(":is(*)", menuMarker)]: vars.space8 },
    paddingInline: { default: 10, [stylex.when.ancestor(":is(*)", wingMarker)]: vars.space8, [stylex.when.ancestor(":is(*)", shelfMarker)]: 6, [stylex.when.ancestor(":is(*)", menuMarker)]: vars.space8 },
    width: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: "100%", [stylex.when.ancestor(":is(*)", menuMarker)]: "100%" },
    flexShrink: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: 0 },
    justifyContent: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: "flex-start", [stylex.when.ancestor(":is(*)", menuMarker)]: "flex-start" },
    flexDirection: { default: null, [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "row-reverse" },
    textAlign: { default: null, [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "right", [stylex.when.ancestor(':is([data-side="right"])', wingMarker)]: "left" },
    fontSize: vars.fontSizeCaption,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    boxShadow: "none",
  },
  wingLabel: {
    pointerEvents: "none", display: "inline-flex", minWidth: 0, flex: 1, alignItems: "center", gap: 6,
    whiteSpace: "nowrap", fontSize: vars.fontSizeCaption,
    opacity: { default: 0, [stylex.when.ancestor(":is(:hover, :focus-within, :has([aria-expanded=true]))", wingMarker)]: 1 },
    translate: {
      default: "0 0",
      [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "-4px 0",
      [stylex.when.ancestor(':is([data-side="right"])', wingMarker)]: "4px 0",
      [stylex.when.ancestor(":is(:hover, :focus-within, :has([aria-expanded=true]))", wingMarker)]: "0 0",
      "@media (prefers-reduced-motion: reduce)": "0 0",
    },
    justifyContent: { default: "flex-start", [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "flex-end" },
    transitionProperty: { default: "opacity, translate", "@media (prefers-reduced-motion: reduce)": "opacity" },
    transitionDuration: "150ms", transitionTimingFunction: vars.motionEaseStandard,
  },
  menu: {
    width: "auto", minWidth: "14rem", maxWidth: "min(26rem, calc(100vw - 2rem))", gap: 0,
    borderRadius: vars.radiusPanel, backgroundColor: vars.colorSurfaceRaised, padding: vars.space8,
    boxShadow: vars.elevationOverlay,
  },
  menuList: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: vars.space4 },
  menuRow: { display: "flex", alignItems: "center", gap: vars.space8 },
  menuLabel: { fontSize: vars.fontSizeBody, color: vars.colorTextMuted },
});

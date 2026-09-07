import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const toolbarMarker = stylex.defineMarker();
export const wingMarker = stylex.defineMarker();
export const shelfMarker = stylex.defineMarker();
export const menuMarker = stylex.defineMarker();

/** Lane owners determine geometry; providers and actions determine behavior. */
export const controlStyles = stylex.create({
  button: {
    // Heights come off the ADS control ramp (`recipes/control-metrics`):
    // sm 32 everywhere. The in-card toolbar used to ask for md 36, but the
    // attach/send buttons that share that row live in `actionsRow`, outside
    // this lane, and are icon-sm (32) — so the row rendered 36 next to 32.
    // Every composer control already requests ADS `size="sm"`, so sm is the
    // height they all agree on. A lane may
    // not ask for less than the ADS `size` its controls carry — `min-block-size`
    // from `controlHeights` floors the box, so a sub-`size` lane value renders
    // as the ADS floor and the row silently mixes two heights. That is exactly
    // what the old `shelf: 24` did: pills floored at 32 while the shelf's
    // icon-only buttons really were 24.
    blockSize: {
      default: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", wingMarker)]: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", shelfMarker)]: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", menuMarker)]: vars.controlHeightSm,
    },
    minBlockSize: {
      default: null,
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", wingMarker)]: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", shelfMarker)]: vars.controlHeightSm,
      [stylex.when.ancestor(":is(*)", menuMarker)]: vars.controlHeightSm,
    },
    gap: vars.space8,
    paddingInline: { default: vars.space12, [stylex.when.ancestor(":is(*)", wingMarker)]: vars.space8, [stylex.when.ancestor(":is(*)", shelfMarker)]: vars.space8, [stylex.when.ancestor(":is(*)", menuMarker)]: vars.space8 },
    inlineSize: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: "100%", [stylex.when.ancestor(":is(*)", menuMarker)]: "100%" },
    flexShrink: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: 0 },
    justifyContent: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: "flex-start", [stylex.when.ancestor(":is(*)", menuMarker)]: "flex-start" },
    flexDirection: { default: null, [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "row-reverse" },
    textAlign: { default: null, [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "right", [stylex.when.ancestor(':is([data-side="right"])', wingMarker)]: "left" },
    fontSize: vars.fontSizeCaption,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    boxShadow: "none",
    // Radius is deliberately absent: ADS `Button` resolves each corner from
    // `var(--ads-button-radius-*, vars.radiusControl)` and nothing in this
    // repository sets those properties (only ADS `ButtonGroup`/`SplitButton`
    // do, upstream, and they set them on the grouped button itself). So every
    // lane renders `radiusControl`, and restating it here would be the one
    // thing that could break a future grouped composer control.
  },
  wingLabel: {
    pointerEvents: "none", display: "inline-flex", minInlineSize: 0, flex: 1, alignItems: "center", gap: vars.space8,
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
    inlineSize: "auto", minInlineSize: "14rem", maxInlineSize: "min(26rem, calc(100vw - 2rem))", gap: 0,
    borderRadius: vars.radiusPanel, backgroundColor: vars.colorSurfaceRaised, padding: vars.space8,
    boxShadow: vars.elevationOverlay,
  },
  menuList: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: vars.space4 },
  menuRow: { display: "flex", alignItems: "center", gap: vars.space8 },
  menuLabel: { fontSize: vars.fontSizeBody, color: vars.colorTextMuted },
});

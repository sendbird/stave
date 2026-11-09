import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const toolbarMarker = stylex.defineMarker();
export const wingMarker = stylex.defineMarker();
export const shelfMarker = stylex.defineMarker();
export const menuMarker = stylex.defineMarker();
/**
 * A row that holds ONE action expressed as more than one button — a primary
 * plus its alternatives menu. The lane hands such a row its width once, at the
 * group, instead of asking each half for `100%` of a box that has no width of
 * its own.
 */
export const groupMarker = stylex.defineMarker();

/** Lane owners determine geometry; providers and actions determine behavior. */
export const controlStyles = stylex.create({
  button: {
    /*
     * `layout="host"` hands the caller the whole box, AUI's own
     * `display: inline-flex` included — so the lane has to state it. Without
     * these two the shelf's Advisor and Worker triggers fell back to the UA
     * `inline-block` and stacked their glyph above their label while their
     * `layout="control"` neighbours in the same row stayed inline.
     */
    alignItems: "center",
    display: "inline-flex",
    // Heights come off the AUI control ramp (`recipes/control-metrics`):
    // sm 32 everywhere. The in-card toolbar used to ask for md 36, but the
    // attach/send buttons that share that row live in `actionsRow`, outside
    // this lane, and are icon-sm (32) — so the row rendered 36 next to 32.
    // Every composer control already requests AUI `size="sm"`, so sm is the
    // height they all agree on. A lane may
    // not ask for less than the AUI `size` its controls carry — `min-block-size`
    // from `controlHeights` floors the box, so a sub-`size` lane value renders
    // as the AUI floor and the row silently mixes two heights. That is exactly
    // what the old `shelf: 24` did: pills floored at 32 while the shelf's
    // icon-only buttons really were 24.
    blockSize: {
      default: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", wingMarker)]: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", shelfMarker)]: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", menuMarker)]: vars["--aui-control-height-sm"],
    },
    minBlockSize: {
      default: null,
      [stylex.when.ancestor(":is(*)", toolbarMarker)]: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", wingMarker)]: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", shelfMarker)]: vars["--aui-control-height-sm"],
      [stylex.when.ancestor(":is(*)", menuMarker)]: vars["--aui-control-height-sm"],
    },
    gap: vars["--aui-space-8"],
    paddingInline: { default: vars["--aui-space-12"], [stylex.when.ancestor(":is(*)", wingMarker)]: vars["--aui-space-8"], [stylex.when.ancestor(":is(*)", shelfMarker)]: vars["--aui-space-8"], [stylex.when.ancestor(":is(*)", menuMarker)]: vars["--aui-space-8"] },
    /*
     * The wing and menu lanes stack one full-width control per row, so a
     * control there fills its row.
     *
     * `groupMarker` is listed LAST and wins, because that width is wrong the
     * moment a row holds a two-part action. The `⋯` tray's Compare control is
     * a primary plus a chevron menu inside a shrink-to-fit wrapper: both
     * halves asked for `100%` of a box with no definite width, both flex bases
     * overflowed it, both shrank, and the primary ended up at roughly half a
     * row — which is what truncated `Compare` to `Comp` under AUI's own label
     * ellipsis. Inside a group the row width belongs to the group
     * (`COMPOSER_CONTROL_GROUP`); the halves go back to hugging and the
     * primary claims the slack with `flexGrow`.
     */
    inlineSize: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: "100%", [stylex.when.ancestor(":is(*)", menuMarker)]: "100%", [stylex.when.ancestor(":is(*)", groupMarker)]: "auto" },
    minInlineSize: { default: null, [stylex.when.ancestor(":is(*)", groupMarker)]: 0 },
    flexShrink: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: 0 },
    justifyContent: { default: null, [stylex.when.ancestor(":is(*)", wingMarker)]: "flex-start", [stylex.when.ancestor(":is(*)", menuMarker)]: "flex-start" },
    flexDirection: { default: null, [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "row-reverse" },
    textAlign: { default: null, [stylex.when.ancestor(':is([data-side="left"])', wingMarker)]: "right", [stylex.when.ancestor(':is([data-side="right"])', wingMarker)]: "left" },
    fontSize: vars["--aui-font-size-caption"],
    /*
     * One glyph size for the whole lane, published as the AUI control variable
     * so it reaches the `[data-aui-control="button"] > svg` contract as well as
     * anything sized by hand.
     *
     * The lane pins every control to `controlHeightSm` (32px) above, and an AUI
     * `sm` control publishes `controlIconSizeSm` (14px). But the composer's own
     * controls each declared a 16px glyph locally — advisor mode, worker mode,
     * provider mode, the runtime trigger — so the wings rendered 16px next to
     * AUI's 14px depending on which control had bothered to state it, and the
     * plain ones read as having shrunk. 16px (`controlIconSizeMd`) is the value
     * this surface already chose in four places and the one that suits a 32px
     * box; stating it once on the lane makes the odd control out impossible.
     */
    "--aui-control-icon-size": vars["--aui-control-icon-size-md"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    // Explicitly flat, on the elevation scale: a lane control is chrome drawn
    // on the composer surface, so it carries no depth of its own.
    boxShadow: vars["--aui-elevation-flat"],
    // Radius is deliberately absent: AUI `Button` resolves each corner from
    // `var(--aui-button-radius-*, vars["--aui-radius-control"])` and nothing in this
    // repository sets those properties (only AUI `ButtonGroup`/`SplitButton`
    // do, upstream, and they set them on the grouped button itself). So every
    // lane renders `radiusControl`, and restating it here would be the one
    // thing that could break a future grouped composer control.
  },
  /**
   * The row box for a two-part action (primary + alternatives menu).
   *
   * It takes over the full-row width the lane would otherwise have demanded
   * from each half, and it is the element carrying `groupMarker`, so the
   * halves inside it hug. `gap` is `space2` rather than 0 because AUI's
   * grouped-button radii (`--aui-button-radius-*`) are not installed in this
   * bundle, so a connected edge cannot be expressed yet — see the AUI request
   * log. Until then the two halves stay two buttons with a hairline gap.
   */
  group: {
    alignItems: "stretch",
    display: "inline-flex",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
    inlineSize: {
      default: null,
      [stylex.when.ancestor(":is(*)", wingMarker)]: "100%",
      [stylex.when.ancestor(":is(*)", menuMarker)]: "100%",
    },
  },
  /** The primary half of a group claims the slack; the menu half hugs. */
  groupPrimary: { flexGrow: 1, minInlineSize: 0 },
  groupMenu: { flexGrow: 0, flexShrink: 0 },
  wingLabel: {
    pointerEvents: "none", display: "inline-flex", minInlineSize: 0, flex: 1, alignItems: "center", gap: vars["--aui-space-8"],
    whiteSpace: "nowrap", fontSize: vars["--aui-font-size-caption"],
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
    transitionDuration: "150ms", transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /*
   * Geometry and inner air only. Both overflow menus render on an AUI popover
   * surface, which already owns the anchored-popup elevation step, so the
   * elevation that used to be restated here is the surface's to state once.
   */
  menu: {
    inlineSize: "auto", minInlineSize: "14rem", maxInlineSize: "min(26rem, calc(100vw - 2rem))", gap: 0,
    borderRadius: vars["--aui-radius-panel"], backgroundColor: vars["--aui-color-surface-raised"], padding: vars["--aui-space-8"],
  },
  menuList: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: vars["--aui-space-4"] },
  menuRow: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"] },
  menuLabel: { fontSize: vars["--aui-font-size-body"], color: vars["--aui-color-text-muted"] },
});

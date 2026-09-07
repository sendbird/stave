import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/** Host geometry; surface, focus and motion recipes belong to ADS. */
export const overlayLayout = stylex.create({
  positioner: { isolation: "isolate" },
  dialog: {
    position: "fixed",
    top: "50%",
    left: "50%",
    display: "grid",
    width: "calc(100% - 2rem)",
    maxWidth: "28rem",
    translate: "-50% -50%",
    gap: vars.space24,
    padding: vars.space24,
    fontSize: vars.fontSizeBody,
    outlineStyle: "none",
  },
  close: { position: "absolute", top: vars.space16, right: vars.space16 },
  header: { display: "flex", flexDirection: "column", gap: vars.space8 },
  footer: {
    display: "flex",
    flexDirection: { default: "column-reverse", "@media (min-width: 640px)": "row" },
    justifyContent: { default: "normal", "@media (min-width: 640px)": "flex-end" },
    gap: vars.space8,
  },
  description: { fontSize: vars.fontSizeBody, color: vars.colorTextMuted },
  popover: {
    display: "flex",
    width: "18rem",
    transformOrigin: "var(--transform-origin)",
    flexDirection: "column",
    gap: vars.space16,
    padding: vars.space16,
    fontSize: vars.fontSizeBody,
    outlineStyle: "none",
  },
  /**
   * The edge-to-edge popover surface, composed AFTER `popover` so it wins the
   * properties it names (one `stylex.props` call, last write wins).
   *
   * Mirrors the ADS Popover `density="flush"` affordance: the surface drops its
   * own padding and gap so content can draw section rules that reach the
   * border, and whatever is inside owns ONE inner gutter (`space16`, the ADS
   * popover scale) instead of adding a second inset on top of this one.
   *
   * `overflowY: auto` does double duty — it clips the flush content to the
   * surface's own radius, which is what lets a full-bleed rule end in the
   * rounded corner rather than square across it, and it restores the anchored
   * height clamp the host geometry never had: without `maxBlockSize` a tall
   * popover ran past the viewport with no way to reach its own content. A
   * flush popover therefore must not rely on an overflowing absolutely
   * positioned child (a nested arrow, a submenu painted outside the box).
   */
  popoverFlush: {
    gap: 0,
    maxBlockSize: "var(--available-height, calc(100dvh - 2rem))",
    overflowY: "auto",
    padding: 0,
  },
  popoverHeader: { display: "flex", flexDirection: "column", gap: vars.space4, fontSize: vars.fontSizeBody },
  muted: { color: vars.colorTextMuted },
  submenuArrow: { marginInlineStart: "auto" },
  menuIndicator: { pointerEvents: "none", position: "absolute", right: vars.space8 },
  menuLabel: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  selectArrow: { pointerEvents: "none", width: vars.space16, height: vars.space16, color: vars.colorTextMuted },
  selectList: { width: "100%", minWidth: 0, padding: vars.space4 },
  selectLabel: { display: "flex", minWidth: 0, flex: 1, gap: vars.space8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  selectIndicator: { pointerEvents: "none", position: "absolute", right: vars.space8, display: "flex", width: vars.space16, height: vars.space16, alignItems: "center", justifyContent: "center" },
  decorative: { pointerEvents: "none" },
  tableViewport: { position: "relative", width: "100%", overflowX: "auto", "--atelier-table-cell-padding-block": vars.space8 },
  keyGroup: { display: "inline-flex", alignItems: "center", gap: vars.space4, whiteSpace: "nowrap" },
});

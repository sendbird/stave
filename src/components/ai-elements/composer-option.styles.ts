import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const optionStyles = stylex.create({
  menu: { gap: vars["--ads-space-8"], padding: vars["--ads-space-8"] },
  list: { maxHeight: "13rem", display: "flex", flexDirection: "column", gap: vars["--ads-space-2"], overflowY: "auto" },
  toggle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--ads-space-12"], paddingInline: vars["--ads-space-12"], paddingBlock: vars["--ads-space-8"] },
  label: { display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: vars["--ads-space-2"] },
  title: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], lineHeight: 1 },
  detail: { fontSize: vars["--ads-font-size-micro"], lineHeight: "16px", color: vars["--ads-color-text-muted"] },
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], borderTopWidth: vars["--ads-border-width-hairline"], borderTopStyle: "solid", borderTopColor: vars["--ads-color-border-subtle"], paddingTop: vars["--ads-space-8"] },
  sectionTitle: { paddingInline: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"], color: vars["--ads-color-text-muted"] },
  /*
   * The row geometry these two option lists share is ADS's own two-line item
   * recipe (`recipes/select-styles` `item` + `itemText`/`itemCopy`/
   * `itemLabelLine`/`itemDescription`/`itemIndicator`), not a local box. What
   * the local box got wrong is instructive: it declared `justify-content`,
   * `gap` and a trailing `align-self` but never `display`, and
   * `Button layout="host"` hands geometry to the caller — so the row was a UA
   * `inline-block`, every flex property was inert, and the block-level label
   * stack pushed the trailing check onto a line of its own at the row's
   * START edge. The ADS recipe is a 2-column grid whose second track exists
   * for that mark, so the check is trailing-aligned and vertically centred by
   * construction rather than by a property that has to win.
   *
   * Only two host deltas remain.
   *
   * 1. `select-styles.item` lands on Base UI's own `<div>` rows, so it never
   *    had to answer UA control chrome. These rows are native `<button>`s
   *    (they perform an action), which arrive with `appearance`, a `2px
   *    outset` border, a margin and a centred label. `recipes/menu.ts` states
   *    exactly this reset one file over, for exactly this reason.
   */
  rowReset: {
    appearance: "none",
    borderStyle: "none",
    borderWidth: 0,
    fontFamily: "inherit",
    margin: 0,
    textAlign: "start",
  },
  /** 2. Title weight only; the line box and the ellipsis come from `itemLabel`. */
  rowTitle: { fontWeight: vars["--ads-font-weight-medium"] },
  selected: { backgroundColor: { default: vars["--ads-color-selection-fill"], ":hover": vars["--ads-color-selection-fill"] } },
  // Glyph size only: `select-styles.itemIndicator` owns the mark's box,
  // placement and centring.
  check: { width: 14, height: 14, flexShrink: 0 },
  selectedCheck: { color: vars["--ads-color-accent"] },
  hint: { paddingInline: vars["--ads-space-4"], fontSize: vars["--ads-font-size-micro"], lineHeight: "16px", color: vars["--ads-color-text-muted"] },
  callout: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-8"], paddingInline: 10, paddingBlock: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"], lineHeight: "20px", color: vars["--ads-color-text-muted"] },
  warning: { color: vars["--ads-color-warning-text"], backgroundColor: vars["--ads-color-warning-soft"], borderRadius: vars["--ads-radius-control"] },
  calloutIcon: { marginTop: vars["--ads-space-2"], width: 14, height: 14, flexShrink: 0 },
  calloutBody: { minWidth: 0, flex: 1 },
  settingsLink: {
    paddingInline: vars["--ads-space-4"], textAlign: "start", fontSize: vars["--ads-font-size-micro"], lineHeight: "16px",
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    textUnderlineOffset: 2, textDecorationLine: { default: "none", ":hover": "underline" },
  },
});

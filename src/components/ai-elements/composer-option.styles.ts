import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const optionStyles = stylex.create({
  menu: { gap: vars.space8, padding: vars.space8 },
  list: { maxHeight: "13rem", display: "flex", flexDirection: "column", gap: vars.space2, overflowY: "auto" },
  toggle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars.space12, paddingInline: vars.space12, paddingBlock: vars.space8 },
  label: { display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: vars.space2 },
  title: { fontSize: vars.fontSizeBody, fontWeight: vars.fontWeightMedium, lineHeight: 1 },
  detail: { fontSize: vars.fontSizeMicro, lineHeight: "16px", color: vars.colorTextMuted },
  section: { display: "flex", flexDirection: "column", gap: vars.space4, borderTopWidth: vars.borderWidthHairline, borderTopStyle: "solid", borderTopColor: vars.colorBorderSubtle, paddingTop: vars.space8 },
  sectionTitle: { paddingInline: vars.space4, fontSize: vars.fontSizeCaption, fontWeight: vars.fontWeightSemibold, color: vars.colorTextMuted },
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
  rowTitle: { fontWeight: vars.fontWeightMedium },
  selected: { backgroundColor: { default: vars.colorSelectionFill, ":hover": vars.colorSelectionFill } },
  // Glyph size only: `select-styles.itemIndicator` owns the mark's box,
  // placement and centring.
  check: { width: 14, height: 14, flexShrink: 0 },
  selectedCheck: { color: vars.colorAccent },
  hint: { paddingInline: vars.space4, fontSize: vars.fontSizeMicro, lineHeight: "16px", color: vars.colorTextMuted },
  callout: { display: "flex", alignItems: "flex-start", gap: vars.space8, paddingInline: 10, paddingBlock: vars.space8, fontSize: vars.fontSizeCaption, lineHeight: "20px", color: vars.colorTextMuted },
  warning: { color: vars.colorWarningText, backgroundColor: vars.colorWarningSoft, borderRadius: vars.radiusControl },
  calloutIcon: { marginTop: vars.space2, width: 14, height: 14, flexShrink: 0 },
  calloutBody: { minWidth: 0, flex: 1 },
  settingsLink: {
    paddingInline: vars.space4, textAlign: "start", fontSize: vars.fontSizeMicro, lineHeight: "16px",
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    textUnderlineOffset: 2, textDecorationLine: { default: "none", ":hover": "underline" },
  },
});

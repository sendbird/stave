import * as stylex from "@stylexjs/stylex";

import { listbox } from "../recipes/listbox";
import { vars } from "../tokens/tokens.stylex";

export const styles = stylex.create({
  field: {
    alignContent: "start",
    display: "grid",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  label: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  inputGroup: {
    alignItems: "center",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    inlineSize: "100%",
    // Height comes from the shared control-metrics recipe (density-mapped in
    // the InputGroup part) — never re-declare minBlockSize here.
    minInlineSize: 0,
  },
  // `searchIcon` adds a leading glyph track ahead of the input. The trailing
  // `auto` track stays put so `Actions` (clear + trigger) lands where it always
  // did — this is additive, never a re-layout of the default group.
  /*
   * A search row inside the popup takes the same 4px inset `listbox.list`
   * gives every option row, so the two line up and the row stops cutting
   * across the popup's rounded corner. `radiusPanel` (12) less this inset is
   * exactly `radiusControl` (8), so the corners nest.
   */
  inputGroupInPopup: {
    // The popup is a column (see `popup`); the search row keeps its height and
    // the list is the row that gives.
    flexShrink: 0,
    // `inputGroup` is `inlineSize: 100%` for the trigger, where it fills the
    // field. Here the margins have to come out of that width, so it reverts to
    // `auto` and the grid row sizes itself inside the popup instead.
    inlineSize: "auto",
    marginBlockStart: vars["--aui-space-4"],
    marginInline: vars["--aui-space-4"],
  },
  inputGroupWithSearchIcon: {
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
  },
  // `leadingActions` opens the same leading track `searchIcon` does. When both
  // are present the addon sits outside the glyph, so the group takes a fourth
  // column rather than making the two share one.
  inputGroupWithLeadingActions: {
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
  },
  inputGroupWithLeadingActionsAndSearchIcon: {
    gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
  },
  /*
   * The gutter lives on this wrapper, never on the `<svg>` itself: lucide sets
   * width/height attributes, so padding on the glyph is swallowed by the
   * border-box and the icon lands hard against the group's inner edge (1px in,
   * measured) instead of on the 12px text gutter. `colorTextSubtle` is the
   * decorative-mark token Command and EmojiPicker already paint their search
   * glyphs with, so all three read as one affordance.
   */
  searchIcon: {
    alignItems: "center",
    color: vars["--aui-color-text-subtle"],
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    paddingInlineStart: vars["--aui-space-12"],
  },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 0,
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-normal"],
    minBlockSize: vars["--aui-control-height-lg"],
    minInlineSize: 0,
    paddingBlock: 0,
    paddingInline: vars["--aui-space-12"],
    // `colorTextSubtle` used to be a 3:1 metadata role; painting placeholder
    // text with it shipped this field at 3.39–4.19:1 against the input surface.
    // `colorTextPlaceholder` remains the dedicated field-copy token so the two
    // roles can evolve independently while both clear 4.5:1.
    "::placeholder": {
      color: vars["--aui-color-text-placeholder"],
    },
    outlineStyle: "none",
  },
  // The glyph track already supplies the leading gutter; keeping the input's
  // own `space3` start padding would double it to 24px.
  inputWithSearchIcon: {
    paddingInlineStart: vars["--aui-space-8"],
  },
  /*
   * `xs`: the inner input must stay SHORTER than the group's content box, the
   * same corollary `InputGroupAction` and `SearchField`'s clear mark follow.
   * `inputCompact`/`inputRegular` get that for free by stepping one rung down
   * the control scale (28 inside 32, 32 inside 36), but `xs` has no rung below
   * `controlHeightXs`, so it steps by `space1` instead: 24 inside a 28px group
   * whose content box is 26.
   *
   * Reading it as "no rung below xs, so reuse the group's own 28" is what the
   * new `filter-row-xs` guard row caught — a 28px input plus the group's two
   * hairlines rendered the group at 30px, off the 28/32/36/40 scale, in both
   * `Combobox` and `Autocomplete`.
   */
  inputDense: {
    fontSize: vars["--aui-font-size-caption"],
    minBlockSize: `calc(${vars["--aui-control-height-xs"]} - ${vars["--aui-space-4"]})`,
  },
  inputCompact: {
    minBlockSize: vars["--aui-control-height-xs"],
  },
  inputRegular: {
    minBlockSize: vars["--aui-control-height-sm"],
  },
  // Multi-select: chips + input share one wrapping row inside the input group.
  chips: {
    // Geometry that the token itself owns now lives in `recipes/value-token`;
    // what stays here is only the field-side inset that positions the track
    // inside Combobox's own bordered group.
    paddingBlock: vars["--aui-space-4"],
    paddingInlineStart: vars["--aui-space-4"],
  },
  // Inside a chips row the input flexes into the remaining space instead of
  // claiming the full row (which would wrap it under the chips). The basis is
  // the least room a query needs to start — a few characters — not a
  // comfortable width: at 96 two chips in a 360px field pushed an empty input
  // onto a second row, so the field grew 36px taller to hold nothing. The
  // input still grows into whatever the row has left.
  inputInChips: {
    flexBasis: 48,
    flexGrow: 1,
    flexShrink: 1,
    inlineSize: "auto",
    minBlockSize: vars["--aui-control-height-xs"],
    paddingInline: vars["--aui-space-4"],
  },
  actions: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    paddingInlineEnd: vars["--aui-space-4"],
  },
  // The mirror of `actions`, on the same 4px inset so a leading addon and a
  // trailing one sit the same distance from their respective borders.
  leadingActions: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    paddingInlineStart: vars["--aui-space-4"],
  },
  /*
   * In-group chrome must stay shorter than the group's content box — a 32px
   * button inside a compact (32px) bordered group inflates it to 34px. It also
   * has to stay VISIBLY shorter: at 32-in-36 the square cleared the border by
   * 1.00px, which is invisible while the button is transparent and a rectangle
   * wedged against the border the moment it paints on hover. Same rule as
   * `InputGroupAction` and `SearchField`'s clear — group content box −
   * 2 × `space1`, so 28 in a 36px group and 24 in a compact 32px one.
   */
  iconButton: {
    inlineSize: vars["--aui-control-height-xs"],
    minBlockSize: vars["--aui-control-height-xs"],
  },
  iconButtonCompact: {
    inlineSize: `calc(${vars["--aui-control-height-xs"]} - ${vars["--aui-space-4"]})`,
    minBlockSize: `calc(${vars["--aui-control-height-xs"]} - ${vars["--aui-space-4"]})`,
  },
  // `dense`/`xs`: one more step down than `iconButtonCompact`, matching the
  // 28/24/20 progression `InputGroup.tsx`'s `actionRegular`/`actionCompact`/
  // `actionDense` already establishes for in-group chrome.
  iconButtonDense: {
    inlineSize: `calc(${vars["--aui-control-height-xs"]} - ${vars["--aui-space-8"]})`,
    minBlockSize: `calc(${vars["--aui-control-height-xs"]} - ${vars["--aui-space-8"]})`,
  },
  /**
   * `Combobox.Loading` centres a 16px `Loader` inside the `Clear` button's box
   * (`iconButton` + the per-size arm), so a request settling swaps a glyph
   * rather than reflowing the actions track.
   */
  loading: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  triggerFullWidth: {
    flexShrink: 1,
    inlineSize: "100%",
    justifyContent: "start",
    minInlineSize: 0,
  },
  popup: {
    /*
     * A column, so a search row, status line or paging strip shares the height
     * cap with the list. The list caps itself at the popup's height
     * (`maxBlockSize: inherit`), so under an in-popup search row it was that
     * row too tall and `overflow: hidden` cut its last 31px off — a
     * parent-issue picker hand-wrote a grid on its popup to get around it.
     */
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-overlay"],
    color: vars["--aui-color-text"],
    maxBlockSize: "min(320px, var(--available-height))",
    minInlineSize: "min(220px, var(--available-width, 100vw))",
    overflow: "hidden",
    // Padding lives on the list (inside the scroll area) so the last row isn't
    // clipped; the popup only clips for the rounded corners.
    padding: 0,
    transformOrigin: "var(--transform-origin)",
  },
  item: {
    alignItems: "center",
    // Pointer hover gets a background too (Base UI only sets data-highlighted on
    // keyboard nav). itemHighlighted reuses the same color, so the two agree.
    backgroundColor: {
      default: "transparent",
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--aui-color-overlay-hover"],
      },
    },
    borderRadius: vars["--aui-radius-control"],
    boxSizing: "border-box",
    color: vars["--aui-color-text"],
    cursor: "default",
    display: "grid",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    gridTemplateColumns: `minmax(0, 1fr) ${vars["--aui-control-icon-size-lg"]}`,
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-control"],
    minBlockSize: vars["--aui-menu-item-height"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  itemSelected: {
    /*
     * No fill. A chosen row is marked by its ink and the indicator at the
     * inline-end, both of which stay put while the pointer moves; the fill in a
     * popup belongs to the pointer alone. It carried the hover value for a
     * while, which meant the chosen row and a pointed-at row were the same
     * colour and the list read as having two active rows.
     */
    color: vars["--aui-color-accent"],
  },
  /*
   * An option's leading glyph rides INSIDE the label's 1fr track rather than
   * claiming a third grid column. A column would have to be declared on `item`
   * and would shift `itemIndicator`'s pinned `1 / 2` area, re-laying out every
   * existing Combobox option in the repo. Nesting keeps icon-less options
   * byte-identical.
   */
  itemLabelRow: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  itemIcon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  // Copy and a trailing mark inside the row's first grid track. Only mounted
  // when an option carries `trailing`, so a plain row keeps `itemCopy` as the
  // direct grid child and its vertical centring untouched.
  itemMain: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  itemTrailing: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    marginInlineStart: "auto",
  },
  itemIndicator: {
    alignItems: "center",
    color: vars["--aui-color-accent"],
    display: "inline-flex",
    // Pinned to the trailing track like Select: this is the item's FIRST child,
    // so auto-placement would take 1fr and squeeze the label into the 18px one.
    gridArea: "1 / 2",
    inlineSize: vars["--aui-control-icon-size-lg"],
    justifyContent: "center",
    minBlockSize: vars["--aui-control-icon-size-lg"],
  },
  itemIndicatorHidden: {
    opacity: 0,
  },
});

// Keyed by the `ControlScale` vocabulary — the one scale axis a control has.
// `Combobox.parts.tsx` threads a single resolved `size` through all three.
export const inputStylesBySize = {
  md: styles.inputRegular,
  sm: styles.inputCompact,
  xs: styles.inputDense,
} as const;

export const itemStylesBySize = {
  md: listbox.itemRegular,
  sm: listbox.itemCompact,
  xs: listbox.itemDense,
} as const;

export const iconButtonStylesBySize = {
  md: null,
  sm: styles.iconButtonCompact,
  xs: styles.iconButtonDense,
} as const;

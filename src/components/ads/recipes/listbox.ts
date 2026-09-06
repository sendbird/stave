import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Shared listbox styles for anchored option lists (Select, Autocomplete,
 * Combobox) and, where byte-identical, the Command palette. Apply via
 * `sx(listbox.<key>, ...local overrides)`.
 *
 * Component-specific pieces (the `popup` shell, the `item` grid/transition) stay
 * local because they differ between components; only fragments that were
 * byte-identical across consumers are shared here.
 *
 * **Padding rule (shared with `recipes/menu.ts`):** a row-hosting popup pads
 * with `space4`, and that gutter lives on `list` — inside the scroll area —
 * not on the popup, so a height-clamped list never clips its last row. The
 * popup itself sets `padding: 0` and only clips for its rounded corners.
 */
export const listbox = stylex.create({
  positioner: {
    zIndex: vars.zIndexDropdown,
  },
  /**
   * Shared popup width clamp for anchored listboxes (Autocomplete, Combobox):
   * clamps to the anchor width with a 220px floor and 420px ceiling, never
   * exceeding the available viewport width. Apply alongside the local `popup`
   * style. Kept as a stylex key (not a plain const) because StyleX requires
   * literal values inside `stylex.create`.
   */
  popupWidth: {
    inlineSize:
      "min(max(var(--anchor-width, 220px), 220px), 420px, var(--available-width, 100vw))",
  },
  list: {
    // Flex column (not grid): a height-capped grid list distributes its implicit
    // rows to equal heights and clips taller items, overlapping the next row.
    // Consumers' `item` styles set `flexShrink: 0` so items keep their content
    // height and the list scrolls instead. Padding lives HERE (not on the popup)
    // so it sits inside the scroll area — otherwise popup padding + a list capped
    // to the popup height clips the last row's bottom.
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    inlineSize: "100%",
    maxBlockSize: "inherit",
    minInlineSize: 0,
    overflowX: "hidden",
    overflowY: "auto",
    padding: vars.space4,
  },
  empty: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
    // Base UI keeps the empty/announcement live-region mounted even when there
    // ARE matches (for a11y). Collapse its padding when it has no content so it
    // doesn't reserve space above the list.
    paddingBlock: { default: vars.space12, ":empty": 0 },
    paddingInline: { default: vars.space12, ":empty": 0 },
  },
  itemCompact: {
    minBlockSize: vars.controlHeightXs,
    paddingBlock: vars.space4,
  },
  // The `xs`/`dense` tier: same 28px row `itemCompact` already renders, plus
  // the smaller type Select's own `itemDense` (recipes/select-styles.ts)
  // pairs with it — dense is a font-size step down from compact, not just a
  // height one.
  itemDense: {
    fontSize: vars.fontSizeCaption,
    minBlockSize: vars.controlHeightXs,
    paddingBlock: vars.space4,
  },
  itemRegular: {
    minBlockSize: vars.menuItemHeight,
    paddingBlock: vars.space4,
  },
  itemHighlighted: {
    // The pointer/keyboard highlight is a hover, so it takes the hover wash the
    // rest of the system uses. It painted `colorCanvasSubtle` — an opaque
    // Neutral100 — so a menu row lit up a different colour than a button, a
    // tree row or a sidebar item under the same pointer.
    backgroundColor: vars.colorOverlayHover,
  },
  itemDisabled: {
    color: vars.colorTextSubtle,
    cursor: "not-allowed",
  },
  itemCopy: {
    // Stretch through the row's padded content box, then centre the actual
    // one- or two-line copy inside it. Relying on a grid child's intrinsic
    // line box made single-line Autocomplete labels ride 2–3px high whenever
    // the row minimum was taller than the text — a recurring popup defect that
    // padding tweaks in each picker could only move around.
    alignContent: "center",
    alignSelf: "stretch",
    display: "grid",
    gap: vars.space4,
    inlineSize: "100%",
    lineHeight: vars.lineHeightControl,
    maxInlineSize: "100%",
    minInlineSize: 0,
    whiteSpace: "normal",
  },
  itemLabel: {
    // Match Select/Menu's integer line box so one-line Combobox and
    // Autocomplete options do not land on fractional pixels.
    lineHeight: vars.lineHeightControl,
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  itemDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    maxInlineSize: "100%",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
  },
  groupLabel: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    paddingBlock: vars.space4,
    paddingInline: vars.space8,
  },
  error: {
    // The border's red — one error, one colour. See `Field.tsx`.
    color: vars.colorDanger,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    overflowWrap: "anywhere",
  },
});

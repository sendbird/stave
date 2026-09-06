/**
 * Where an anchored surface opens, in one vocabulary.
 *
 * ADS used to say this with Base UI's two independent props, `side` and
 * `align`. `align` is optional there, so twelve surfaces never wrote it down
 * and silently inherited Base UI's `center` — a value no call site in this
 * repository has ever asked for. Eleven asked for `start` and three for `end`.
 * A single `placement` string cannot be half-specified, which is why the fix is
 * a vocabulary change and not just a different default.
 *
 * `"bottom"` with no suffix means bottom-center, matching the Floating UI
 * convention the rest of the industry reads.
 */
/**
 * Every placement, in the order a picker should offer them — reading edge
 * first, clockwise from the top.
 *
 * The array is the declaration and the type is derived from it, rather than the
 * other way round, so a consumer that has to *enumerate* placements (the docs
 * Properties panel builds its `placement` control from this) reads the same
 * twelve strings the type checks against. Retyping them is the drift class
 * `bun run check:controls` exists to catch.
 */
export const POPUP_PLACEMENTS = [
  "top-start",
  "top",
  "top-end",
  "right-start",
  "right",
  "right-end",
  "bottom-start",
  "bottom",
  "bottom-end",
  "left-start",
  "left",
  "left-end",
] as const;

export type PopupPlacement = (typeof POPUP_PLACEMENTS)[number];

export type PopupSide = "bottom" | "left" | "right" | "top";
export type PopupAlign = "center" | "end" | "start";

/**
 * The default for every menu, listbox, and anchored panel.
 *
 * These surfaces are lists of left-aligned text, so their reading edge should
 * start where the trigger's does. `center` leaves the first character floating
 * at an offset that depends on the widest row — the popup moves under the
 * pointer as its own content changes.
 *
 * Callout surfaces (`Tooltip`, `PreviewCard`) are deliberately NOT on this
 * default: a tooltip is a label *for* the trigger rather than a menu *from* it,
 * so it stays centred on what it describes.
 */
export const POPUP_PLACEMENT_DEFAULT: PopupPlacement = "bottom-start";

/**
 * The gap between a trigger and the surface it opens, in px.
 *
 * One number for the whole family. It used to be 4, 6, or 8 depending on the
 * component — `Menu` 8, `Select`/`Combobox` 6, `Menubar`/`PropertyList` 4 — for
 * the same visual relationship, so consumers re-picked from the same three
 * values instead of inheriting one.
 */
export const POPUP_SIDE_OFFSET = 6;

/**
 * Split a `placement` into the `side`/`align` pair Base UI positions with.
 * A bare side (`"bottom"`) is centre-aligned.
 */
export function resolvePlacement(
  placement: PopupPlacement = POPUP_PLACEMENT_DEFAULT,
): {
  align: PopupAlign;
  side: PopupSide;
} {
  const separator = placement.lastIndexOf("-");
  if (separator === -1) {
    return { align: "center", side: placement as PopupSide };
  }
  return {
    align: placement.slice(separator + 1) as PopupAlign,
    side: placement.slice(0, separator) as PopupSide,
  };
}

/**
 * The `align` half only, for a part whose `side` must stay with Base UI.
 *
 * `Menu.Positioner` backs root menus, submenus, menubar menus, and context
 * menus from one component, and Base UI picks the side per parent —
 * `inline-end` for a submenu, `bottom` for a root menu. Writing a literal
 * `side` there would open every submenu downwards. So an un-placed menu takes
 * the shared `start` alignment and leaves the side alone; passing `placement`
 * explicitly opts into both halves.
 */
export function resolveAlign(placement: PopupPlacement | undefined): {
  align: PopupAlign;
  side?: PopupSide;
} {
  if (placement === undefined) {
    return { align: resolvePlacement(POPUP_PLACEMENT_DEFAULT).align };
  }
  return resolvePlacement(placement);
}

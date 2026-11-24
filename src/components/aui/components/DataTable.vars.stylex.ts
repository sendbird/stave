import * as stylex from "@stylexjs/stylex";

/**
 * Row-state overlay inherited by sticky cells over their opaque surface.
 *
 * Declared through `stylex.types.color` rather than as a bare string so StyleX
 * emits `@property { syntax: "<color>"; inherits: true }` for it. That
 * registration is what makes the value INTERPOLABLE: an unregistered custom
 * property is a discrete step, and this one carries the hover/selected wash for
 * every pinned cell while the unpinned cells get theirs from the row's own
 * animated `background-color`. Untyped, the two halves of one row changed at
 * different times — the pinned columns snapped while the middle eased — so a
 * hovered row visibly arrived in two pieces.
 *
 * The transition itself lives on `pinnedCell` (see `DataTable.styles.ts`), not
 * here and not on the row: the row must not animate this property, or the cells
 * would chase an already-interpolating inherited value.
 *
 * `@property` needs Safari 16.4+. Below it the registration is dropped and the
 * value steps again, which is the behaviour this replaces — never worse.
 */
export const dataTableVars = stylex.defineVars({
  pinnedCellOverlay: stylex.types.color("transparent"),
});

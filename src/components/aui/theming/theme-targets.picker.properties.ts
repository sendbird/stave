import {
  themeFocusProperties,
  themeSpaceProperties,
  themeSurfaceProperties,
  themeTypographyProperties,
} from "./theme-contract";

/*
 * The picker family's property allowances, in their own module because the
 * family is split across two registry files and both halves need the same
 * vocabulary. Declaring them twice is how the two would drift: a brand would
 * end up with `outline*` on a combobox's clear mark and not on an emoji cell,
 * for no reason anyone wrote down.
 */


/** Paint + text, the allowance a target that owns a surface gets. */
const surface = [
  ...themeSurfaceProperties,
  ...themeTypographyProperties,
] as const;

/**
 * A field-shaped control: its surface, its text, and its own internal air.
 *
 * Deliberately WITHOUT `themeFocusProperties`. Every control in this family
 * composes `focusRing.borderOnly`, which suppresses the outline and carries
 * focus in the border colour instead — the text-entry family's contract, stated
 * in the header of `TextField.tsx`. Handing a brand the four `outline*`
 * properties here would let it paint a second focus indicator over a border
 * that has already recoloured, which is the exact defect `borderOnly` exists to
 * prevent. `borderColor` is in `surface`, so the indicator a brand can move is
 * the one the control actually uses.
 */
const field = [...surface, ...themeSpaceProperties] as const;

/**
 * A pressable part that owns its box AND its focus ring.
 *
 * Distinct from `field`: the pressable pickers below — a calendar day, a month
 * nav button, an emoji cell, a canned-response row — draw a transparent box
 * that only paints on hover/press and carry `focusRing.ring`, not the field
 * family's `borderOnly`. They have no resting border to recolour, so the
 * outline IS their focus indicator and the four `outline*` properties belong
 * here.
 */
const control = [
  ...surface,
  ...themeSpaceProperties,
  ...themeFocusProperties,
] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * An in-field icon mark — a clear, a chevron, a chip's remove.
 *
 * These are the parts that keep `focusRing.ring`: they have no border of their
 * own, so the outline IS their focus indicator and a brand has to be able to
 * recolour it.
 */
const mark = [...surface, ...themeFocusProperties] as const;

/** A row-hosting scroll area: it pays for the popup's inner gutter. */
const rows = [...themeSpaceProperties] as const;

export { control, field, ink, mark, rows, surface };

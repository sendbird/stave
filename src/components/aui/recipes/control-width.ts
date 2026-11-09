import * as stylex from "@stylexjs/stylex";

/**
 * Width roles for controls.
 *
 * CSS Grid and stretched flex columns turn an `inline-flex` control into a
 * full-width item unless the control declares its own inline size. That is a
 * layout side effect, not a product decision: a two-state toggle, action
 * button, segmented control, or menu trigger should normally hug its content.
 * A field-shaped control deliberately owns its column instead.
 *
 * Keep this binary. `intrinsic` and `field` describe product roles; ad-hoc
 * small/medium/wide values would merely duplicate container layout.
 */
export const controlWidth = stylex.create({
  intrinsic: {
    inlineSize: "fit-content",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  field: {
    inlineSize: "100%",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
});

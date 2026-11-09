import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Selection mark — the tri-state checkbox box drawn *inside* a row that is
 * itself the control: a `Tree` treeitem, a `TreeSelect` picker row. The row
 * owns the tab stop, the focus ring, and the `aria-checked` state, so this is
 * chrome rather than an input. It therefore carries no focus ring and is never
 * a second tab stop.
 *
 * Geometry and color are `Checkbox size="sm"`, deliberately: a 16px box, a
 * 12px glyph, `radiusMark`, a `colorBorderStrong` rim, a `colorAccent` fill,
 * and `colorAccentText` ink. A row mark that is a different size from the
 * checkbox in the form beside it reads as two systems — `TreeSelect` shipped
 * an 18px local copy (`controlIconSizeLg`) against `Checkbox sm`'s 16px, and
 * this recipe is what closed that gap.
 *
 * Unlike `Checkbox`, the box does not carry its own hover/press wash: the row
 * behind it already moves under the pointer, and two overlapping washes read
 * as a rendering artifact.
 *
 * Every box carries `data-aui-check-slot`, the same way the icon slots carry
 * `data-aui-control-icon-slot`: it is `aria-hidden` chrome, so a test or a
 * consumer stylesheet has no role or label to address it by.
 */

/** Glyph size for the tick and the mixed dash, matching `Checkbox size="sm"`. */
export const selectionMarkGlyphSize = 12;

export const selectionMark = stylex.create({
  box: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: vars["--aui-color-border-strong"],
    borderRadius: vars["--aui-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-accent-text"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--aui-control-mark-size-sm"],
    justifyContent: "center",
    minBlockSize: vars["--aui-control-mark-size-sm"],
  },
  /** Checked *and* mixed: both states are a filled box, differing by glyph. */
  boxChecked: {
    backgroundColor: vars["--aui-color-accent"],
    borderColor: vars["--aui-color-accent"],
  },
  /**
   * Same footprint, nothing painted — for a row that opted out of checking
   * inside a tree that has boxes. It keeps the boxes below it in one column,
   * which is what a reader scans.
   */
  gutter: {
    blockSize: vars["--aui-control-mark-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-mark-size-sm"],
  },
});

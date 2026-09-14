import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The removable **value token**: one committed value of a multi-value field,
 * rendered inside that field's bordered box with a button that takes it back
 * out. `Combobox multiple` calls it a chip; `TagField` calls it a tag; they are
 * the same object and this file is its only declaration.
 *
 * ## Why this is not `recipes/status-chip`
 *
 * `Badge` (and therefore `statusChip`) is a *status* object: it reports a fact
 * about a row from outside the row — a severity, a state, a count. A value
 * token is the opposite direction. It **is** the control's value, the way the
 * text in a `TextField` is, and the user put it there. That difference is what
 * sets the three properties the two objects do not share:
 *
 * | | `statusChip` (status) | `valueToken` (value) |
 * | --- | --- | --- |
 * | radius | `radiusFull` — a pill, read as an annotation | `radiusControl` — squared with the field it sits in |
 * | ink | `colorTextMuted` (neutral) — metadata | `colorText` — the field's value, at value strength |
 * | border | transparent on `soft` | hairline — it must separate from the field fill behind it |
 *
 * That last row is measured, not asserted. The token's `colorSurfaceTint` fill
 * over the field's `colorSurfaceRaised` is **1.090:1** in light and 1.074:1 in
 * dark — far under any perceptible separation on its own, so the hairline is
 * the only thing that makes a token a discrete object rather than a smudge.
 * `Badge soft` on an arbitrary canvas has no such neighbour and needs no rim.
 *
 * ## Why it is shared
 *
 * Before this file the geometry below was written out twice — once in
 * `Combobox.styles.ts`, once (in `statusChip`'s vocabulary) in `Badge` — and
 * agreed on every number by coincidence rather than by contract: 24px box,
 * caption/medium type, `space8` lead, `space4` tail, `space4` gap, 16px remove
 * square. `TagField` would have been the third hand-written copy. Two copies
 * that agree are a coincidence; three are a drift waiting for its first
 * divergent edit.
 */
export const valueToken = stylex.create({
  /**
   * The token box. `minInlineSize: 0` + the `label` block below are what let a
   * long value elide instead of pushing the field's box wider than its column:
   * `text-overflow` only applies to a block container, and this root is a flex
   * container (it has to be — label plus remove button), so its bare text would
   * otherwise sit in an anonymous flex item that never inherits the property.
   * Same failure `Badge` was fixed for; `Combobox.Chip` never was, which is why
   * a long selected option currently overflows its field.
   */
  root: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    display: "inline-flex",
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-tight"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingInlineEnd: vars["--ads-space-4"],
    paddingInlineStart: vars["--ads-space-8"],
    // The value is not selectable text — it is a discrete object with its own
    // remove control, and a drag across the field should not paint half of it.
    userSelect: "none",
  },
  /**
   * 24px inside a 36px (`md`) field: `space24` leaves the group's two hairlines
   * plus `space4` of breathing room above and below, which is the exact fit the
   * original `Combobox` chip was tuned to and this rung preserves.
   */
  md: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-space-24"],
  },
  /** 20px, for the 28/32px (`xs`/`sm`) field rungs where 24px leaves no air. */
  sm: {
    fontSize: vars["--ads-font-size-micro"],
    minBlockSize: vars["--ads-space-20"],
  },
  /** The truncating block child — see `root`. */
  label: {
    display: "block",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * The wrapping track the tokens and the field's own input share. It is a
   * `flex-wrap` row rather than a single line because a multi-value field grows
   * downward: clipping the fifth token, or scrolling it out of view, hides
   * committed state the user is responsible for.
   */
  track: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  /**
   * The remove button's painted box. 16px square, fully round (at 16px
   * `radiusControl`'s 8px *is* a circle, which is why the two prior copies of
   * this box looked identical while spelling their radius differently).
   *
   * State is an **overlay**, never an opacity fade. `Badge` faded its glyph to
   * `opacity: 0.7`, and on the default `neutral` tone that measured **2.93:1**
   * against the badge fill in light — under the WCAG 1.4.11 3.0:1 floor for a
   * non-text control, on the most common removable object in the system. Full
   * opacity restores it to 5.38:1 without moving a pixel of geometry. The
   * `@media (hover: hover)` guard is the same one `surfaceChrome`'s quiet icon
   * button carries, so a touch tap does not leave the token stuck in hover.
   *
   * `color` is deliberately absent: the owner sets it. `Badge` inherits the
   * tone's ink so a danger badge's × is red; `Combobox.Chip` keeps the muted →
   * full ramp so the × does not out-shout the value it removes.
   */
  remove: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":active": vars["--ads-color-overlay-pressed"],
        ":hover": vars["--ads-color-overlay-hover"],
      },
    },
    blockSize: 16,
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "none",
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: 16,
    justifyContent: "center",
    padding: 0,
  },
});

export type ValueTokenSize = "sm" | "md";

/** size → box rung. One lookup, so a new rung cannot skip a call site. */
export const valueTokenSizeStyles = {
  md: valueToken.md,
  sm: valueToken.sm,
} as const;

/**
 * The remove glyph's pixel size per rung. Literal `size={12}` props were the
 * drift vector the `statusChipIconSizes` lookup was introduced to close; the
 * same rule applies here.
 */
export const valueTokenRemoveIconSizes: Record<ValueTokenSize, number> = {
  md: 12,
  sm: 10,
};

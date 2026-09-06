import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * How far the ring paints OUTSIDE the border box, derived rather than named as
 * its own token: it is `outline-offset` + `outline-width` by construction, so
 * widening the ring cannot leave a stale 4px behind in the gutters that exist
 * to protect it. Kept in `calc()` (not resolved here) because both operands are
 * theme variables.
 */
const bleed = `calc(${vars.focusRingOffset} + ${vars.focusRingWidth})`;

/**
 * Shared `:focus-visible` outline ring.
 *
 * Apply via `sx(styles.someStyle, focusRing.ring)` on the focusable element.
 * Replaces the four `outline*` props that were copy-pasted across components.
 *
 * The ring is a two-part contract, and only one part lives on the control:
 *
 * 1. the CONTROL wears `ring` (or `ringInset`), and
 * 2. every CLIPPING ANCESTOR owes it `bleed` of room — `gutter` below.
 *
 * An `outline` is ink overflow, never scrollable overflow, so a container that
 * clips erases the ring outright instead of scrolling to reveal it. That is
 * invisible to whoever wrote the control: the same `ring` that reads perfectly
 * on a padded page is simply gone inside a sidebar rail, a Dialog body, a
 * rounded Accordion item or a height-animated disclosure panel. Nothing warns
 * you, and a keyboard user is left with no focus indicator at all — which is
 * why part 2 is a named recipe rather than each author's eye.
 *
 * Forced colors (Windows High Contrast Mode):
 * In forced-colors mode the OS overrides author colors, and our token-based
 * `colorBorderFocus` is replaced by the system palette. To keep the keyboard
 * focus ring reliably visible we map the focus-visible `outlineColor` to the
 * `Highlight` system color. Normal-mode behavior is identical because the
 * `@media (forced-colors: active)` value only applies when forced colors are on.
 * Note: StyleX resolves the most specific matching condition, so the
 * forced-colors value is keyed under `:focus-visible` to preserve the
 * transparent default for the unfocused state.
 */
export const focusRing = stylex.create({
  ring: {
    outlineColor: {
      default: "transparent",
      ":focus-visible": vars.colorBorderFocus,
      // Forced-colors: use the system Highlight color so the ring stays visible
      // even though the OS discards our author/token colors.
      "@media (forced-colors: active)": {
        default: "transparent",
        ":focus-visible": "Highlight",
      },
    },
    outlineOffset: {
      default: 0,
      ":focus-visible": vars.focusRingOffset,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: 0,
      ":focus-visible": vars.focusRingWidth,
    },
  },
  /**
   * **Border-carried focus** for a control that already recolors its own
   * border on `:focus-within` — the text-entry family and the bordered overlay
   * triggers. Compose it INSTEAD OF `ring`: the border change is the whole
   * indicator, so no outline is painted over it.
   *
   * _Why:_ by the `:focus-visible` heuristic a text input matches on a mouse
   * click as well as on Tab, so `ring` on a field fired a 2px outset outline
   * every time someone clicked into it — on top of a border that had already
   * recolored. Two indicators for one state, and the pair reads as a validation
   * highlight rather than a caret landing. A `<select>` and a button-shaped
   * overlay trigger do NOT match on click, so the same composition also made
   * click feedback disagree across one family.
   *
   * Two things this still has to do, and neither is optional:
   *
   * 1. **Suppress the UA ring explicitly.** An element with no `outline`
   *    declaration is not ring-less — it inherits the browser's own focus ring.
   *    `outlineStyle: none` is what makes "no ring" true rather than merely
   *    unwritten.
   * 2. **Restore a real ring under forced colors.** Windows High Contrast Mode
   *    replaces author colors with the system palette, which takes
   *    `colorBorderFocus` with it and leaves the border change invisible. The
   *    outline comes back there — and only there — keyed to `Highlight`.
   *
   * Do NOT compose this on a control with no border of its own (a quiet/ghost
   * trigger, an icon button, a chip, a table row, a menu item, a rating tile):
   * suppressing the outline there leaves a keyboard user with no indicator at
   * all. Those keep `ring`.
   */
  borderOnly: {
    outlineColor: {
      default: "transparent",
      "@media (forced-colors: active)": {
        default: "transparent",
        ":focus-within": "Highlight",
      },
    },
    outlineOffset: {
      default: 0,
      "@media (forced-colors: active)": {
        default: 0,
        ":focus-within": vars.focusRingOffset,
      },
    },
    outlineStyle: {
      default: "none",
      "@media (forced-colors: active)": {
        default: "none",
        ":focus-within": "solid",
      },
    },
    outlineWidth: {
      default: 0,
      "@media (forced-colors: active)": {
        default: 0,
        ":focus-within": vars.focusRingWidth,
      },
    },
  },
  /**
   * Inset variant: compose after `ring` when the clip CANNOT be widened —
   * a rounded surface whose `overflow: hidden` exists to clip a child's own
   * background to the corner radius (Accordion item, Collapsible root), or a
   * full-bleed row in a Tree/list. Reach for `gutter*` on the container first:
   * an outset ring reads as a ring around the control, an inset one reads as a
   * second border inside it.
   */
  ringInset: {
    outlineOffset: {
      default: 0,
      ":focus-visible": `calc(-1 * ${vars.focusRingOffset})`,
    },
  },
  /**
   * Focus-ring gutter for a CONTAINER that clips (any `overflow` other than
   * `visible` — including the `hidden` that only rounds corners or animates a
   * height, and including the axis you did not think was scrolling: per CSS,
   * `visible` computes to `auto` as soon as the other axis is not `visible`).
   *
   * `padding` reserves the ring's `bleed`; the matching negative
   * `margin` gives it back to the layout, so the clip box grows and NOTHING
   * moves — no re-tuned parent padding, no shifted gap, no re-flowed row. Apply
   * on the element that owns the `overflow`, not on its parent: padding on the
   * non-scrolling shell is exactly the arrangement that clipped the ring in the
   * sidebar rail, the Dialog body and the Popover body (the shell was padded,
   * the scroller was not).
   *
   * Composes with an existing padding: these are longhands, and StyleX resolves
   * a longhand over the `padding`/`margin` shorthand regardless of composition
   * order — so a container that already pads more than the bleed must ADD the
   * bleed to its own longhand rather than composing this style over it.
   *
   * `scrollPadding` is the other half: without it the browser scrolls a focused
   * row flush to the scrollport edge and re-clips the ring it just made room
   * for.
   */
  gutter: {
    marginBlock: `calc(-1 * (${bleed}))`,
    marginInline: `calc(-1 * (${bleed}))`,
    paddingBlock: bleed,
    paddingInline: bleed,
    scrollPaddingBlock: bleed,
    scrollPaddingInline: bleed,
  },
  /*
   * Deliberately no axis-scoped variants. Every clipper in ADS clips BOTH axes
   * — `overflow-x: auto` alone does not exist, because `visible` computes to
   * `auto` on the other axis — so a one-axis gutter would leave the ring dying
   * on the edge its author did not think about. Add one when a real case needs
   * it, with the measurement that shows the other axis is safe.
   */
  /**
   * Group variant for a composite control whose focus lands on a DESCENDANT —
   * a tile wrapping a radio, a label wrapping an input. It mirrors `ring`
   * (including forced-colors) so composed controls do not hand-roll a weaker
   * keyboard ring.
   *
   * Keyed on `:has(:focus-visible)`, NOT `:focus-within`. That difference is
   * the whole point of the variant. `:focus-within` matches whenever the
   * descendant holds focus, however it got there, so a mouse click on a tile
   * wrapping a radio painted the full 2px keyboard ring — the same defect
   * `focusRing.ring` had on fields before `borderOnly`, one level of nesting
   * down. `:has()` forwards the browser's own judgement instead: a radio does
   * not match `:focus-visible` on a click, so the ring stays hidden, while
   * `<input>`, `<textarea>` and `<select>` DO match on click, so a bordered
   * host wrapping a textarea keeps the ring it has always shown. One selector,
   * both behaviours.
   *
   * For a composite that is also BORDERED, prefer `borderOnly`: the border it
   * already owns is a better indicator than an outline around the group. This
   * variant is for the ones that rest on a transparent border and so have
   * nothing to recolor.
   */
  ringWithin: {
    outlineColor: {
      default: "transparent",
      ":has(:focus-visible)": vars.colorBorderFocus,
      "@media (forced-colors: active)": {
        default: "transparent",
        ":has(:focus-visible)": "Highlight",
      },
    },
    outlineOffset: {
      default: 0,
      ":has(:focus-visible)": vars.focusRingOffset,
    },
    outlineStyle: {
      default: "none",
      ":has(:focus-visible)": "solid",
    },
    outlineWidth: {
      default: 0,
      ":has(:focus-visible)": vars.focusRingWidth,
    },
  },
});

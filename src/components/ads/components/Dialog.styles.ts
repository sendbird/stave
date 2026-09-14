import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Dialog's own geometry, split out of `Dialog.tsx` verbatim.
 *
 * A move, not a rewrite: the declarations below are byte-identical to the ones
 * that lived at the bottom of `Dialog.tsx`, and they left because the stable
 * theme-target attributes pushed that file over the 500-line source limit. The
 * shared modal surface, density and motion still come from
 * `recipes/overlay-surface`; this file is only what is particular to Dialog.
 */
export const styles = stylex.create({
  popup: {
    // elevationModal — a Dialog is a detached global surface that owns the screen,
    // one tier above an anchored popup. It shipped on elevationOverlay, which made a
    // modal read at exactly the same depth as a dropdown (tokens.stylex.ts
    // elevation policy).
    display: "grid",
    // Header / body / actions, with only the middle track allowed to grow —
    // the popup itself used to be the scroll container (`overflowY: auto`
    // here), so a tall body (a form, or any body at 200% zoom) scrolled the
    // header — including the ONLY close button — off the top and the footer's
    // primary action off the bottom. Now the frame is pinned and the body
    // scrolls (see `styles.body`). The third track is `auto`, so it collapses
    // to zero when `footer` is omitted.
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    left: "50%",
    // Clamp against the live viewport, never a fixed ceiling: a tall dialog
    // scrolls inside its own surface instead of running off screen. The gutter
    // is a space step so the modal tier (Dialog/AlertDialog) cannot drift apart.
    maxBlockSize: `calc(100dvh - ${vars["--ads-space-48"]})`,
    overflow: "hidden",
    // Surface air comes from the shared density recipe so modal siblings stay
    // interchangeable without coupling this width contract to control size.
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: vars["--ads-z-index-modal"],
  },
  // 400px — the rung below the 460px confirm/form default, and the same
  // measure `PeekPanel` stands on, so the narrowest modal and the narrowest
  // docked surface read as one column width. Below this a two-button footer
  // starts wrapping, which is the floor a confirm dialog cannot cross.
  popupSm: {
    inlineSize: `min(400px, calc(100dvw - ${vars["--ads-space-32"]}))`,
  },
  popupMd: {
    inlineSize: `min(460px, calc(100dvw - ${vars["--ads-space-32"]}))`,
  },
  popupLg: {
    inlineSize: `min(520px, calc(100dvw - ${vars["--ads-space-32"]}))`,
  },
  popupXl: {
    inlineSize: `min(1040px, calc(100dvw - ${vars["--ads-space-32"]}))`,
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-16"],
    justifyContent: "space-between",
  },
  /**
   * The close control is 32px and the title's line box is 24px, so a header
   * aligned to `start` — which it must be, because the title group can carry a
   * description below — left the X sitting 4px lower than the title it belongs
   * to. Pulling it up by half the difference centres it on the title's line in
   * both shapes: with a description and without.
   *
   * Written as the two tokens rather than `-4px` so it follows either of them
   * if they move; the header's height is driven by the title group, so the
   * negative margin cannot shorten it.
   */
  closeButton: {
    marginBlockStart: `calc((${vars["--ads-line-height-lead"]} - ${vars["--ads-control-height-sm"]}) / 2)`,
  },
  titleGroup: {
    display: "grid",
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-lead"],
    margin: 0,
    // A heading is short enough for the browser to line-break optimally:
    // `balance` evens the lines instead of leaving a one-word second line.
    // Matches `Typography`'s `heading`.
    textWrap: "balance",
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    // Paired prose, not a heading: `pretty` only fixes the last line, so a
    // multi-paragraph description keeps its normal ragged edge.
    textWrap: "pretty",
  },
  // `focusRing.gutter` at the call site, not here: the popup pays `space20`, but
  // padding on the popup is padding on the thing that does NOT clip. The body
  // is the scroll container, so a form field or a button flush against its edge
  // — the first control in every scrolling dialog — had its ring erased.
  body: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    // The dialog's only scroll container (the popup is `overflow: hidden`), so
    // the header and the action row stay on screen. `minBlockSize: 0` lets the
    // `minmax(0, 1fr)` track actually shrink below its content size — without
    // it a grid item's automatic minimum is `min-content` and nothing scrolls.
    minBlockSize: 0,
    overflowY: "auto",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "end",
  },
});

export const popupWidthStyles = {
  lg: styles.popupLg,
  md: styles.popupMd,
  sm: styles.popupSm,
  xl: styles.popupXl,
} as const;

import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Overlay mark — the small object pinned to the corner of something else: a
 * presence dot on an avatar, an unread count on a rail item, an attention pip
 * on a toolbar button.
 *
 * ## Why this is a recipe and not three private copies
 *
 * Four surfaces drew this shape independently and agreed on nothing:
 *
 * | Surface                          | Knockout                          | Offset   | Size model      |
 * | -------------------------------- | --------------------------------- | -------- | --------------- |
 * | `Avatar.presence.tsx` dot        | `border` · `colorSurfaceRaised`   | `0 / 0`  | `28%`, 8–14 cap |
 * | `PresenceBadge.tsx` overlay      | `box-shadow` · `colorSurface`     | `0 / 0`  | fixed 8 / 10    |
 * | `TicketRow.tsx` unread           | `border` · `colorSurfaceRaised`   | `-1 /-1` | fixed 8         |
 * | `Button.styles.ts` indicatorSlot | none — the slot, with no mark     | `-4 /-4` | caller's        |
 *
 * The divergence survived review because **`colorSurface` and
 * `colorSurfaceRaised` are byte-identical in the light theme** (both
 * `oklch(1 0 0)`). They separate only in dark, where the ramp is
 * `colorSurface` L 0.1925 against `colorSurfaceRaised` L 0.2475 — so the two
 * spellings of "knock the mark out of its host" render as a ΔL 0.055 halo
 * mismatch that no light-theme screenshot could show.
 *
 * ## The knockout is the host's fact, not the mark's
 *
 * Neither token is correct on its own, because the ring exists to match
 * whatever is *behind* the anchor, and a mark cannot read that. The dark ramp
 * makes the cost explicit: `colorGround` 0.1375 · `colorCanvas` 0.165 ·
 * `colorSurface` 0.1925 · `colorSurfaceTint` 0.22 · `colorSurfaceRaised`
 * 0.2475 · `colorCanvasSubtle` 0.275. An `Avatar status` dot hardcoded to
 * `colorSurfaceRaised` and rendered on `colorCanvas` — a rail item, a page
 * background — is off by ΔL 0.0825, which is wider than any adjacent step in
 * the ramp.
 *
 * So the ring reads `--ads-overlay-mark-knockout` and defaults to
 * `colorSurface`: the surface a card, list row, table, menu, and popover all
 * present. A host that knows it differs corrects it in one declaration —
 * `TicketRow` does, because its row is `colorSurfaceRaised`. This is the same
 * host-owned-value convention as `--ads-clamp-lines`, `--ads-peek-width`, and
 * `--ads-selection-background`.
 *
 * `box-shadow` rather than `border` carries the ring, for two reasons: it is
 * outside the box model, so the mark's diameter is the diameter it is asked
 * for rather than diameter-minus-two-rings; and it composes with the hollow
 * `border` that `PresenceBadge`'s `offline` state needs to keep.
 */

/** The knockout custom property, so hosts and tests name it once. */
export const overlayMarkKnockoutProperty = "--ads-overlay-mark-knockout";

/**
 * Logical corners. Spelled block/inline rather than top/right so RTL mirrors
 * for free — the reason the three copies that predate this recipe all used
 * logical insets even while disagreeing about everything else.
 */
export type OverlayMarkPlacement =
  | "block-start-inline-end"
  | "block-start-inline-start"
  | "block-end-inline-end"
  | "block-end-inline-start";

export const overlayMark = stylex.create({
  /**
   * The positioning context. `inline-flex` (not `block`) so the anchor keeps
   * its own intrinsic size and baseline; `flex-shrink: 0` so a mark inside a
   * flex row cannot be compressed into its host.
   *
   * `overflow: visible` is stated rather than assumed: the anchor is often a
   * component that clips (an `Avatar` disc, a `Button` root), and the mark
   * overhangs on purpose.
   */
  anchor: {
    display: "inline-flex",
    flexShrink: 0,
    overflow: "visible",
    position: "relative",
    verticalAlign: "middle",
  },
  /**
   * The mark itself. Absolute against `anchor`; `pointer-events: none` so a
   * count can never eat the click that belongs to the button or row beneath
   * it — the mark reports state, it is not a control.
   */
  mark: {
    boxShadow: `0 0 0 ${vars["--ads-ring-width-sm"]} var(${overlayMarkKnockoutProperty}, ${vars["--ads-color-surface"]})`,
    pointerEvents: "none",
    position: "absolute",
  },
  /**
   * Ring-only, for a mark already in an anchor slot the host positions
   * (`Button indicator`, `SidebarMenuBadge`). Same knockout, no inset claim.
   */
  markInSlot: {
    boxShadow: `0 0 0 ${vars["--ads-ring-width-sm"]} var(${overlayMarkKnockoutProperty}, ${vars["--ads-color-surface"]})`,
  },
  /**
   * Corner insets. `0` rather than a negative overhang: on a round anchor the
   * corner of the bounding box is already outside the disc, so a mark seated
   * at inset 0 overhangs the visible edge by exactly the right amount. This is
   * what `Avatar.presence` and `PresenceBadge` both chose; `TicketRow`'s
   * `-1/-1` was the outlier and is not preserved.
   */
  "block-start-inline-end": {
    insetBlockStart: 0,
    insetInlineEnd: 0,
  },
  "block-start-inline-start": {
    insetBlockStart: 0,
    insetInlineStart: 0,
  },
  "block-end-inline-end": {
    insetBlockEnd: 0,
    insetInlineEnd: 0,
  },
  "block-end-inline-start": {
    insetBlockEnd: 0,
    insetInlineStart: 0,
  },
  /**
   * A count is wider than it is tall and must clear the anchor's edge, so it
   * translates half its own extent outward. The round-mark corners above do
   * not, because a dot seated in the bounding-box corner is already correct.
   */
  overhangEnd: { translate: "50% -50%" },
  overhangStart: { translate: "-50% -50%" },
  overhangEndBottom: { translate: "50% 50%" },
  overhangStartBottom: { translate: "-50% 50%" },
});

export const overlayMarkPlacementStyles = {
  "block-end-inline-end": overlayMark["block-end-inline-end"],
  "block-end-inline-start": overlayMark["block-end-inline-start"],
  "block-start-inline-end": overlayMark["block-start-inline-end"],
  "block-start-inline-start": overlayMark["block-start-inline-start"],
} as const satisfies Record<OverlayMarkPlacement, unknown>;

export const overlayMarkOverhangStyles = {
  "block-end-inline-end": overlayMark.overhangEndBottom,
  "block-end-inline-start": overlayMark.overhangStartBottom,
  "block-start-inline-end": overlayMark.overhangEnd,
  "block-start-inline-start": overlayMark.overhangStart,
} as const satisfies Record<OverlayMarkPlacement, unknown>;

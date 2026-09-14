import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/** Internal air inside an overlay surface; independent from control `size`. */
export type OverlayDensity = "compact" | "regular";

/**
 * Content-tier densities, plus the edge-to-edge case.
 *
 * `flush` zeroes the surface's own padding AND gap so the content can draw
 * rules, section dividers, and rows that reach the surface's border — a
 * settings panel or a status list inside an anchored popover. It is a
 * *content* tier value only: a modal's padding is its margin from the screen
 * and there is no legitimate flush modal, so `OverlayDensity` stays two-valued
 * and every component that pads a title group or a modal keeps handling
 * exactly two cases.
 *
 * A `flush` surface hands the padding bill to its own header/body: whatever is
 * inside now owns one consistent inner gutter, and nothing between the border
 * and the content pays twice. Composing `flush` and then padding the surface
 * again from the host is the double-inset bug this value exists to remove.
 */
export type OverlayContentDensity = OverlayDensity | "flush";

/**
 * Shared overlay anatomy. Modal components compose the modal tier; anchored
 * content surfaces compose the content tier. Width and positioning stay with
 * the product component because they describe different jobs.
 */
export const overlaySurface = stylex.create({
  backdrop: {
    backdropFilter: vars["--ads-motion-blur-overlay"],
    backgroundColor: vars["--ads-color-overlay"],
    inset: 0,
    position: "fixed",
    zIndex: vars["--ads-z-index-overlay"],
  },
  modal: {
    backgroundColor: vars["--ads-color-surface-raised"],
    boxShadow: vars["--ads-elevation-modal"],
    color: vars["--ads-color-text"],
  },
  modalRounded: {
    borderColor: vars["--ads-color-media-edge"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
  },
  anchored: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-overlay"],
    color: vars["--ads-color-text"],
  },
  modalRegular: {
    gap: `calc(${densityPad.md} + ${densityPad.sm})`,
    padding: `calc(${densityPad.md} + ${densityPad.sm})`,
  },
  modalCompact: {
    gap: `calc(${densityPad.sm} + ${densityPad.xs})`,
    padding: `calc(${densityPad.sm} + ${densityPad.xs})`,
  },
  contentRegular: {
    gap: `calc(${densityPad.md} + ${densityPad.xs})`,
    padding: `calc(${densityPad.md} + ${densityPad.xs})`,
  },
  contentCompact: {
    gap: densityPad.sm,
    padding: densityPad.sm,
  },
  // Both properties, not just `padding`: a grid/flex surface with a surviving
  // `gap` still insets its own rows from each other, so section dividers would
  // stop short of one another even after the padding went to zero.
  contentFlush: {
    gap: 0,
    padding: 0,
  },
  titleGroupRegular: {
    gap: densityPad.sm,
  },
  titleGroupCompact: {
    gap: densityPad.xs,
  },
});

export const overlayModalDensity = {
  compact: overlaySurface.modalCompact,
  regular: overlaySurface.modalRegular,
} as const;

export const overlayContentDensity = {
  compact: overlaySurface.contentCompact,
  flush: overlaySurface.contentFlush,
  regular: overlaySurface.contentRegular,
} as const;

/**
 * A `flush` surface still wants the regular title-group rhythm — the header is
 * the one part that keeps its gutter — so the two-valued title-group map is
 * addressed through this narrowing rather than gaining a third entry that
 * would have to be a duplicate of `regular`.
 */
export function overlayDensityTier(
  density: OverlayContentDensity,
): OverlayDensity {
  return density === "flush" ? "regular" : density;
}

export const overlayTitleGroupDensity = {
  compact: overlaySurface.titleGroupCompact,
  regular: overlaySurface.titleGroupRegular,
} as const;

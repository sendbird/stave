import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/**
 * The Stepper's `size` rungs, split out of `Stepper.styles.ts` so the scale
 * axis has one owner and the variant/orientation sheet stays under the
 * 500-line cap as the rung set grows.
 *
 * A rung sets two custom properties on the `<li>` — the marker size every
 * connector `calc()` in `Stepper.styles.ts` measures against, and the
 * horizontal track basis — plus the copy size. The marker itself reads the
 * same size here so the square and the track that centres on it cannot drift.
 *
 * The marker is a control box, so it reads the `controlMarkSize` ramp
 * (16 / 20 / 24), never `space*`: the density theme remaps `space*`, and a
 * surface's `density` must not resize a control (design direction, "A control's
 * box may not be measured in `space*`"). `sm` and `md` were the literals 20px
 * and 24px — the same values, now named.
 */
const markerSizeXs = vars["--ads-control-mark-size-sm"];
const markerSizeSm = vars["--ads-control-mark-size-md"];
const markerSizeMd = vars["--ads-control-mark-size-lg"];
const trackBasisSm = "10rem";
const trackBasisMd = "12rem";

/**
 * The centred connector gap for the `xs` navigation chips: an 8px line in a
 * 12px gutter leaves `(12 − 8) / 2` on each side. Derived from the two
 * `densityPad` steps rather than written as a 2px literal.
 */
const xsConnectorInset = `calc((${densityPad.md} - ${densityPad.sm}) / 2)`;

const styles = stylex.create({
  itemXs: {
    "--ads-stepper-marker-size": markerSizeXs,
    // The basis is a copy measure, not air: `xs` keeps `sm`'s 10rem so a
    // label wraps where it did one rung up.
    "--ads-stepper-track-basis": trackBasisSm,
    fontSize: vars["--ads-font-size-caption"],
  },
  itemSm: {
    "--ads-stepper-marker-size": markerSizeSm,
    "--ads-stepper-track-basis": trackBasisSm,
    fontSize: vars["--ads-font-size-caption"],
  },
  itemMd: {
    "--ads-stepper-marker-size": markerSizeMd,
    "--ads-stepper-track-basis": trackBasisMd,
    fontSize: vars["--ads-font-size-body"],
  },
  markerXs: {
    // Micro type on a tight line box: caption at the inherited 1.5 leading is
    // an 18px line, which would stretch a 16px marker into an oval.
    fontSize: vars["--ads-font-size-micro"],
    inlineSize: markerSizeXs,
    lineHeight: vars["--ads-line-height-tight"],
    minBlockSize: markerSizeXs,
  },
  markerSm: {
    inlineSize: markerSizeSm,
    minBlockSize: markerSizeSm,
  },
  markerMd: {
    inlineSize: markerSizeMd,
    minBlockSize: markerSizeMd,
  },
  /*
   * The `xs` rhythm. `sm` and `md` share one rhythm and differ only in marker,
   * type and control height; `xs` is the dense-inspector rung, so it steps the
   * AIR too — reading the fixed `densityPad` scale, which a density theme
   * cannot shift (a component's own size prop takes its padding from there,
   * §8). Row rhythm 16/20/24 → 12, marker-to-copy gap 8 → 4, copy offset
   * under a horizontal marker 8 → 4. Stepping only the 28px floor would leave
   * a content-sized row exactly as tall as `sm` (the RadioGroup lesson).
   */
  xsTrackVertical: {
    paddingBlockEnd: densityPad.md,
  },
  xsTrackHorizontal: {
    paddingBlockEnd: {
      default: 0,
      "@container (max-width: 640px)": densityPad.md,
    },
    paddingInlineEnd: {
      default: densityPad.md,
      "@container (max-width: 640px)": 0,
    },
  },
  xsNavigationHorizontal: {
    paddingInlineEnd: densityPad.md,
    "::after": {
      inlineSize: densityPad.sm,
      insetInlineEnd: xsConnectorInset,
    },
  },
  xsNavigationVertical: {
    paddingBlockEnd: densityPad.md,
    "::after": {
      blockSize: densityPad.sm,
      insetBlockEnd: xsConnectorInset,
    },
  },
  xsGap: {
    gap: densityPad.xs,
  },
  xsCopyTrackHorizontal: {
    paddingBlockStart: {
      default: densityPad.xs,
      "@container (max-width: 640px)": 0,
    },
  },
});

export const itemSizeStyles = {
  md: styles.itemMd,
  sm: styles.itemSm,
  xs: styles.itemXs,
} as const;

export const markerSizeStyles = {
  md: styles.markerMd,
  sm: styles.markerSm,
  xs: styles.markerXs,
} as const;

/** `xs` item rhythm by variant × orientation; composed after the base arm. */
export const itemXsRhythmStyles = {
  navigation: {
    horizontal: styles.xsNavigationHorizontal,
    vertical: styles.xsNavigationVertical,
  },
  track: {
    horizontal: styles.xsTrackHorizontal,
    vertical: styles.xsTrackVertical,
  },
} as const;

/** The `xs` marker-to-copy gap, for the step body and the trigger grid. */
export const xsGap = styles.xsGap;
/** The `xs` copy offset under a horizontal track marker. */
export const xsCopyTrackHorizontal = styles.xsCopyTrackHorizontal;

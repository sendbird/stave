import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The one gradient-sweep idiom, owned in one place.
 *
 * Two components draw a "the model is working" sweep through live type:
 * `TextShimmer` (a status label, plus its skeleton bars) and the shimmering
 * status `Marker`. Both files carried a comment asserting the two were unified
 * and could not drift. Only the *duration* had ever been unified. The gradients
 * had not:
 *
 * | | trough ink | stops |
 * | --- | --- | --- |
 * | `TextShimmer` | `colorTextMuted` | 38% / 50% / 62% |
 * | `Marker` | `colorTextSubtle` | 35% / 50% / 65% |
 *
 * Rendered side by side in one transcript — which is the normal case, a
 * shimmering marker above a shimmering response label — that is a visibly
 * dimmer trough and a visibly wider highlight band on one of them. The
 * reduced-motion arms had drifted too: one collapsed `background-clip` back to
 * `border-box` and dropped the image, the other kept both and neutralised the
 * effect through `-webkit-text-fill-color` instead.
 *
 * So the sweep is a recipe now, not a convention. A comment cannot stop drift;
 * a shared import can.
 *
 * ## The contract
 *
 * - **One trough ink: `colorTextMuted`.** The sweep has to stay legible while
 *   it is at its dimmest, because it is running under text a reader is trying
 *   to read. `colorTextSubtle` sits a full lightness step lighter and dropped
 *   the resting state below comfortable reading contrast on `colorCanvas`.
 * - **One stop triple: 38 / 50 / 62.** A 24%-wide highlight band. The wider
 *   35/65 band reads as a slow wash rather than a travelling highlight at the
 *   shared `durationLoop` cadence.
 * - **Reduced motion is a designed state, not an absence.** The animation
 *   stops, the gradient is removed, `background-clip` returns to `border-box`,
 *   and the type paints in the trough ink. Both `color` and
 *   `-webkit-text-fill-color` are reset, because a stale
 *   `-webkit-text-fill-color: transparent` wins over `color` in WebKit and
 *   would leave the label invisible for exactly the reader who opted out.
 *
 * Compose `textShimmer.sweep` onto the element whose *glyphs* should carry the
 * sweep — it clips the gradient to the text, so it must sit on the text node,
 * not on a wrapper with padding. `textShimmer.bar` is the same travel applied
 * to a solid skeleton block, for the placeholder-bar case where there are no
 * glyphs to clip to.
 */
const sweepKeyframes = stylex.keyframes({
  "0%": { backgroundPosition: "150% 0" },
  "100%": { backgroundPosition: "-50% 0" },
});

/** The shared travel. Both arms below run at `durationLoop`, linear. */
const travel = {
  animationDuration: vars.motionDurationLoop,
  animationIterationCount: "infinite",
  animationName: {
    default: sweepKeyframes,
    "@media (prefers-reduced-motion: reduce)": "none",
  },
  animationTimingFunction: "linear",
  backgroundSize: "200% 100%",
} as const;

export const textShimmer = stylex.create({
  /**
   * Sweep through the glyphs of live status type. Clips to the text, so apply
   * it to the text node itself.
   */
  sweep: {
    ...travel,
    backgroundClip: {
      default: "text",
      "@media (prefers-reduced-motion: reduce)": "border-box",
    },
    backgroundImage: {
      default: `linear-gradient(90deg, ${vars.colorTextMuted} 38%, ${vars.colorText} 50%, ${vars.colorTextMuted} 62%)`,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    color: {
      default: "transparent",
      "@media (prefers-reduced-motion: reduce)": vars.colorTextMuted,
    },
    WebkitBackgroundClip: {
      default: "text",
      "@media (prefers-reduced-motion: reduce)": "border-box",
    },
    // Reset explicitly. In WebKit `-webkit-text-fill-color` beats `color`, so
    // leaving it `transparent` under reduced motion hides the label outright.
    WebkitTextFillColor: {
      default: "transparent",
      "@media (prefers-reduced-motion: reduce)": vars.colorTextMuted,
    },
  },
  /**
   * The same travel over a solid placeholder bar. No text to clip to, so the
   * gradient paints the block itself and the flat `colorCanvasSubtle` fill
   * underneath is what remains under reduced motion — the reserved space never
   * collapses.
   */
  bar: {
    ...travel,
    backgroundImage: {
      default: `linear-gradient(90deg, ${vars.colorCanvasSubtle} 38%, ${vars.colorBorderSubtle} 50%, ${vars.colorCanvasSubtle} 62%)`,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
  },
});

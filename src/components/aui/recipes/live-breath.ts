import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The live breath (2026-11-15): AUI's one device for "this is happening right
 * now, here". The part that is live breathes in opacity, in place, and
 * nothing travels across a surface. It replaced every travelling band of
 * light in the package — the step in hand's passing light, the live fill's
 * band, the one-shot highlight sweep over a step that became current, the
 * running bar's shine, the text shimmer through live words and the
 * composer's travelling hairline — at the maintainer's request that the
 * device stop reading like the reference libraries it came from.
 *
 * | Key | For | Loop | Reduce Motion |
 * | --- | --- | --- | --- |
 * | `mark` | a fill segment, a point, a running bar, a hairline | 1 → 0.45 → 1, 2000ms (`loop-slow`), ease-in-out | still, at full strength |
 * | `text` | the words of the step being worked | 1 → 0.6 → 1, same loop, full ink | still, full ink |
 *
 * Rules (progress grammar → "Live"):
 *
 * - **Where the work is.** The breath goes on the part that is live, never on
 *   a container, and never as an added indicator.
 * - **One rhythm.** Every breath is pinned to the document timeline
 *   (`useLivePhaseLock`), so all live parts on a page rise and fall together.
 *   Call the hook from any component that composes these keys.
 * - **Opacity only.** Composited, interrupted by removing the key, and never
 *   a change of size, position or value.
 * - **Still, not gone.** Under Reduce Motion the mark stays at full strength;
 *   the word or the glyph beside it still says what state it is in.
 *
 * The keyframes are global (`live-motion.css`), not `stylex.keyframes`, so the
 * phase lock can find them by name. StyleX only resolves literals here, so the
 * names are written out; `live-breath-keyframes.ts` holds the same names for
 * the phase lock, and a unit test keeps the three in step.
 *
 * This is the only stylesheet that declares the breath. Every member composes
 * `liveBreath.mark` or `liveBreath.text`; none restates the animation.
 *
 * Light travelling through text or across a fill is the common way to say
 * "working"; that device is what AUI dropped. Kept: the live state is felt
 * at a glance and the words stay readable while it runs.
 */

const REDUCED = "@media (prefers-reduced-motion: reduce)";
const FORCED = "@media (forced-colors: active)";

const loop = {
  animationDuration: vars["--aui-motion-duration-loop-slow"],
  animationIterationCount: "infinite",
  animationTimingFunction: vars["--aui-motion-ease-loop"],
} as const;

export const liveBreath = stylex.create({
  /** A live fill, point, bar or hairline breathing in place. */
  mark: {
    ...loop,
    animationName: {
      default: "atelier-live-breath",
      [REDUCED]: "none",
      [FORCED]: "none",
    },
  },
  /**
   * The words of the step being worked: full ink breathing to 0.6, which
   * keeps the dimmest frame close to the muted ink. Compose on the text node.
   */
  text: {
    ...loop,
    animationName: {
      default: "atelier-live-breath-text",
      [REDUCED]: "none",
      [FORCED]: "none",
    },
    color: vars["--aui-color-text"],
  },
});

/**
 * The names of the live breath's global keyframes (`live-motion.css`). Plain
 * constants, apart from the StyleX recipe, so the phase lock in
 * `Skeleton.motion.ts` can import them without pulling in StyleX.
 */

/** The breath of a mark: 1 → 0.45 → 1. */
export const LIVE_BREATH_KEYFRAMES = "atelier-live-breath";
/** The shallower breath of live words: 1 → 0.6 → 1. */
export const LIVE_BREATH_TEXT_KEYFRAMES = "atelier-live-breath-text";

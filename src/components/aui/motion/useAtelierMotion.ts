import { useReducedMotion } from "motion/react";

import { useMotionForcePlay } from "./MotionProvider";

export type AtelierMotion = {
  /**
   * `true` when motion should collapse to instant/opacity-only — i.e. the user
   * enabled OS "Reduce Motion" AND we are not in force-play (docs) mode.
   */
  reduceMotion: boolean;
};

/**
 * Reduced-motion helper for the JS motion layer.
 *
 * Reads the OS `prefers-reduced-motion` setting (via Motion's `useReducedMotion`)
 * but honors the docs force-play override so showcases always animate.
 *
 * `MotionConfig` (set by {@link AtelierMotionProvider}) already disables
 * transform/layout animations automatically when reduced motion is active. Use
 * this hook only when a component must branch *explicitly* — e.g. swap a spring
 * for an instant set, or skip mounting a purely decorative motion element.
 */
export function useAtelierMotion(): AtelierMotion {
  const forcePlay = useMotionForcePlay();
  const prefersReduced = useReducedMotion();
  return { reduceMotion: forcePlay ? false : prefersReduced === true };
}

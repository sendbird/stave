/**
 * Spring presets for the JS motion layer (Motion / `motion`).
 *
 * Exported as plain JS objects — NOT StyleX vars — because Motion's
 * `transition` consumes `{ type, stiffness, damping, mass }` directly. These
 * are theme-independent (physics, not color) and mirror the CSS motion tokens
 * above so both layers share one vocabulary.
 *
 * - `springSnappy` — crisp, near-critically-damped; UI feedback (press, toggles).
 * - `springSmooth` — gentle glide, no overshoot; layout moves (tab indicator).
 * - `springBouncy` — visible overshoot; playful accents (drag release, sliders).
 */
export type SpringPreset = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

export const springSnappy: SpringPreset = {
  type: "spring",
  stiffness: 520,
  damping: 36,
  mass: 1,
};

export const springSmooth: SpringPreset = {
  type: "spring",
  stiffness: 280,
  damping: 30,
  mass: 1,
};

export const springBouncy: SpringPreset = {
  type: "spring",
  stiffness: 420,
  damping: 17,
  mass: 0.9,
};

/**
 * JS mirror of the CSS enter/exit primitives.
 *
 * The Motion layer cannot read `vars.motionDistanceSmall` & co. — those resolve to
 * `var(--atelier-motion-*)` strings, which Motion's numeric interpolation
 * cannot animate. Components in the JS layer (`TextReveal`, `ActionSwap`,
 * `FloatingToolbar`, …) were therefore hard-coding their own blur/distance/
 * scale values and drifting from the CSS layer. Import these instead so both
 * layers speak one vocabulary; keep them in sync with `styles.css`.
 */
export const motionPrimitives = {
  /** px — small enter/exit travel (inline swaps, chips). */
  motionDistanceSmall: 4,
  /** px — medium enter/exit travel (panels, reveals). */
  motionDistanceMedium: 8,
  /** seconds — micro opacity feedback when spatial motion is reduced. */
  motionDurationMicroSeconds: 0.08,
  /** unitless — enter/exit scale floor. */
  motionScaleEnter: 0.96,
  /** unitless — press feedback scale (`whileTap`). */
  scalePress: 0.96,
} as const;

/**
 * Exit is roughly half of enter.
 *
 * A surface appearing is new information and earns a full beat; the same
 * surface leaving is already-read information and should get out of the way.
 * Every enter/exit pair in the CSS layer follows this ratio (emphasis 250ms in
 * → quick 150ms out; quick 150ms in → micro 80ms out), and JS-layer exits
 * should use `motionExitRatio` against their enter duration rather than
 * inventing a third number.
 */
export const motionExitRatio = 0.5;

export const springs = {
  snappy: springSnappy,
  smooth: springSmooth,
  bouncy: springBouncy,
} as const;

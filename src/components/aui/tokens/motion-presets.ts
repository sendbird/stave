/**
 * The JS motion layer's vocabulary (Motion / `motion`): springs, durations and
 * curves, as plain numbers.
 *
 * Exported as plain JS objects — NOT StyleX vars — because Motion's
 * `transition` consumes `{ type, stiffness, damping, mass }` and seconds
 * directly, and cannot interpolate a `var(--atelier-motion-*)` string. They are
 * theme-independent (physics, not color) and mirror the CSS motion primitives
 * in `styles.css`; keep the two in step.
 *
 * Springs (damping ratio ζ = damping / (2·√(stiffness·mass)); overshoot of a
 * step = e^(−ζπ/√(1−ζ²)) when ζ < 1):
 * - `springSnappy` — 520/36/1, ζ ≈ 0.79: ~1.8% overshoot, settles in ~0.3s.
 *   Indicators, thumbs, press feedback, label swaps — and, sampled as
 *   `--atelier-motion-ease-spring-snappy`, a docked sheet's entrance (its
 *   overshoot is sub-pixel, so a flush edge never opens a gap).
 * - `springSmooth` — 280/30/1, ζ ≈ 0.90: a slower glide, ~0.2% overshoot.
 *   Layout repositioning (tab pill, board cards, sortable rows, cursors).
 * - `springSignature` (alias `springBouncy`) — 420/21/0.9, ζ ≈ 0.54, ~13%
 *   overshoot: THE signature. Reserved for the sidebar disclosure
 *   (`motionSignature` below) and the settle after a drag or fling is
 *   released. Popups, dialogs and toasts entered on it until the 2026-11-08
 *   motion review; a bounce on every surface was no signature at all, so
 *   they enter on the ease-out now. Exits never use it.
 *
 * In Motion's `{ bounce }` terms (damping ratio ≈ 1 − bounce) snappy is
 * ≈ 0.21 and smooth ≈ 0.10, inside the 0.1–0.3 range Emil Kowalski's
 * animation skill allows for UI; the signature's ≈ 0.46 is the one deliberate
 * exception, bounded in pixels (`motionSignature.overshootCapPx`).
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

export const springSignature: SpringPreset = {
  type: "spring",
  stiffness: 420,
  damping: 21,
  mass: 0.9,
};

/** The signature spring under its physics name. Same object. */
export const springBouncy: SpringPreset = springSignature;

/**
 * Seconds — the `--atelier-motion-duration-*` ramp for Motion's `duration`.
 * `AnimatedNumber`, `ActionSwap`, `SelectionActionBar` and the dismissing
 * `Alert`/`Banner` read these instead of restating 0.12 / 0.22 by hand.
 */
export const motionDurations = {
  micro: 0.08,
  fast: 0.12,
  tooltip: 0.1,
  quick: 0.15,
  normal: 0.22,
  emphasis: 0.25,
  panel: 0.34,
  /** The signature's open (`--atelier-motion-duration-signature`). */
  signature: 0.22,
  /** One spinner revolution (`--atelier-motion-duration-spin`). */
  spin: 0.6,
} as const;

export type MotionDurationStep = keyof typeof motionDurations;

/**
 * The interaction ease-out, `cubic-bezier(0.22, 1, 0.36, 1)` — the value
 * behind `--atelier-motion-ease-out` and its `standard`/`expressive` aliases.
 * Entering AND exiting surfaces, opacity, disclosures and pointer-driven
 * glides. Within 1.1% at every point of the strong ease-out Emil Kowalski's
 * skill publishes, `cubic-bezier(0.23, 1, 0.32, 1)`, so it stays. A tuple for
 * Motion's `ease`, a string for the Web Animations API.
 */
export const motionEaseOut: [number, number, number, number] = [
  0.22, 1, 0.36, 1,
];
export const motionEaseOutCss = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * `--atelier-motion-ease-in-out`, `cubic-bezier(0.77, 0, 0.175, 1)`: movement
 * the SYSTEM starts that begins and ends on screen — a reordered row gliding
 * to its slot. Never an exit and never pointer feedback: its slow start is a
 * hesitation when the user is the cause.
 */
export const motionEaseInOut: [number, number, number, number] = [
  0.77, 0, 0.175, 1,
];
export const motionEaseInOutCss = "cubic-bezier(0.77, 0, 0.175, 1)";

/** Points sampled per spring easing (24 equal intervals). */
const SPRING_EASING_POINTS = 25;
/** The window ends when the decay envelope e^(−ζωₙt) falls to 0.5%. */
const SPRING_EASING_SETTLE = 0.005;

/** Unit step response x(t) of a spring released from rest at 0 toward 1. */
export function springStepResponse(spring: SpringPreset, t: number): number {
  const { damping, mass, stiffness } = spring;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    return (
      1 -
      Math.exp(-zeta * omega * t) *
        (Math.cos(omegaD * t) +
          ((zeta * omega) / omegaD) * Math.sin(omegaD * t))
    );
  }
  if (zeta === 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
  const root = Math.sqrt(zeta * zeta - 1);
  const slow = -omega * (zeta - root);
  const fast = -omega * (zeta + root);
  return (
    1 + (fast * Math.exp(slow * t) - slow * Math.exp(fast * t)) / (slow - fast)
  );
}

/**
 * A spring as a CSS `linear()` easing: the step response sampled at
 * {@link SPRING_EASING_POINTS} equal steps over its settle window (until the
 * slowest decay envelope reaches {@link SPRING_EASING_SETTLE}), 3 decimals,
 * pinned to exactly 0 and 1 at the ends. The curve keeps the spring's SHAPE —
 * overshoot ratio and oscillation count — while the CSS `transition-duration`
 * sets its speed, so one token serves a 150ms menu and a 340ms sheet.
 * `styles.css` carries the output verbatim; a unit test keeps them equal.
 */
export function springLinearEasing(spring: SpringPreset): string {
  const { damping, mass, stiffness } = spring;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const decay =
    zeta <= 1 ? zeta * omega : omega * (zeta - Math.sqrt(zeta * zeta - 1));
  const window = Math.log(1 / SPRING_EASING_SETTLE) / decay;
  const last = SPRING_EASING_POINTS - 1;
  const stops = Array.from({ length: SPRING_EASING_POINTS }, (_, index) => {
    if (index === 0) return "0";
    if (index === last) return "1";
    const value = springStepResponse(spring, (window * index) / last);
    return String(Math.round(value * 1000) / 1000);
  });
  return `linear(${stops.join(", ")})`;
}

/**
 * `--atelier-motion-ease-spring` — `springSignature` as a CSS easing (peaks
 * at 1.133). Read it as `--atelier-motion-ease-signature`: the signature
 * open's height, rise and chevron turn. Never opacity (a spring overshoots
 * past opaque), never an exit.
 */
export const motionEaseSpringCss = springLinearEasing(springSignature);

/** The signature curve under its role name. Same string. */
export const motionEaseSignatureCss = motionEaseSpringCss;

/**
 * THE Atelier signature motion — the sidebar ("LNB") bounce.
 *
 * Every sidebar disclosure opens on it: a `SidebarGroup collapsible` and a
 * `SidebarMenuSub` drop open, overshoot and settle, and the chevron beside
 * them turns past 90° and back on the same curve and beat. It is the one
 * place in the system that bounces, which is what makes it a signature —
 * every other surface enters on the plain ease-out.
 *
 * - Open: {@link springSignature} sampled as `linear()`, over 220ms
 *   (`--atelier-motion-duration-signature`). The overshoot is held to
 *   `overshootCapPx` whatever the list length (`max-block-size`), so a
 *   long Projects list never shoves the groups below it 50px and back.
 * - Close: no overshoot — 120ms on the ease-out, like every exit.
 * - Keyboard: a disclosure toggled from the keyboard lands at once; a
 *   keyboard action repeats too often to replay any motion.
 * - Reduce Motion: height, rise and turn are instant; the 80ms fade stays.
 *
 * CSS: `--atelier-motion-ease-signature`, `--atelier-motion-duration-signature`,
 * `--atelier-motion-signature-overshoot` (`sidebar-motion.css`). StyleX:
 * `--aui-motion-ease-signature`, `--aui-motion-duration-signature`. Use it for
 * a navigation disclosure that should feel like the rail; never for an
 * overlay, a list being read, or anything opened tens of times a minute.
 */
export const motionSignature = {
  spring: springSignature,
  /** seconds — the open. */
  duration: 0.22,
  /** seconds — the close (ease-out, no overshoot). */
  closeDuration: 0.12,
  /** px — the most the open may travel past its resting size. */
  overshootCapPx: 12,
  /** the open's CSS easing. */
  easeCss: motionEaseSpringCss,
} as const;

/**
 * `--atelier-motion-ease-spring-snappy` — `springSnappy` as a CSS easing
 * (peaks at 1.018). The ENTER travel of an edge-docked sheet (Drawer, the
 * mobile sidebar): 1.8% of 32px is half a pixel, so the overshoot never pulls
 * the sheet off the edge it is docked to.
 */
export const motionEaseSpringSnappyCss = springLinearEasing(springSnappy);

/**
 * JS mirror of the CSS enter/exit primitives.
 *
 * The Motion layer cannot read `vars["--aui-motion-distance-small"]` & co. — those resolve to
 * `var(--atelier-motion-*)` strings, which Motion's numeric interpolation
 * cannot animate. Components in the JS layer (`TextReveal`, `ActionSwap`,
 * `FloatingToolbar`, …) were therefore hard-coding their own blur/distance/
 * scale values and drifting from the CSS layer. Import these instead so both
 * layers speak one vocabulary; keep them in sync with `styles.css`.
 */
export const motionPrimitives = {
  /** px — small enter/exit travel (inline swaps, chips, disclosure content). */
  motionDistanceSmall: 4,
  /** px — medium enter/exit travel (toasts, floating bars, reveals). */
  motionDistanceMedium: 8,
  /** seconds — micro opacity feedback when spatial motion is reduced. */
  motionDurationMicroSeconds: motionDurations.micro,
  /**
   * unitless — enter scale of an anchored popup or floating bar
   * (`--atelier-motion-dropdown-scale`; a modal starts lower, at .96).
   */
  motionScaleEnter: 0.97,
  /** unitless — exit scale of a popup or dialog (`*-close-scale`). */
  motionScaleExit: 0.99,
  /**
   * unitless — press feedback (`whileTap`, `Button`'s `:active`). One value
   * for every pressable: `CallControlBar` pressed to .94, `Slider` and
   * `Annotation` to .96, so the same tap shrank three controls by three
   * amounts. .96 again since #724's .97 read as a press that did not land.
   */
  scalePress: 0.96,
  /**
   * unitless — a small direct-manipulation handle lifting under the pointer
   * (`Slider` thumb, `Annotation` pin). Never a whole control.
   */
  scaleLift: 1.08,
} as const;

/**
 * Exit duration as a fraction of the enter it pairs with.
 *
 * A surface appearing is new information and earns a full beat; the same
 * surface leaving is already-read information and should get out of the way.
 * The CSS layer's pairs sit at or below a half: menus 220 → 80ms, drawers
 * 340 → 150ms, dialogs, toasts and the signature 220 → 120ms (tooltips leave
 * at once). Every exit rides the ease-out. JS-layer exits without a CSS twin scale their
 * enter by this ratio — or their travel, as `ActionSwap` does — rather than
 * inventing a third number.
 */
export const motionExitRatio = 0.5;

export const springs = {
  snappy: springSnappy,
  smooth: springSmooth,
  bouncy: springBouncy,
  signature: springSignature,
} as const;

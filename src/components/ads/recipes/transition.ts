import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Shared state-transition recipe.
 *
 * The same three declarations — duration, property list, timing function —
 * were copy-pasted across ~110
 * call sites, and the property list alone had drifted into eight different
 * spellings. Several of those lists animated properties the component never
 * changes (a dead `box-shadow` on every text input), which costs a real
 * compositor check per frame and hides which properties actually move.
 *
 * Compose one *property* key with an optional *duration* key:
 *
 * ```ts
 * sx(styles.trigger, transition.colors)             // 120ms, the default
 * sx(styles.panel, transition.colors, transition.motionDurationNormal)
 * ```
 *
 * Rules:
 * - Never animate `all`. Name the properties.
 * - Never add `transform` here — Motion owns transform on its own element
 *   (see `decisions/motion-architecture.md`). `transformFallback` exists only
 *   for the CSS press path used when a component renders a non-Motion element.
 * - Non-spatial color/opacity feedback keeps an 80ms micro transition under
 *   reduced motion. Transform and layout-adjacent timing becomes instant.
 */
const nonSpatialDuration = {
  default: vars.motionDurationFast,
  "@media (prefers-reduced-motion: reduce)": vars.motionDurationMicro,
} as const;

const spatialDuration = {
  default: vars.motionDurationFast,
  "@media (prefers-reduced-motion: reduce)": "0ms",
} as const;

export const transition = stylex.create({
  /**
   * Color-only state change — THE default for interactive chrome (buttons,
   * triggers, menu items, rows, links).
   */
  colors: {
    transitionDuration: nonSpatialDuration,
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  /**
   * Colors plus `opacity` plus `box-shadow`, for controls that fade as a whole
   * on disabled/loading AND for the bordered pressables that now carry
   * `elevationRaised` (`Button` primary/secondary/outline/danger, `controlChrome.trigger`):
   * their box-shadow collapses to `elevationFlat` on `:active`, so the shadow is
   * part of the state matrix, not a static decoration. A control whose shadow
   * never changes gets this recipe as a no-op — nothing else needed auditing.
   */
  control: {
    transitionDuration: nonSpatialDuration,
    transitionProperty:
      "background-color, border-color, color, opacity, box-shadow",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  /**
   * Colors plus `box-shadow`, for controls that actually grow a ring or halo
   * on a state change. Do NOT use this for a control whose shadow never
   * changes.
   */
  ring: {
    transitionDuration: nonSpatialDuration,
    transitionProperty: "background-color, border-color, color, box-shadow",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  /** Reveal-on-hover chrome (row actions, table selection checkboxes). */
  fade: {
    transitionDuration: nonSpatialDuration,
    transitionProperty: "opacity",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  /**
   * `transform` alone — a chevron rotating open, a zoom/pan surface, an
   * indicator sliding. Separate from `transformFallback` because those call
   * sites change nothing but the transform, and pulling in four color
   * properties they never animate costs a compositor check per frame and lies
   * about what moves.
   *
   * Motion still owns transform wherever a component renders an `m.*` element
   * (see `decisions/motion-architecture.md`); this key is for the CSS-layer
   * elements that do not.
   */
  transform: {
    transitionDuration: spatialDuration,
    transitionProperty: "transform",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  /**
   * CSS press fallback for components that render a non-Motion element and so
   * cannot use `whileTap`. Names `transform` alongside the color set.
   */
  transformFallback: {
    transitionDuration: spatialDuration,
    transitionProperty:
      "background-color, border-color, color, opacity, transform",
    transitionTimingFunction: vars.motionEaseStandard,
  },

  // ---- Duration overrides (compose after a property key) -------------------
  /** 80ms — a press/release tick. */
  motionDurationMicro: {
    transitionDuration: {
      default: vars.motionDurationMicro,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  /** 150ms — a change the eye should follow (indicator slide, reveal). */
  motionDurationQuick: {
    transitionDuration: {
      default: vars.motionDurationQuick,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  /** 180ms — a small layout/size change. */
  motionDurationNormal: {
    transitionDuration: {
      default: vars.motionDurationNormal,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  /** 250ms — an emphasized surface change. */
  motionDurationEmphasis: {
    transitionDuration: {
      default: vars.motionDurationEmphasis,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
});

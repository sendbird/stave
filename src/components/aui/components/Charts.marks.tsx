import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
import type { ChartCurve, ChartDots } from "./Charts.props";

/*
 * Line and area mark options shared by `AreaChart`, `LineChart` and the
 * `SeriesChart` line/area series: the interpolation between points and the
 * point markers. Omitting both renders exactly as before — a monotone curve and
 * no dots.
 */

/** recharts curve type for a `ChartCurve`. */
export function curveType(curve: ChartCurve = "monotone") {
  // `step` holds a value across its own category band and changes at the
  // midpoint, which is how a per-bucket reading (a daily plan tier, a quota)
  // is read on a category axis.
  return curve === "step" ? "step" : curve === "linear" ? "linear" : "monotone";
}

type DotRenderProps = {
  cx?: number | null;
  cy?: number | null;
  index: number;
};

/**
 * The `dot` prop for a line or area mark.
 *
 * - `false` (default) — no markers; the line is the reading.
 * - `true` — a marker on every point with a value, ringed in the card surface
 *   so it stays separate from the stroke it sits on.
 * - `"last"` — one larger marker on the latest point with a value: the
 *   current reading, the one a trend is looked at for.
 */
export function lineDots(
  dots: ChartDots | undefined,
  color: string,
  values: ReadonlyArray<number | null | undefined>,
) {
  if (!dots) return false;
  let last = -1;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (typeof values[index] === "number") {
      last = index;
      break;
    }
  }
  return ({ cx, cy, index }: DotRenderProps) => {
    if (cx == null || cy == null) return null;
    if (dots === "last" && index !== last) return null;
    const current = index === last && dots === "last";
    return (
      <circle
        className="atelier-chart-dot"
        cx={cx}
        cy={cy}
        data-last={index === last ? "" : undefined}
        fill={color}
        key={`dot-${index}`}
        r={current ? 4 : 3}
        stroke={vars["--aui-color-surface-raised"]}
        strokeWidth={current ? 2 : 1.5}
      />
    );
  };
}

/**
 * The hovered (or keyboard-active) point on a line or area: the series color
 * ringed in the card surface, over a soft halo of the same color. Replaces
 * recharts' default dot, whose ring is a literal white that cuts a hole in a
 * dark card.
 */
export function activeDot(color: string) {
  return function ActiveDot({
    cx,
    cy,
  }: {
    cx?: number | null;
    cy?: number | null;
  }) {
    if (cx == null || cy == null) return <g />;
    return (
      <g className="atelier-chart-active-dot" pointerEvents="none">
        <circle cx={cx} cy={cy} fill={color} fillOpacity={0.18} r={9} />
        <circle
          cx={cx}
          cy={cy}
          fill={color}
          r={4.5}
          stroke={vars["--aui-color-surface-raised"]}
          strokeWidth={2}
        />
      </g>
    );
  };
}

/**
 * The newest point of a live line (2026-11 consensus review): a still dot,
 * ringed in the card surface. A perpetual pulse would move beside the value
 * being read; instead the soft halo flashes once when a new reading lands
 * (the caller keys the dot by its position, so a new reading re-mounts it)
 * and a held feed shows no motion at all. Reduced motion: no flash.
 */
export function LiveDot({
  color,
  cx,
  cy,
}: {
  color: string;
  cx: number;
  cy: number;
}) {
  return (
    <g className="atelier-chart-live-dot" pointerEvents="none">
      <circle
        className={sx(styles.flash)}
        cx={cx}
        cy={cy}
        data-live-flash=""
        fill={color}
        r={9}
      />
      <circle
        cx={cx}
        cy={cy}
        fill={color}
        r={4}
        stroke={vars["--aui-color-surface-raised"]}
        strokeWidth={2}
      />
    </g>
  );
}

const liveFlash = stylex.keyframes({
  from: { opacity: 0.35 },
  to: { opacity: 0 },
});

const styles = stylex.create({
  flash: {
    animationDuration: vars["--aui-motion-duration-emphasis"],
    animationFillMode: "both",
    animationName: {
      default: liveFlash,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    opacity: 0,
  },
});

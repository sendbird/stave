import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Skeleton } from "./Skeleton";
import {
  SKELETON_CLASS,
  SKELETON_SHOW_DELAYED_CLASS,
  useSkeletonPhaseLock,
} from "./Skeleton.motion";

/**
 * What a loading plot looks like before its data arrives (2026-11 refresh):
 * the silhouette of the chart that is coming — bars, a line, a ring, or rows —
 * instead of one grey slab.
 *
 * It paints with the shared skeleton recipe (`skeleton-motion.css`), not a
 * rhythm of its own: the same `colorSkeleton` fill, 120ms show delay and
 * phase-locked pulse as the headline skeleton above it, so a loading chart
 * card breathes once, not at three cadences (it used to run a 2s wrapper
 * breathe beside a 1.2s headline pulse). Reduced motion is a static fill.
 */
export type ChartLoadingShape = "arc" | "bars" | "block" | "line" | "rows";

/** Fixed, varied heights so the silhouette reads as data, never as a pattern. */
const BAR_HEIGHTS = [46, 62, 38, 71, 55, 82, 48, 66, 58, 75, 43, 61];
const ROW_WIDTHS = [92, 74, 63, 48, 31];

export function ChartLoadingSilhouette({
  shape,
}: {
  shape: ChartLoadingShape;
}) {
  useSkeletonPhaseLock(shape !== "block");
  if (shape === "block") {
    return <Skeleton height="100%" variant="block" width="100%" />;
  }
  return (
    <div
      aria-hidden
      className={cx(
        sx(styles.box),
        // Bars and rows carry their own delayed paint; a stroke has no
        // `::after`, so the SVG shapes wait on the wrapper instead.
        (shape === "arc" || shape === "line") && SKELETON_SHOW_DELAYED_CLASS,
      )}
      data-chart-loading={shape}
    >
      {shape === "bars" ? (
        <div className={sx(styles.bars)}>
          {BAR_HEIGHTS.map((height, index) => (
            <span
              className={cx(sx(styles.bar), SKELETON_CLASS)}
              key={index}
              style={{ blockSize: `${height}%` }}
            />
          ))}
        </div>
      ) : shape === "rows" ? (
        <div className={sx(styles.rows)}>
          {ROW_WIDTHS.map((width, index) => (
            <span
              className={cx(sx(styles.row), SKELETON_CLASS)}
              key={index}
              style={{ inlineSize: `${width}%` }}
            />
          ))}
        </div>
      ) : (
        <svg
          className={sx(styles.svg, styles.strokePulse)}
          preserveAspectRatio={shape === "arc" ? "xMidYMid meet" : "none"}
          viewBox={shape === "arc" ? "0 0 100 100" : "0 0 100 40"}
        >
          {shape === "arc" ? (
            <circle
              className={sx(styles.stroke)}
              cx={50}
              cy={50}
              fill="none"
              r={36}
              strokeWidth={12}
            />
          ) : (
            <path
              className={sx(styles.stroke)}
              d="M0 28 C 10 22, 16 30, 26 24 S 42 12, 52 18 S 70 30, 80 20 S 94 10, 100 14"
              fill="none"
              strokeLinecap="round"
              // A 2px line at the skeleton's quiet strength disappears; 4px
              // still reads as "a line is coming" without posing as data.
              strokeWidth={4}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
    </div>
  );
}

const styles = stylex.create({
  box: {
    blockSize: "100%",
    inlineSize: "100%",
  },
  bars: {
    alignItems: "flex-end",
    blockSize: "100%",
    display: "grid",
    gap: vars["--aui-space-8"],
    gridTemplateColumns: `repeat(${BAR_HEIGHTS.length}, minmax(0, 1fr))`,
    paddingInline: vars["--aui-space-8"],
  },
  bar: {
    borderStartEndRadius: vars["--aui-radius-mark"],
    borderStartStartRadius: vars["--aui-radius-mark"],
    display: "block",
    position: "relative",
  },
  rows: {
    blockSize: "100%",
    display: "grid",
    gap: vars["--aui-space-12"],
    gridAutoRows: "minmax(0, 20px)",
    alignContent: "center",
    paddingInline: vars["--aui-space-8"],
  },
  row: {
    blockSize: 20,
    borderRadius: vars["--aui-radius-mark"],
    display: "block",
    position: "relative",
  },
  svg: {
    blockSize: "100%",
    display: "block",
    inlineSize: "100%",
    paddingBlock: "12%",
  },
  // The skeleton pulse, on the element (an SVG stroke has no `::after`).
  strokePulse: {
    animationDuration: vars["--aui-motion-duration-skeleton"],
    animationIterationCount: "infinite",
    animationName: {
      default: "atelier-skeleton-pulse",
      "@media (prefers-reduced-motion: reduce)": "none",
      "@media (forced-colors: active)": "none",
    },
    animationTimingFunction: vars["--aui-motion-ease-loop"],
  },
  stroke: {
    forcedColorAdjust: "none",
    stroke: {
      default: vars["--aui-color-skeleton"],
      "@media (forced-colors: active)": "GrayText",
    },
  },
});

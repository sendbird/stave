import * as stylex from "@stylexjs/stylex";

import { sx } from "../utils/stylex";
import { ReasoningLoaderMark } from "./Loader.reasoning-parts";
import { ExtendedLoaderMark } from "./Loader.extended-parts";
import { loaderMarkStyles as styles } from "./Loader.styles";
import type { LoaderSize, LoaderVariant } from "./Loader.types";

type LoaderMarkProps = { size: LoaderSize; variant: LoaderVariant };

const threePhase = [styles.phase0, styles.phase2, styles.phase4] as const;
const fourPhase = [
  styles.phase0,
  styles.phase2,
  styles.phase4,
  styles.phase6,
] as const;
// Peak times in twentieths of the loop, read left to right on each row.
// The brighter paths enter from different edges and wind inward. The lower
// peaks fill the gaps with quieter pulses instead of moving any of the cells.
const matrixPeakTimes = [
  [13, 17, 5, 10, 13],
  [0, 3, 6, 13, 16],
  [11, 14, 9, 16, 19],
  [8, 16, 12, 7, 3],
  [5, 9, 15, 18, 12],
].flat();
const matrixTrailCells = new Set([3, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 20]);
const matrixRestingCells = new Set([5, 12, 19]);

/** Internal geometry for `Loader`; the public status contract lives in Loader.tsx. */
export function LoaderMark({ size, variant }: LoaderMarkProps) {
  return (
    <span
      aria-hidden
      className={sx(
        styles.mark,
        markSizeStyles[size],
        variantContainerStyles[variant],
      )}
      data-aui-loader-mark=""
    >
      {renderVariant(variant, size)}
    </span>
  );
}

function renderVariant(variant: LoaderVariant, size: LoaderSize) {
  switch (variant) {
    case "spinner":
      return (
        <svg
          className={sx(styles.spinner)}
          focusable="false"
          viewBox="0 0 24 24"
        >
          <circle
            className={sx(styles.spinnerArc)}
            cx="12"
            cy="12"
            pathLength="1"
            r="10.5"
          />
        </svg>
      );
    case "dots":
      return threePhase.map((phase, index) => (
        <span
          className={sx(styles.dot, dotSizeStyles[size], phase)}
          key={index}
        />
      ));
    case "matrix":
      return matrixPeakTimes.map((peak, index) => (
        <span className={sx(styles.matrixCell)} key={index}>
          <span
            {...stylex.props(
              styles.matrixDot,
              styles.matrixPhase(peak),
              !matrixTrailCells.has(index) && styles.matrixAmbient,
              matrixRestingCells.has(index) && styles.matrixResting,
            )}
          />
        </span>
      ));
    case "pulse":
      return threePhase.map((phase, index) => (
        <span
          className={sx(styles.pulseBar, pulseBarSizeStyles[size], phase)}
          key={index}
        />
      ));
    case "steps":
      return fourPhase.map((phase, index) => (
        <span
          className={sx(styles.step, stepSizeStyles[size], phase)}
          key={index}
        />
      ));
    case "orbit":
      return (
        <>
          <span className={sx(styles.orbitRail)} />
          <span className={sx(styles.orbitMotion)}>
            <span
              className={sx(styles.orbitPoint, orbitPointSizeStyles[size])}
            />
            <span
              className={sx(
                styles.orbitPoint,
                styles.orbitPointOpposite,
                orbitPointSizeStyles[size],
              )}
            />
          </span>
          <span className={sx(styles.orbitCore)} />
        </>
      );
    case "ripple":
      return (
        <>
          <span className={sx(styles.rippleRing, styles.rippleInner)} />
          <span className={sx(styles.rippleRing, styles.rippleMiddle)} />
          <span className={sx(styles.rippleRing, styles.rippleOuter)} />
        </>
      );
    case "signal":
      return fourPhase.map((phase, index) => (
        <span
          className={sx(
            styles.signalBar,
            signalBarSizeStyles[size],
            signalLevelStyles[index],
            phase,
          )}
          key={index}
        />
      ));
    case "scan":
      return (
        <>
          <span className={sx(styles.scanFrame)} />
          <span className={sx(styles.scanBeam, scanBeamSizeStyles[size])} />
        </>
      );
    case "parallel":
      return [
        styles.parallelStart,
        styles.parallelMiddle,
        styles.parallelEnd,
      ].map((position, index) => (
        <span
          className={sx(styles.parallelLane, parallelLaneSizeStyles[size])}
          key={index}
        >
          <span className={sx(styles.parallelRail)} />
          <span
            className={sx(
              styles.parallelRunner,
              position,
              index === 1 && styles.parallelReverse,
              fourPhase[index * 2],
            )}
          />
        </span>
      ));
    case "reason":
    case "think":
      return <ReasoningLoaderMark variant={variant} />;
    case "compile":
    case "decode":
    case "explore":
    case "handoff":
    case "persist":
    case "route":
    case "sync":
    case "verify":
    case "vision":
      return <ExtendedLoaderMark variant={variant} />;
  }
}

const variantContainerStyles = {
  compile: null,
  decode: null,
  dots: styles.dots,
  explore: null,
  handoff: null,
  matrix: styles.matrix,
  orbit: styles.orbit,
  parallel: styles.parallel,
  persist: null,
  pulse: styles.pulse,
  reason: null,
  think: null,
  ripple: styles.ripple,
  route: null,
  scan: styles.scan,
  signal: styles.signal,
  spinner: null,
  steps: styles.steps,
  sync: null,
  verify: null,
  vision: null,
} as const;
const markSizeStyles = {
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
  xs: styles.xs,
} as const;
const dotSizeStyles = {
  lg: styles.dotLg,
  md: styles.dotMd,
  sm: styles.dotSm,
  xs: styles.dotXs,
} as const;
const pulseBarSizeStyles = {
  lg: styles.pulseBarLg,
  md: styles.pulseBarMd,
  sm: styles.pulseBarSm,
  xs: styles.pulseBarXs,
} as const;
const stepSizeStyles = {
  lg: styles.stepLg,
  md: styles.stepMd,
  sm: styles.stepSm,
  xs: styles.stepXs,
} as const;
const orbitPointSizeStyles = {
  lg: styles.orbitPointLg,
  md: styles.orbitPointMd,
  sm: styles.orbitPointSm,
  xs: styles.orbitPointXs,
} as const;
const signalBarSizeStyles = {
  lg: styles.signalBarLg,
  md: styles.signalBarMd,
  sm: styles.signalBarSm,
  xs: styles.signalBarXs,
} as const;
const signalLevelStyles = [
  styles.signal1,
  styles.signal2,
  styles.signal3,
  styles.signal4,
] as const;
const scanBeamSizeStyles = {
  lg: styles.scanBeamLg,
  md: styles.scanBeamMd,
  sm: styles.scanBeamSm,
  xs: styles.scanBeamXs,
} as const;
const parallelLaneSizeStyles = {
  lg: styles.parallelLaneLg,
  md: styles.parallelLaneMd,
  sm: styles.parallelLaneSm,
  xs: styles.parallelLaneXs,
} as const;

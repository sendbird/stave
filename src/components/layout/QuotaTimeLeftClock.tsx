import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";

/**
 * Clock-face glyph for the share of a quota window still left. The hand sits
 * at the elapsed position (12 o'clock = window start) and the filled wedge
 * sweeps from the hand to 12, so a shrinking wedge reads as time running out.
 */
export function QuotaTimeLeftClock({
  timeLeftRatio,
  size = 12,
}: {
  timeLeftRatio: number;
  size?: number;
}) {
  const ratio = Math.min(1, Math.max(0, timeLeftRatio));
  const elapsed = 1 - ratio;
  const c = 8;
  const r = 6;
  const angle = elapsed * 2 * Math.PI;
  const handX = c + r * Math.sin(angle);
  const handY = c - r * Math.cos(angle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  const percentLeft = Math.round(ratio * 100);
  const wedge =
    ratio >= 1 ? (
      <circle cx={c} cy={c} r={r} />
    ) : ratio <= 0 ? null : (
      <path
        d={`M ${c} ${c} L ${handX} ${handY} A ${r} ${r} 0 ${largeArc} 1 ${c} ${c - r} Z`}
      />
    );

  return (
    <svg
      role="img"
      aria-label={`${percentLeft}% of window left`}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={sx(statusBarUsageStyles.clock)}
    >
      <title>{`${percentLeft}% of window left`}</title>
      <g className={sx(statusBarUsageStyles.clockWedge)}>{wedge}</g>
      <circle
        cx={c}
        cy={c}
        r={r + 1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
      />
      <line
        x1={c}
        y1={c}
        x2={handX}
        y2={handY}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

import { sx } from "@/components/ads/utils/stylex";
import { usageStripStyles as styles } from "@/components/layout/status-bar-usage-strip.styles";
import {
  resolveQuotaRingArc,
  resolveTimeLeftHand,
  usageTone,
} from "@/components/layout/status-bar-usage-strip.utils";

const TONE_STYLE = {
  ok: styles.ringOk,
  warn: styles.ringWarn,
  danger: styles.ringDanger,
} as const;

const CENTER = 8;
const RING_RADIUS = 6.5;
const RING_STROKE = 1.5;
const HAND_RADIUS = 3.5;

/**
 * A quota window at a glance. The arc is the share used, toned by the meters'
 * thresholds; the clock inside is the share of the window's time still left
 * (the time-left clock, without its rim — the ring is the rim). Both start at
 * 12 o'clock and run clockwise, so an arc that has passed the hand is usage
 * running ahead of time.
 *
 * Decorative: the percent and reset time beside it carry the same facts.
 */
export function QuotaRing({
  usedPercent,
  timeLeftRatio,
  size = 16,
}: {
  usedPercent: number;
  /** Null when the window length or reset time is unknown; the ring stays empty inside. */
  timeLeftRatio: number | null;
  size?: number;
}) {
  const { circumference, filled } = resolveQuotaRingArc({
    usedPercent,
    radius: RING_RADIUS,
  });
  const hand =
    timeLeftRatio === null
      ? null
      : resolveTimeLeftHand({ timeLeftRatio, center: CENTER, radius: HAND_RADIUS });

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={sx(styles.glyph)}
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        className={sx(styles.ringTrack)}
      />
      {filled > 0 ? (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          className={sx(TONE_STYLE[usageTone(usedPercent)])}
        />
      ) : null}
      {hand ? (
        <g className={sx(styles.ringHand)}>
          <g className={sx(styles.ringWedge)}>
            {hand.wedge.kind === "full" ? (
              <circle cx={CENTER} cy={CENTER} r={HAND_RADIUS} />
            ) : null}
            {hand.wedge.kind === "path" ? <path d={hand.wedge.d} /> : null}
          </g>
          <line
            x1={CENTER}
            y1={CENTER}
            x2={hand.handX}
            y2={hand.handY}
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
          />
        </g>
      ) : null}
    </svg>
  );
}

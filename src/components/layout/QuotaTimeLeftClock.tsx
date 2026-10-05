import { i18n, useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles } from "@/components/layout/status-bar-usage.styles";
import { resolveTimeLeftHand } from "@/components/layout/status-bar-usage-strip.utils";

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
  useTranslation();
  const c = 8;
  const r = 6;
  const { handX, handY, wedge } = resolveTimeLeftHand({ timeLeftRatio, center: c, radius: r });
  const percentLeft = Math.round(Math.min(1, Math.max(0, timeLeftRatio)) * 100);

  return (
    <svg
      role="img"
      aria-label={i18n.t("shell:quotaTimeLeftClock.ofWindowLeft", { value1: percentLeft })}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={sx(statusBarUsageStyles.clock)}
    >
      <title>{i18n.t("shell:quotaTimeLeftClock.ofWindowLeft", { value1: percentLeft })}</title>
      <g className={sx(statusBarUsageStyles.clockWedge)}>
        {wedge.kind === "full" ? <circle cx={c} cy={c} r={r} /> : null}
        {wedge.kind === "path" ? <path d={wedge.d} /> : null}
      </g>
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

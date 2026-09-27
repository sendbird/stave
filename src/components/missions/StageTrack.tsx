import * as stylex from "@stylexjs/stylex";
import { Hand } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { STAGE_STATUS_PRESENTATION, type MissionStageRow } from "@/lib/missions/mission-view";
import { missionStyles } from "./missions.styles";

/**
 * A mission's stages as one segmented track: a segment per stage, colored by
 * where it stands, with the stage names under it when there is room. It is an
 * ordered list, so assistive technology reads "Stage 3 of 6, Verify, Running"
 * while the eye reads the whole run at once.
 *
 * Shared by the Mission bar, the Mission panel and Fleet cards, so every
 * surface draws the same run the same way.
 */
export function StageTrack(props: {
  rows: readonly MissionStageRow[];
  /** `auto` shows names when the track is wide enough; `never` for a compact rail. */
  labels?: "auto" | "never";
  /** Animate the running segment. Off for historical missions and reduced motion. */
  live?: boolean;
  size?: "sm" | "md";
  /** The mission is paused: the current stage reads as waiting, not running. */
  paused?: boolean;
  "aria-label"?: string;
}) {
  const { rows, labels = "auto", live = true, size = "sm", paused = false } = props;
  return (
    <div className={sx(styles.container)}>
      <ol className={sx(styles.track)} aria-label={props["aria-label"] ?? "Stages"}>
        {rows.map((row) => {
          const presentation = STAGE_STATUS_PRESENTATION[row.status];
          const heldByPause = paused && row.current && row.status === "running";
          const tone = heldByPause ? "waiting" : presentation.tone;
          const statusLabel = heldByPause ? "Paused" : presentation.label;
          const running = row.status === "running" && !heldByPause;
          const asks = row.asksFirst && (row.status === "pending" || row.status === "awaiting-sign-off");
          return (
            <li
              key={row.stage.id}
              className={sx(styles.step)}
              aria-current={row.current ? "step" : undefined}
              title={`${row.index + 1}. ${row.stage.title} — ${statusLabel}${asks ? " · asks you first" : ""}`}
            >
              <span
                aria-hidden
                className={sx(
                  styles.segment,
                  size === "md" && styles.segmentMd,
                  SEGMENT_TONES[tone],
                  running && live && styles.segmentLive,
                )}
              />
              {labels === "auto" ? (
                <span
                  aria-hidden
                  className={sx(
                    styles.label,
                    row.current && styles.labelCurrent,
                    row.status === "completed" && styles.labelDone,
                  )}
                >
                  <span className={sx(styles.labelText)}>{row.stage.title}</span>
                  {asks ? <Hand className={sx(styles.hand)} /> : null}
                </span>
              ) : null}
              <span className={sx(missionStyles.visuallyHidden)}>
                {row.index + 1}. {row.stage.title} — {statusLabel}
                {asks ? ", asks you first" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const sweep = stylex.keyframes({
  from: { backgroundPosition: "100% 0" },
  to: { backgroundPosition: "-100% 0" },
});

const styles = stylex.create({
  container: { containerType: "inline-size", minWidth: 0 },
  track: {
    display: "flex",
    gap: 3,
    margin: 0,
    padding: 0,
    listStyle: "none",
    minWidth: 0,
  },
  step: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    flex: "1 1 0",
    minWidth: 0,
  },
  segment: {
    display: "block",
    height: 4,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-border"],
  },
  segmentMd: { height: 6 },
  segmentLive: {
    backgroundImage: `linear-gradient(90deg, ${vars["--ads-color-accent"]} 0%, color-mix(in oklab, ${vars["--ads-color-accent"]} 45%, ${vars["--ads-color-surface"]}) 50%, ${vars["--ads-color-accent"]} 100%)`,
    backgroundSize: "200% 100%",
    animationName: { default: sweep, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1.8s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  label: {
    display: { default: "flex", "@container (max-width: 28rem)": "none" },
    alignItems: "center",
    gap: 2,
    minWidth: 0,
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-subtle"],
  },
  labelText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  labelCurrent: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  labelDone: { color: vars["--ads-color-text-muted"] },
  hand: { flex: "0 0 auto", width: 11, height: 11, color: vars["--ads-color-warning-text"] },
});

const SEGMENT_TONES = stylex.create({
  done: { backgroundColor: vars["--ads-color-success"] },
  active: { backgroundColor: vars["--ads-color-accent"] },
  waiting: { backgroundColor: vars["--ads-color-warning"] },
  attention: { backgroundColor: vars["--ads-color-danger"] },
  idle: { backgroundColor: vars["--ads-color-border"] },
  skipped: {
    backgroundImage: `repeating-linear-gradient(135deg, ${vars["--ads-color-border-strong"]} 0 3px, transparent 3px 6px)`,
    backgroundColor: "transparent",
  },
});

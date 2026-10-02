import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { STAGE_STATUS_PRESENTATION, type MissionStageRow, type StageTone } from "@/lib/missions/mission-view";
import { projectStageProgress } from "@/lib/missions/stage-progress";
import { DitherProgress } from "./DitherProgress";
import { missionStyles } from "./missions.styles";

/**
 * A mission's stages as one progress track: the stages behind the run fill
 * it, a tick marks each boundary and the head names the stage in progress
 * with where it stands ("Verify 3/6"). One line high, so it fits the composer
 * status line and a Fleet card as well as the Progress tab.
 *
 * Assistive technology reads the bar's value ("Stage 3 of 6, Verify,
 * running") and an ordered list of every stage with its status.
 *
 * Shared by the Mission bar, the agent run bar, the Mission panel and Fleet
 * cards, so every surface draws the same run the same way.
 */
export function StageTrack(props: {
  rows: readonly MissionStageRow[];
  /** Ease the fill and, while a stage runs, let the newest cells shimmer. Off for historical missions and reduced motion. */
  live?: boolean;
  size?: "sm" | "md";
  /** The mission is paused: the current stage reads as waiting, not running. */
  paused?: boolean;
  /** The run's own verdict when its stages do not name it, such as a stopped mission. */
  tone?: StageTone;
  "aria-label"?: string;
}) {
  const { rows, live = true, size = "sm", paused = false, tone } = props;
  const progress = useMemo(() => projectStageProgress(rows, { paused, tone }), [rows, paused, tone]);
  if (!progress) return null;
  const { current } = progress;
  return (
    <div className={sx(styles.container)}>
      <DitherProgress
        value={progress.fraction}
        ticks={progress.ticks}
        tone={progress.tone}
        label={current.stage.title}
        count={progress.count}
        valueText={progress.valueText}
        title={`${progress.count} · ${current.stage.title} — ${progress.statusLabel}`}
        live={live}
        size={size}
        aria-label={props["aria-label"] ? `${props["aria-label"]} progress` : "Stage progress"}
      />
      <ol className={sx(missionStyles.visuallyHidden)} aria-label={props["aria-label"] ?? "Stages"}>
        {rows.map((row) => {
          const heldByPause = paused && row.current && row.status === "running";
          const statusLabel = heldByPause ? "Paused" : STAGE_STATUS_PRESENTATION[row.status].label;
          const asks = row.asksFirst && (row.status === "pending" || row.status === "awaiting-sign-off");
          return (
            <li key={row.stage.id} aria-current={row.current ? "step" : undefined}>
              {row.index + 1}. {row.stage.title} — {statusLabel}
              {asks ? ", asks you first" : ""}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const styles = stylex.create({
  container: { position: "relative", minWidth: 0 },
});

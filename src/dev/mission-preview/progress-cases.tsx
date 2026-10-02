import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { StageTrack } from "@/components/missions/StageTrack";
import type { MissionDetail } from "@/lib/missions/api";
import { projectMissionStages, type StageTone } from "@/lib/missions/mission-view";

/*
 * The stage track in every tone, for the mission preview:
 * `?stavePreview=mission&only=progress`. `w=384` narrows it to the Task panel.
 */

export type ProgressCase = readonly [label: string, detail: MissionDetail, tone?: StageTone];

function Track({ detail, tone, now, size }: { detail: MissionDetail; tone?: StageTone; now: number; size: "sm" | "md" }) {
  const rows = projectMissionStages(detail, new Date(now));
  const { state } = detail.mission;
  return <StageTrack rows={rows} size={size} live={state === "running"} paused={state === "paused"} tone={tone} />;
}

export function StageProgressCases(props: {
  cases: readonly ProgressCase[];
  /** Missions one stage apart, for the eased step. */
  steps: readonly MissionDetail[];
  now: number;
}) {
  const [step, setStep] = useState(0);
  const stepped = props.steps[step % props.steps.length]!;
  return (
    <>
      <section className={sx(styles.case)} data-preview-case="Stage progress">
        <p className={sx(styles.caption)}>Stage track · every tone (sm, as in the composer and Fleet)</p>
        <div className={sx(styles.list)}>
          {props.cases.map(([label, detail, tone]) => (
            <div key={label} className={sx(styles.row)} data-progress-case={label}>
              <span className={sx(styles.label)}>{label}</span>
              <Track detail={detail} tone={tone} now={props.now} size="sm" />
            </div>
          ))}
        </div>
      </section>
      <section className={sx(styles.case)} data-preview-case="Stage progress md">
        <p className={sx(styles.caption)}>Stage track · md, as in the Progress tab</p>
        <div className={sx(styles.list)}>
          {props.cases.slice(0, 3).map(([label, detail, tone]) => (
            <div key={label} className={sx(styles.row)}>
              <span className={sx(styles.label)}>{label}</span>
              <Track detail={detail} tone={tone} now={props.now} size="md" />
            </div>
          ))}
        </div>
      </section>
      <section className={sx(styles.case)} data-preview-case="Stage progress step">
        <div className={sx(styles.stepHeader)}>
          <p className={sx(styles.caption)}>Stage track · live, one stage at a time</p>
          <ActionButton size="xs" onClick={() => setStep((value) => value + 1)}>
            Next stage
          </ActionButton>
        </div>
        <Track detail={stepped} now={props.now} size="sm" />
      </section>
    </>
  );
}

const styles = stylex.create({
  case: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], minWidth: 0 },
  caption: { margin: 0, color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
  },
  row: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], minWidth: 0 },
  label: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-micro"] },
  stepHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
});

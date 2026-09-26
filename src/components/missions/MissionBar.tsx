import { useEffect, useMemo, useRef, useState } from "react";
import { Hand, Target } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import {
  describeCheckIns,
  describeMissionHeadline,
  formatAge,
  projectMissionStages,
  STAGE_STATUS_PRESENTATION,
  type MissionStageRow,
} from "@/lib/missions/mission-view";
import { describeToolActivity, nextNowLine, NOW_LINE_MIN_INTERVAL_MS, type NowLineState } from "@/lib/missions/now-line";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { useAppStore } from "@/store/app.store";
import { StageStatusIcon } from "./StageStatusIcon";
import { useNow, usePrefersReducedMotion, useScopedTaskMission } from "./useMission";
import { missionStyles as styles } from "./missions.styles";

const STAGE_HOLD_MS = 3_000;

/** The phrase for the running turn's latest tool call, or null. */
export function selectNowPhrase(activity: ProviderTurnActivitySnapshot | undefined): string | null {
  if (!activity || activity.completedAt) return null;
  let latest: ProviderTurnActivitySnapshot["workItemsById"][string] | null = null;
  for (const id of activity.orderedWorkItemIds) {
    const item = activity.workItemsById[id];
    if (item?.kind === "tool" && (!latest || item.updatedAt >= latest.updatedAt)) latest = item;
  }
  if (!latest) return "Thinking";
  return describeToolActivity({ toolName: latest.toolName ?? latest.title, detail: latest.detail });
}

/** Holds each phrase for at least the minimum interval. */
function useNowLine(candidate: string | null) {
  const [state, setState] = useState<NowLineState | null>(null);
  useEffect(() => {
    if (!candidate) {
      setState(null);
      return;
    }
    const next = nextNowLine(state, candidate, Date.now());
    if (next !== state) {
      setState(next);
      return;
    }
    if (state && state.text !== candidate) {
      const wait = Math.max(0, state.shownAt + NOW_LINE_MIN_INTERVAL_MS - Date.now());
      const timer = window.setTimeout(() => setState({ text: candidate, shownAt: Date.now() }), wait);
      return () => window.clearTimeout(timer);
    }
  }, [candidate, state]);
  return state?.text ?? null;
}

/** "Build done · 4 files +82 −17", shown briefly when a stage completes. */
function describeCompletedStage(row: MissionStageRow): string {
  const diff = row.record?.facts?.diff;
  const change = diff && diff.filesChanged > 0 ? ` · ${diff.filesChanged} files +${diff.insertions} −${diff.deletions}` : "";
  return `${row.stage.title} done${change}`;
}

export function MissionBarView(props: {
  detail: MissionDetail;
  nowPhrase: string | null;
  now: number;
  reducedMotion: boolean;
}) {
  const { detail, now } = props;
  const { mission } = detail;
  const rows = useMemo(() => projectMissionStages(detail, new Date(now)), [detail, now]);
  const current = rows[mission.currentStageIndex]!;
  const headline = describeMissionHeadline(detail);
  const turnRunning = current.status === "running" && props.nowPhrase !== null;

  // The completed stage holds for a moment before the next takes over.
  const [held, setHeld] = useState<string | null>(null);
  const previousIndex = useRef(mission.currentStageIndex);
  useEffect(() => {
    const before = previousIndex.current;
    previousIndex.current = mission.currentStageIndex;
    if (props.reducedMotion || mission.currentStageIndex <= before) return;
    const finished = rows[before];
    if (!finished || finished.status !== "completed") return;
    setHeld(describeCompletedStage(finished));
    const timer = window.setTimeout(() => setHeld(null), STAGE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [mission.currentStageIndex, props.reducedMotion, rows]);

  // Announce stage changes and sign-off requests only.
  const announcement =
    current.status === "awaiting-sign-off"
      ? `Waiting for your sign-off: ${current.stage.title}`
      : `Stage ${current.index + 1} of ${rows.length}: ${current.stage.title}`;

  const statusText = held ?? (turnRunning ? props.nowPhrase : headline.text);
  // Waits name themselves; only live work and a completed stage take a label.
  const statusLabel = held ? "Done" : turnRunning ? "Now" : null;
  const age = held || turnRunning ? null : formatAge(now - Date.parse(headline.since));
  return (
    <section className={sx(styles.bar)} aria-label={`Mission: ${mission.playbook.name}`} data-testid="mission-bar">
      <div className={sx(styles.barHeader)}>
        <Target aria-hidden className={sx(styles.icon, styles.toneActive)} />
        <span className={sx(styles.barTitle)} title={mission.assignment}>
          {mission.playbook.name} · {mission.assignment.split("\n")[0]}
        </span>
        <span className={sx(styles.barMeta)}>
          {describeCheckIns(mission)} · {formatAge(now - Date.parse(mission.createdAt))}
        </span>
      </div>
      <ol className={sx(styles.stepper)} aria-label="Stages">
        {rows.map((row) => (
          <li
            key={row.stage.id}
            className={sx(styles.step, row.current && styles.stepCurrent)}
            aria-current={row.current ? "step" : undefined}
          >
            <StageStatusIcon tone={STAGE_STATUS_PRESENTATION[row.status].tone} />
            {row.index + 1}. {row.stage.title}
            <span className={sx(styles.visuallyHidden)}> — {STAGE_STATUS_PRESENTATION[row.status].label}</span>
            {row.asksFirst && (row.status === "pending" || row.status === "awaiting-sign-off") ? (
              <Hand aria-label="asks you first" className={sx(styles.icon, styles.toneWaiting)} />
            ) : null}
          </li>
        ))}
      </ol>
      <p className={sx(styles.stepperCompact)}>
        <StageStatusIcon tone={STAGE_STATUS_PRESENTATION[current.status].tone} />
        {current.stage.title} · {current.index + 1} of {rows.length}
      </p>
      <p className={sx(styles.nowRow)}>
        {statusLabel ? <span className={sx(styles.nowLabel)}>{statusLabel}</span> : null}
        <span className={sx(styles.nowText)} title={statusText ?? undefined}>
          {statusText}
          {age ? ` · ${age}` : ""}
        </span>
      </p>
      <p className={sx(styles.visuallyHidden)} aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

/** The Mission bar for the scoped task: shown while its mission is active. */
export function MissionBar() {
  const { detail, taskId } = useScopedTaskMission();
  const active = Boolean(detail && isActiveMissionState(detail.mission.state));
  const nowPhrase = useAppStore((state) =>
    active ? selectNowPhrase(state.providerTurnActivityByTask[taskId]) : null,
  );
  const shownPhrase = useNowLine(nowPhrase);
  const now = useNow(active);
  const reducedMotion = usePrefersReducedMotion();
  if (!detail || !active) return null;
  return <MissionBarView detail={detail} nowPhrase={shownPhrase} now={now} reducedMotion={reducedMotion} />;
}

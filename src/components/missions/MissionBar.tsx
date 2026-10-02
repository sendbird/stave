import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePause, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import {
  describeMissionStatusLine,
  formatAge,
  projectMissionStages,
  type MissionStageRow,
} from "@/lib/missions/mission-view";
import { describeToolActivity, nextNowLine, NOW_LINE_MIN_INTERVAL_MS, type NowLineState } from "@/lib/missions/now-line";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { taskPanelLayoutPatch } from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore } from "@/store/missions-store";
import { isAgentRun } from "@/lib/missions/agent-run";
import { AgentRunBarView } from "./AgentRunBar";
import { useAgentRunActions, type AgentRunActions } from "./useAgentRunActions";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import { useNow, usePrefersReducedMotion, useScopedTaskMission } from "./useMission";
import { missionBarStyles as styles } from "./mission-bar.styles";
import { missionStyles } from "./missions.styles";

const STAGE_HOLD_MS = 3_000;

export const TAKE_OVER_HINT =
  "Your replies guide this stage and the mission carries on. Take over pauses the mission so you can steer it yourself.";

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

/** "4 files +82 −17", for the moment a stage completes. */
function describeCompletedChange(row: MissionStageRow): string | null {
  const diff = row.record?.facts?.diff;
  return diff && diff.filesChanged > 0
    ? `${diff.filesChanged} ${diff.filesChanged === 1 ? "file" : "files"} +${diff.insertions} −${diff.deletions}`
    : null;
}

export interface MissionBarActions {
  onTakeOver?: () => void;
  onResume?: () => void;
  onOpenPanel?: () => void;
  busy?: boolean;
}

type MissionBarViewProps = {
  detail: MissionDetail;
  nowPhrase: string | null;
  now: number;
  reducedMotion: boolean;
  /** `docked` is a shelf over the composer; `panel` a flat header in the Activity panel. */
  variant?: "docked" | "panel";
  /** Docked inside the composer frame, which owns the final tuck. */
  framed?: boolean;
  actions?: MissionBarActions;
  /** What an agent run's bar offers; a playbook mission uses `actions`. */
  agentActions?: AgentRunActions;
};

/** The bar of a mission: the stage track for a playbook, a status line for an agent run. */
export function MissionBarView(props: MissionBarViewProps) {
  return isAgentRun(props.detail.mission) ? (
    <AgentRunBarView {...props} actions={props.agentActions} onOpenPanel={props.actions?.onOpenPanel} />
  ) : (
    <PlaybookMissionBarView {...props} />
  );
}

function PlaybookMissionBarView(props: MissionBarViewProps) {
  const { detail, now, actions = {}, variant = "docked" } = props;
  const { mission } = detail;
  const rows = useMemo(() => projectMissionStages(detail, new Date(now)), [detail, now]);
  const current = rows[mission.currentStageIndex]!;
  const line = describeMissionStatusLine(detail);

  // The completed stage holds for a moment before the next takes over.
  const [held, setHeld] = useState<{ title: string; detail: string | null } | null>(null);
  const previousIndex = useRef(mission.currentStageIndex);
  useEffect(() => {
    const before = previousIndex.current;
    previousIndex.current = mission.currentStageIndex;
    if (props.reducedMotion || mission.currentStageIndex <= before) return;
    const finished = rows[before];
    if (!finished || finished.status !== "completed") return;
    setHeld({ title: `${finished.stage.title} done`, detail: describeCompletedChange(finished) });
  }, [mission.currentStageIndex, props.reducedMotion, rows]);
  // Its own effect: `rows` changes every tick, and must not cancel the release.
  useEffect(() => {
    if (!held) return;
    const timer = window.setTimeout(() => setHeld(null), STAGE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  // Announce stage changes and sign-off requests only.
  const announcement =
    current.status === "awaiting-sign-off"
      ? `Waiting for your sign-off: ${current.stage.title}`
      : `Stage ${current.index + 1} of ${rows.length}: ${current.stage.title}`;

  const showNow = !held && line.live && props.nowPhrase !== null;
  const title = held?.title ?? line.title;
  const state = held ? null : line.state;
  const detailText = held ? held.detail : showNow ? props.nowPhrase : line.detail;
  const age = held || showNow ? null : formatAge(now - Date.parse(line.since));
  const paused = mission.state === "paused";
  const userPaused = paused && (mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over");
  const elapsed = formatAge(now - Date.parse(mission.createdAt));

  return (
    <section
      className={cx(
        variant === "docked" ? "turn-activity-surface" : undefined,
        sx(
          variant === "docked" ? styles.tray : styles.flat,
          variant === "docked" && (props.framed ? styles.trayFramed : styles.trayStandalone),
        ),
      )}
      aria-label={`Mission: ${mission.playbook.name}`}
      title={`${mission.playbook.name} · ${mission.assignment.split("\n")[0]}`}
      data-testid="mission-bar"
    >
      <div className={sx(styles.sizer)}>
        <div className={sx(styles.header)}>
          <span className={sx(styles.mark)}>
            <StageStatusIcon
              tone={held ? "done" : line.tone}
              icon={paused && !held ? CirclePause : undefined}
              xstyle={styles.markIcon}
            />
          </span>
          <p className={sx(styles.headline)}>
            <span className={sx(styles.headlineTitle)}>{title}</span>
            {state ? (
              <span
                className={sx(
                  line.tone === "attention"
                    ? styles.headlineAttention
                    : line.tone === "waiting"
                      ? styles.headlineWaiting
                      : styles.headlineState,
                )}
              >
                {" · "}
                {state}
              </span>
            ) : null}
            {detailText || age ? (
              <span className={sx(styles.headlineDetail)}>
                {detailText ? " · " : ""}
                {showNow && detailText ? (
                  <TextShimmer active={!props.reducedMotion}>{detailText}</TextShimmer>
                ) : (
                  detailText
                )}
                {age ? ` · ${age}` : ""}
              </span>
            ) : null}
          </p>
          {/* Where the mission stands is on the track below; the header keeps its age. */}
          <span className={sx(styles.meta)}>
            <span className={sx(styles.metaWide)} title="Time since the mission started">
              {elapsed}
            </span>
          </span>
          <span className={sx(styles.actions)}>
            {mission.state === "running" && actions.onTakeOver ? (
              <Tooltip content={TAKE_OVER_HINT}>
                <Button
                  variant="quiet"
                  size="xs"
                  disabled={actions.busy}
                  onClick={actions.onTakeOver}
                  xstyle={styles.quietButton}
                >
                  Take over
                </Button>
              </Tooltip>
            ) : null}
            {userPaused && actions.onResume ? (
              <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onResume}>
                Resume
              </Button>
            ) : null}
            {actions.onOpenPanel ? (
              <Tooltip content="Open Progress in the Task panel">
                <Button
                  variant="quiet"
                  size="iconSm"
                  iconOnly
                  aria-label="Open Progress in the Task panel"
                  onClick={actions.onOpenPanel}
                  xstyle={styles.quietButton}
                >
                  <PanelRightOpen aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
          </span>
        </div>
      </div>
      <div className={sx(styles.track)}>
        <StageTrack rows={rows} live={!props.reducedMotion && !paused} paused={paused} />
      </div>
      <p className={sx(missionStyles.visuallyHidden)} aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

/** The Mission bar for the scoped task: shown while its mission is active. */
export function MissionBar(props: { variant?: "docked" | "panel"; framed?: boolean }) {
  const { detail, taskId } = useScopedTaskMission();
  const active = Boolean(detail && isActiveMissionState(detail.mission.state));
  const nowPhrase = useAppStore((state) =>
    active ? selectNowPhrase(state.providerTurnActivityByTask[taskId]) : null,
  );
  const shownPhrase = useNowLine(nowPhrase);
  const now = useNow(active);
  const reducedMotion = usePrefersReducedMotion();
  const runCommand = useMissionsStore((state) => state.runCommand);
  const missionId = detail?.mission.id ?? "";
  const busy = useMissionsStore((state) => Boolean(state.pendingByMission[missionId]));
  const setLayout = useAppStore((state) => state.setLayout);
  const agentActions = useAgentRunActions(detail);
  if (!detail || !active) return null;
  return (
    <MissionBarView
      detail={detail}
      nowPhrase={shownPhrase}
      now={now}
      reducedMotion={reducedMotion}
      variant={props.variant}
      framed={props.framed}
      agentActions={agentActions}
      actions={{
        busy,
        onTakeOver: () => void runCommand("takeOver", { missionId }),
        onResume: () => void runCommand("resume", { missionId }),
        onOpenPanel: () => setLayout({ patch: taskPanelLayoutPatch("progress") }),
      }}
    />
  );
}

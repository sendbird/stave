import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePause } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
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
import { hasAgentOrigin } from "@/lib/missions/agent-run";
import { AgentRunLineView } from "./AgentRunLine";
import { useAgentRunActions, type AgentRunActions } from "./useAgentRunActions";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import { useNow, usePrefersReducedMotion, useScopedTaskMission } from "./useMission";
import {
  resolveShelfTurnAlert,
  type ShelfTodoProgress,
  type ShelfTurnAlert,
} from "@/components/session/composer-shelf/composer-shelf.utils";
import { shelfStyles } from "@/components/session/composer-shelf/composer-shelf.styles";
import {
  describeShelfTurnAlert,
  ShelfRunLine,
  ShelfRunText,
  shelfTurnAlertParts,
  type ShelfRunDetailToggle,
} from "@/components/session/composer-shelf/ShelfRunLine";

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

/** What the composer shelf adds to a mission's line: where its details open, and a one-stage run's to-dos. */
export interface MissionLineShelfProps {
  /** `wide` once the shelf also offers the details inline. */
  panelKeep?: "always" | "wide";
  detailToggle?: ShelfRunDetailToggle | null;
  todo?: ShelfTodoProgress | null;
  reasonShownElsewhere?: boolean;
  /** The turn's stall, steer, retry or failure, said in place of the run's state. */
  turnAlert?: ShelfTurnAlert | null;
}

/** The shelf hands the mission line its turn; the line works out what of it to say. */
export type MissionBarProps = Omit<MissionLineShelfProps, "turnAlert"> & {
  /** The turn the run is in right now, if any. */
  turnActivity?: ProviderTurnActivitySnapshot | null;
  /** A steer was sent and the provider has not taken it yet. */
  steering?: boolean;
};

type MissionBarViewProps = MissionLineShelfProps & {
  detail: MissionDetail;
  nowPhrase: string | null;
  now: number;
  reducedMotion: boolean;
  actions?: MissionBarActions;
  /** What an agent run's line offers; a playbook mission uses `actions`. */
  agentActions?: AgentRunActions;
};

/** A mission's line in the composer shelf: the stage track for a playbook, the agent's status for an agent run. */
export function MissionBarView(props: MissionBarViewProps) {
  return hasAgentOrigin(props.detail.mission) ? (
    <AgentRunLineView {...props} actions={props.agentActions} onOpenPanel={props.actions?.onOpenPanel} />
  ) : (
    <PlaybookMissionBarView {...props} />
  );
}

function PlaybookMissionBarView(props: MissionBarViewProps) {
  const { detail, now, actions = {} } = props;
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
  const alert = held ? null : (props.turnAlert ?? null);
  const announcement =
    current.status === "awaiting-sign-off"
      ? `Waiting for your sign-off: ${current.stage.title}`
      : `${alert ? `${alert.label}, s` : "S"}tage ${current.index + 1} of ${rows.length}: ${current.stage.title}`;

  const showNow = !held && !alert && line.live && props.nowPhrase !== null;
  const title = held?.title ?? line.title;
  const state = held ? null : line.state;
  const detailText = held ? held.detail : showNow ? props.nowPhrase : line.detail;
  const age = held || showNow ? null : formatAge(now - Date.parse(line.since));
  const paused = mission.state === "paused";
  const userPaused = paused && (mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over");
  const elapsed = formatAge(now - Date.parse(mission.createdAt));
  const stateInk =
    line.tone === "attention"
      ? shelfStyles.labelDanger
      : line.tone === "waiting"
        ? shelfStyles.labelWaiting
        : shelfStyles.strong;

  return (
    <ShelfRunLine
      testId="mission-bar"
      dataState={held ? "done" : line.tone}
      ariaLabel={`Mission: ${mission.playbook.name}`}
      announcement={announcement}
      mark={
        <StageStatusIcon
          tone={held ? "done" : line.tone}
          icon={paused && !held ? CirclePause : undefined}
          xstyle={shelfStyles.markIcon}
        />
      }
      text={
        <ShelfRunText
          label={title}
          // The line spends its width on the present; identity is in the title.
          title={[mission.playbook.name, alert ? describeShelfTurnAlert(alert) : null, mission.assignment.split("\n")[0]]
            .filter(Boolean)
            .join(" · ")}
          narrow={`${current.index + 1}/${rows.length}`}
          parts={
            alert
              ? shelfTurnAlertParts(alert)
              : [
                  state ? <span className={sx(stateInk)}>{state}</span> : null,
                  showNow && detailText ? (
                    <TextShimmer active={!props.reducedMotion}>{detailText}</TextShimmer>
                  ) : (
                    detailText
                  ),
                  age,
                ]
          }
        />
      }
      progress={
        <span className={sx(shelfStyles.track)}>
          <StageTrack rows={rows} live={!props.reducedMotion && !paused} paused={paused} showPercent={false} />
        </span>
      }
      meta={<span title="Time since the mission started">{elapsed}</span>}
      actions={
        <>
          {mission.state === "running" && actions.onTakeOver ? (
            <Tooltip content={TAKE_OVER_HINT}>
              <Button
                variant="quiet"
                size="xs"
                disabled={actions.busy}
                onClick={actions.onTakeOver}
                xstyle={shelfStyles.quiet}
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
        </>
      }
      panel={
        actions.onOpenPanel
          ? { label: "Open Progress in the Task panel", onOpen: actions.onOpenPanel, keep: props.panelKeep ?? "always" }
          : null
      }
      detail={props.detailToggle ?? null}
    />
  );
}

/**
 * The run line of the scoped task's active mission, or nothing. The composer
 * shelf mounts it whenever one is active, between turns included.
 */
export function MissionBar(props: MissionBarProps) {
  const { turnActivity = null, steering = false, ...shelf } = props;
  const { detail, taskId } = useScopedTaskMission();
  const active = Boolean(detail && isActiveMissionState(detail.mission.state));
  // A stall names how long it has been quiet, so it ticks by the second.
  const stalledAt = active && turnActivity?.completedAt == null ? (turnActivity?.stalledAt ?? null) : null;
  const turnNow = useNow(stalledAt != null, 1_000);
  const turnAlert = active
    ? resolveShelfTurnAlert({
        activity: turnActivity,
        steering,
        // The first render of a stall comes before the clock's first tick.
        now: Math.max(turnNow, stalledAt ?? 0),
      })
    : null;
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
      {...shelf}
      turnAlert={turnAlert}
      detail={detail}
      nowPhrase={shownPhrase}
      now={now}
      reducedMotion={reducedMotion}
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

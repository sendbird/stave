import { useMemo } from "react";
import { Button } from "@/components/ads/components/Button";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { AGENT_RUN_STATE_TONES, agentRunDuration, describeAgentRunStatus } from "@/lib/missions/agent-run-view";
import { projectMissionStages } from "@/lib/missions/mission-view";
import type { ShelfTodoProgress, ShelfTurnAlert } from "@/components/session/composer-shelf/composer-shelf.utils";
import { shelfStyles } from "@/components/session/composer-shelf/composer-shelf.styles";
import {
  describeShelfTurnAlert,
  ShelfRunLine,
  ShelfRunText,
  ShelfTodoProgressView,
  shelfTurnAlertParts,
  type ShelfRunDetailToggle,
} from "@/components/session/composer-shelf/ShelfRunLine";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import type { AgentRunActions } from "./useAgentRunActions";

export const TAKE_CONTROL_HINT = "Ends the run and keeps this task in Chat, on the model the agent was using.";

/**
 * An agent run's line in the composer shelf: the agent, where it stands
 * (`Working`, or `Needs you` with what it waits on), how long it has run,
 * Stop and Take control, and Retry while the run is stuck. While the run is
 * active this line is the one place its state and actions show; the
 * transcript card waits for the run to end. A run of an agent with a workflow
 * draws its stages as the compact track (the stage and `2/4` once the
 * composer is too narrow for it); a one-stage run shows its turn's to-dos.
 * While its turn stalls, steers, retries or fails, that tone takes the place
 * of the run's state, in the turn line's own words.
 */
export function AgentRunBarView(props: {
  detail: MissionDetail;
  nowPhrase: string | null;
  now: number;
  reducedMotion: boolean;
  actions?: AgentRunActions;
  onOpenPanel?: () => void;
  /** `wide` once the shelf also offers the details inline. */
  panelKeep?: "always" | "wide";
  detailToggle?: ShelfRunDetailToggle | null;
  /** A one-stage run's progress is its turn's to-do list. */
  todo?: ShelfTodoProgress | null;
  /** The card above the composer already asks (a sign-off), so the line names the state only. */
  reasonShownElsewhere?: boolean;
  /** The turn's stall, steer, retry or failure, said instead of the run's state. */
  turnAlert?: ShelfTurnAlert | null;
}) {
  const { detail, actions = {} } = props;
  const status = describeAgentRunStatus(detail);
  const alert = props.turnAlert ?? null;
  const showNow = !alert && status.state === "working" && props.nowPhrase !== null;
  const reason = status.state === "needs-you" && !props.reasonShownElsewhere && !alert ? status.reason : null;
  const elapsed = agentRunDuration(detail, props.now);
  const staged = detail.mission.playbook.stages.length > 1;
  const rows = useMemo(
    () => (staged ? projectMissionStages(detail, new Date(props.now)) : null),
    [detail, props.now, staged],
  );
  const current = rows?.[detail.mission.currentStageIndex] ?? null;
  const paused = detail.mission.state === "paused";
  const waiting = status.state === "needs-you";
  const stageWords = current && rows ? `${current.stage.title} ${current.index + 1}/${rows.length}` : null;
  return (
    <ShelfRunLine
      testId="agent-run-bar"
      dataState={status.state}
      ariaLabel={`${status.agentName}: ${status.label}`}
      announcement={`${status.agentName}: ${alert ? alert.label : status.label}${current ? `, stage ${current.index + 1} of ${rows!.length}: ${current.stage.title}` : ""}`}
      mark={
        <StageStatusIcon
          tone={AGENT_RUN_STATE_TONES[status.state]}
          state={status.state}
          xstyle={shelfStyles.markIcon}
        />
      }
      text={
        <ShelfRunText
          label={status.agentName}
          title={[
            status.agentName,
            stageWords,
            alert ? describeShelfTurnAlert(alert) : status.label,
            showNow ? props.nowPhrase : reason,
            detail.mission.assignment.split("\n")[0],
          ]
            .filter(Boolean)
            .join(" · ")}
          narrow={stageWords}
          parts={
            alert
              ? shelfTurnAlertParts(alert)
              : [
                  <span className={sx(waiting ? shelfStyles.labelWaiting : shelfStyles.strong)}>{status.label}</span>,
                  showNow ? (
                    <TextShimmer active={!props.reducedMotion}>{props.nowPhrase}</TextShimmer>
                  ) : (
                    reason
                  ),
                ]
          }
        />
      }
      progress={
        rows ? (
          <span className={sx(shelfStyles.track)}>
            <StageTrack rows={rows} live={!props.reducedMotion && !paused} paused={paused} showPercent={false} />
          </span>
        ) : props.todo ? (
          <ShelfTodoProgressView progress={props.todo} />
        ) : null
      }
      meta={<span title="Time since the run started">{elapsed}</span>}
      actions={
        <>
          {status.recovery === "retry-stage" && actions.onRetry ? (
            <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onRetry}>
              Retry
            </Button>
          ) : null}
          {actions.onStop ? (
            <Button variant="quiet" size="xs" disabled={actions.busy} onClick={actions.onStop} xstyle={shelfStyles.quiet}>
              Stop
            </Button>
          ) : null}
          {actions.onTakeControl ? (
            <Tooltip content={TAKE_CONTROL_HINT}>
              <Button
                variant="quiet"
                size="xs"
                disabled={actions.busy}
                onClick={actions.onTakeControl}
                xstyle={shelfStyles.quiet}
              >
                Take control
              </Button>
            </Tooltip>
          ) : null}
        </>
      }
      panel={
        props.onOpenPanel
          ? { label: "Open Progress in the Task panel", onOpen: props.onOpenPanel, keep: props.panelKeep ?? "always" }
          : null
      }
      detail={props.detailToggle ?? null}
    />
  );
}

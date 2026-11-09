import { Play } from "lucide-react";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Button } from "@/components/aui/components/Button";
import { TextShimmer } from "@/components/aui/components/TextShimmer";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  agentRunClockRunning,
  agentRunDuration,
  describeAgentRunStatus,
  formatAgentRunBadge,
  type AgentRunDecision,
} from "@/lib/agent-runs/agent-run-status";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { describeSubagentSummary } from "@/lib/delegation/subagent-summary";
import {
  describeDelegatedWait,
  describeEventWaitCheck,
  describeEventWaitSince,
  type WaitLivenessNote,
} from "@/lib/agent-runs/wait-liveness";
import { projectAgentRunStages } from "@/lib/agent-runs/agent-run-view";
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
import { ElapsedClock } from "./ElapsedClock";
import { ShelfSubagentLine } from "./ShelfSubagentLine";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import type { AgentRunActions } from "./useAgentRunActions";
import { describeRunPlan } from "@/lib/agent-runs/progress";
import { agentRunStoredPlan } from "@/lib/agent-runs/agent-run-status";
import type { StagePlan } from "@/lib/agent-runs/domain";

export const TAKE_CONTROL_HINT = "agentRuns:agentRunLine.tAKECONTROLHINT";

/**
 * An agent run's line in the composer shelf: the agent, its badge (`Running`,
 * or `Halted · Blocked` with what it waits on), how long it has run,
 * Stop and Take control, and Retry while the run is stuck. While the run is
 * active this line is the one place its state and actions show; the
 * transcript card waits for the run to end. A run of an agent with a workflow
 * draws its stages as the compact track (the stage and `2/4` once the
 * composer is too narrow for it); a one-stage run shows its turn's to-dos.
 * While its turn stalls, steers, retries or fails, that tone takes the place
 * of the run's state, in the turn line's own words.
 */
export function AgentRunLineView(props: {
  detail: AgentRunDetail;
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
  plan?: StagePlan | null;
  /** The run's delegates, each with its live state, on a line under the run's. */
  subagents?: readonly DelegationExchange[] | null;
  /** The ledger rows behind the delegates, for whether delegated work should have woken the run. */
  delegatedChildren?: readonly DelegatedTaskSummary[] | null;
  /** The card above the composer already asks (a sign-off), so the line names the state only. */
  reasonShownElsewhere?: boolean;
  /** The turn's stall, steer, retry or failure, said instead of the run's state. */
  turnAlert?: ShelfTurnAlert | null;
  /** The question or approval card the lead task holds open. */
  decision?: AgentRunDecision | null;
}) {
  useTranslation();
  const { detail, actions = {} } = props;
  const status = describeAgentRunStatus(detail, props.decision ?? null);
  const badgeText = formatAgentRunBadge(status);
  // A usage-limit pause resumes by hand whether or not its reset time is known.
  const usagePaused = detail.agentRun.state === "paused" && detail.agentRun.pauseReason === "usage-limit";
  // The event it waited for never came: Continue tells the agent and goes on.
  const waitExpired = detail.agentRun.state === "paused" && detail.agentRun.pauseReason === "wait-expired";
  const alert = detail.agentRun.pauseReason === "usage-limit" ? null : props.turnAlert ?? null;
  // A turn is doing the work: no wait, no pause, nothing for the user to answer.
  const progressing = status.badge === "running" && !status.waiting;
  const showNow = !alert && progressing && props.nowPhrase !== null;
  const reason = !progressing && !props.reasonShownElsewhere && !alert ? status.reason : null;
  // A wait's mark does not move, so its count and last check say it is alive.
  const eventWait = status.eventWait;
  const waited = eventWait ? describeEventWaitSince(eventWait, props.now) : null;
  const waitCheck = eventWait ? describeEventWaitCheck(eventWait, props.now, detail.eventWaitObservedAt) : null;
  // A delegate that needs the user is said on the run's own line, whatever the run is doing.
  // The ledger may list delegated work the run's own rows leave out (work started before the run).
  const delegateNote = props.subagents?.length || props.delegatedChildren?.length
    ? describeDelegatedWait({
        wait: eventWait,
        rows: props.subagents ?? [],
        children: props.delegatedChildren ?? undefined,
        parentTaskId: detail.agentRun.leadTaskId,
        now: props.now,
      })
    : null;
  const subagentText = props.subagents?.length ? describeSubagentSummary(props.subagents) : null;
  const staged = detail.agentRun.workflow.stages.length > 1;
  const plan = props.plan ?? agentRunStoredPlan(detail);
  const planText = staged || !plan?.items.length ? null : describeRunPlan(plan);
  // Beside the to-do segment, which already counts, the line says only the
  // step it is on; without one it says the count and the step in words.
  const planWords = props.todo
    ? (planText ? (plan?.items.find((item) => item.status === "in_progress")?.content ?? null) : null)
    : planText;
  // While the run just works, the step leads the line as it does for a turn;
  // the agent's name stays in the title and the announcement.
  const stepLeads = Boolean(props.todo && planWords && progressing && !alert);
  const rows = useMemo(
    () => (staged ? projectAgentRunStages(detail, new Date(props.now)) : null),
    [detail, props.now, staged, i18n.language],
  );
  const current = rows?.[detail.agentRun.currentStageIndex] ?? null;
  const paused = detail.agentRun.state === "paused";
  // Needs your answer and Halted wait on the user, in the warning ink.
  const attention = status.badge === "needs-answer" || status.badge === "halted";
  const stageWords = current && rows ? `${getStageDisplayTitle(current.stage)} ${current.index + 1}/${rows.length}` : null;
  return (
    <>
      <ShelfRunLine
        testId="agent-run-bar"
        dataState={status.badge}
        ariaLabel={`${status.agentName}: ${badgeText}`}
        announcement={`${status.agentName}: ${alert ? alert.label : badgeText}${!alert && delegateNote?.tone === "warning" ? `, ${delegateNote.text}` : ""}${current ? i18n.t("agentRuns:agentRunLine.extraCopy2", { value1: current.index + 1, value2: rows!.length, value3: getStageDisplayTitle(current.stage) }) : planText ? `, ${planText}` : ""}`}
        mark={
          <StageStatusIcon
            tone={status.mark.tone}
            state={status.mark.state}
            moving
            xstyle={shelfStyles.markIcon}
          />
        }
        text={
          <ShelfRunText
            label={stepLeads ? planWords : status.waiting ? badgeText : status.agentName}
            title={[
              status.agentName,
              stageWords,
              planText,
              subagentText,
              alert ? describeShelfTurnAlert(alert) : badgeText,
              delegateNote?.text,
              waitCheck?.text,
              showNow ? props.nowPhrase : reason,
              detail.agentRun.assignment.split("\n")[0],
            ]
              .filter(Boolean)
              .join(" · ")}
            narrow={stageWords}
            parts={
              alert
                ? shelfTurnAlertParts(alert)
                : [
                    !status.waiting && (!planWords || !progressing) ? <span key="badge" className={sx(attention ? shelfStyles.labelWaiting : shelfStyles.strong)}>{badgeText}</span> : null,
                    noteNode(delegateNote, "delegate"),
                    noteNode(waitCheck, "check"),
                    reason ?? (stepLeads ? null : planWords && props.todo ? <span key="plan" className={sx(shelfStyles.strong)}>{planWords}</span> : planWords) ?? (showNow ? (
                      <TextShimmer key="now" active={!props.reducedMotion}>{props.nowPhrase}</TextShimmer>
                    ) : (
                      progressing && !staged && !stepLeads ? i18n.t("agentRuns:agentRunLine.extraCopy3") : reason
                    )),
                  ]
            }
          />
        }
        progress={
          rows ? (
            <span className={sx(shelfStyles.track)}>
              <StageTrack rows={rows} paused={paused} showPercent={false} />
            </span>
          ) : props.todo ? (
            <ShelfTodoProgressView progress={props.todo} />
          ) : null
        }
        meta={
          status.waiting ? (
            waited ? <span data-testid="agent-run-waited" title={waited.title}>{waited.text}</span> : null
          ) : (
            <span title={i18n.t(detail.activeTime ? "agentRuns:activeTime.explain" : "agentRuns:agentRunLine.title")}>
              {/* The span reads to the second on the shared clock; the line keeps its slower one. */}
              <ElapsedClock live={agentRunClockRunning(detail)} now={props.now}>
                {(clock) => agentRunDuration(detail, clock)}
              </ElapsedClock>
            </span>
          )
        }
        actions={
          <>
            {status.recovery === "retry-stage" && actions.onRetry ? (
              <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onRetry}>
                {i18n.t("agentRuns:agentRunLine.actions")}</Button>
            ) : null}
            {status.recovery === "extend" && actions.onExtend ? (
              <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onExtend}>
                {i18n.t("agentRuns:limit.extend")}
              </Button>
            ) : null}
            {usagePaused && actions.onResume ? (
              <Tooltip content={i18n.t("agentRuns:usageLimit.resumeNow")}>
                <Button variant="secondary" size="xs" aria-label={i18n.t("agentRuns:usageLimit.resumeNow")} disabled={actions.busy} onClick={actions.onResume}>
                  <Play aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
            {waitExpired && actions.onResume ? (
              <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onResume}>
                {i18n.t("agentRuns:eventWait.resume")}
              </Button>
            ) : null}
            {actions.onStop ? (
              <Button variant="quiet" size="xs" disabled={actions.busy} onClick={actions.onStop} xstyle={shelfStyles.quiet}>
                {i18n.t("agentRuns:agentRunLine.actions2")}</Button>
            ) : null}
            {actions.onTakeControl ? (
              <Tooltip content={i18n.t(TAKE_CONTROL_HINT)}>
                <Button
                  variant="quiet"
                  size="xs"
                  disabled={actions.busy}
                  onClick={actions.onTakeControl}
                  xstyle={[shelfStyles.quiet, status.waiting && shelfStyles.wideOnly]}
                >
                  {i18n.t("agentRuns:agentRunLine.actions3")}</Button>
              </Tooltip>
            ) : null}
        </>
      }
      panel={
        props.onOpenPanel
          ? { label: i18n.t("agentRuns:agentRunLine.label"), onOpen: props.onOpenPanel, keep: props.panelKeep ?? "always" }
          : null
      }
      detail={props.detailToggle ?? null}
    />
    {props.subagents?.length ? <ShelfSubagentLine rows={props.subagents} reducedMotion={props.reducedMotion} moving={!showNow} /> : null}
    </>
  );
}

/** A liveness note as a part of the line: the warning ones in the warning ink. */
function noteNode(note: WaitLivenessNote | null, key: string) {
  if (!note) return null;
  return note.tone === "warning"
    ? <span key={key} data-testid={`agent-run-note-${key}`} className={sx(shelfStyles.labelWaiting)}>{note.text}</span>
    : <span key={key} data-testid={`agent-run-note-${key}`}>{note.text}</span>;
}

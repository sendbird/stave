import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePause } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import {
  describeAgentRunStatusLine,
  formatAge,
  projectAgentRunStages,
  type AgentRunStageRow,
} from "@/lib/agent-runs/agent-run-view";
import { describeToolActivity, nextNowLine, NOW_LINE_MIN_INTERVAL_MS, type NowLineState } from "@/lib/agent-runs/now-line";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { taskPanelLayoutPatch } from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";
import { useAgentRunsStore } from "@/store/agent-runs-store";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { AgentRunLineView } from "./AgentRunLine";
import { useAgentRunActions, type AgentRunActions } from "./useAgentRunActions";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import { useNow, usePrefersReducedMotion, useScopedTaskAgentRun } from "./useAgentRun";
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
  "Your replies guide this stage and the run carries on. Take over pauses the run so you can steer it yourself.";

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
function describeCompletedChange(row: AgentRunStageRow): string | null {
  const diff = row.record?.facts?.diff;
  return diff && diff.filesChanged > 0
    ? `${diff.filesChanged} ${diff.filesChanged === 1 ? "file" : "files"} +${diff.insertions} −${diff.deletions}`
    : null;
}

export interface AgentRunBarActions {
  onTakeOver?: () => void;
  onResume?: () => void;
  onOpenPanel?: () => void;
  busy?: boolean;
}

/** What the composer shelf adds to an agent run's line: where its details open, and a one-stage run's to-dos. */
export interface AgentRunLineShelfProps {
  /** `wide` once the shelf also offers the details inline. */
  panelKeep?: "always" | "wide";
  detailToggle?: ShelfRunDetailToggle | null;
  todo?: ShelfTodoProgress | null;
  plan?: import("@/lib/agent-runs/domain").StagePlan | null;
  subagents?: string | null;
  reasonShownElsewhere?: boolean;
  /** The turn's stall, steer, retry or failure, said in place of the run's state. */
  turnAlert?: ShelfTurnAlert | null;
}

/** The shelf hands the agent run line its turn; the line works out what of it to say. */
export type AgentRunBarProps = Omit<AgentRunLineShelfProps, "turnAlert"> & {
  /** The turn the run is in right now, if any. */
  turnActivity?: ProviderTurnActivitySnapshot | null;
  /** A steer was sent and the provider has not taken it yet. */
  steering?: boolean;
};

type AgentRunBarViewProps = AgentRunLineShelfProps & {
  detail: AgentRunDetail;
  nowPhrase: string | null;
  now: number;
  reducedMotion: boolean;
  actions?: AgentRunBarActions;
  /** What an agent run's line offers; a legacy run uses `actions`. */
  agentActions?: AgentRunActions;
};

/** An agent run's line in the composer shelf: the stage track for a workflow, the agent's status for an agent run. */
export function AgentRunBarView(props: AgentRunBarViewProps) {
  return hasAgentOrigin(props.detail.agentRun) ? (
    <AgentRunLineView {...props} actions={props.agentActions} onOpenPanel={props.actions?.onOpenPanel} />
  ) : (
    <LegacyWorkflowRunBarView {...props} />
  );
}

function LegacyWorkflowRunBarView(props: AgentRunBarViewProps) {
  const { detail, now, actions = {} } = props;
  const { agentRun } = detail;
  const rows = useMemo(() => projectAgentRunStages(detail, new Date(now)), [detail, now]);
  const current = rows[agentRun.currentStageIndex]!;
  const line = describeAgentRunStatusLine(detail);

  // The completed stage holds for a moment before the next takes over.
  const [held, setHeld] = useState<{ title: string; detail: string | null } | null>(null);
  const previousIndex = useRef(agentRun.currentStageIndex);
  useEffect(() => {
    const before = previousIndex.current;
    previousIndex.current = agentRun.currentStageIndex;
    if (props.reducedMotion || agentRun.currentStageIndex <= before) return;
    const finished = rows[before];
    if (!finished || finished.status !== "completed") return;
    setHeld({ title: `${finished.stage.title} done`, detail: describeCompletedChange(finished) });
  }, [agentRun.currentStageIndex, props.reducedMotion, rows]);
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
  const paused = agentRun.state === "paused";
  const userPaused = paused && (agentRun.pauseReason === "paused-by-user" || agentRun.pauseReason === "taken-over");
  const elapsed = formatAge(now - Date.parse(agentRun.createdAt));
  const stateInk =
    line.tone === "attention"
      ? shelfStyles.labelDanger
      : line.tone === "waiting"
        ? shelfStyles.labelWaiting
        : shelfStyles.strong;

  return (
    <ShelfRunLine
      testId="agent-run-bar"
      dataState={held ? "done" : line.tone}
      ariaLabel={`Run: ${agentRun.workflow.name}`}
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
          title={[agentRun.workflow.name, alert ? describeShelfTurnAlert(alert) : null, agentRun.assignment.split("\n")[0]]
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
      meta={<span title="Time since the run started">{elapsed}</span>}
      actions={
        <>
          {agentRun.state === "running" && actions.onTakeOver ? (
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
 * The run line of the scoped task's active agent run, or nothing. The composer
 * shelf mounts it whenever one is active, between turns included.
 */
export function AgentRunBar(props: AgentRunBarProps) {
  const { turnActivity = null, steering = false, ...shelf } = props;
  const { detail, taskId } = useScopedTaskAgentRun();
  const active = Boolean(detail && isActiveAgentRunState(detail.agentRun.state));
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
  const runCommand = useAgentRunsStore((state) => state.runCommand);
  const agentRunId = detail?.agentRun.id ?? "";
  const busy = useAgentRunsStore((state) => Boolean(state.pendingByAgentRun[agentRunId]));
  const setLayout = useAppStore((state) => state.setLayout);
  const agentActions = useAgentRunActions(detail);
  if (!detail || !active) return null;
  return (
    <AgentRunBarView
      {...shelf}
      turnAlert={turnAlert}
      detail={detail}
      nowPhrase={shownPhrase}
      now={now}
      reducedMotion={reducedMotion}
      agentActions={agentActions}
      actions={{
        busy,
        onTakeOver: () => void runCommand("takeOver", { agentRunId }),
        onResume: () => void runCommand("resume", { agentRunId }),
        onOpenPanel: () => setLayout({ patch: taskPanelLayoutPatch("progress") }),
      }}
    />
  );
}

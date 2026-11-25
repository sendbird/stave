import { ChartNoAxesGantt, ScrollText } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import { Button } from "@/components/ui";
import { AgentLine } from "@/components/aui/components/AgentSummary";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { Loader } from "@/components/aui/components/Loader";
import { runStyles, type RunMonitorSegment } from "@/components/aui/components/RunMonitor";
import { ProgressStrip } from "@/components/aui/components/RunMonitor.parts";
import { StateMark } from "@/components/aui/components/StateMark";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { AgentHighlight, AgentTextSwap } from "@/components/aui/components/agent-motion";
import { isLiveRunState } from "@/components/aui/components/ToolRun.parts";
import { agentMotion } from "@/components/aui/recipes/agent-motion";
import { textShimmer } from "@/components/aui/recipes/text-shimmer";
import type { AgentStepState } from "@/components/aui/components/agent-state";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { sx } from "@/components/aui/utils/stylex";
import { ElapsedClock } from "@/components/agent-runs/ElapsedClock";
import { useNow } from "@/components/agent-runs/useAgentRun";
import type { TarsRunProgress } from "@/lib/tars/flow-model";
import { tarsStageSegments, tarsStepCount, type TarsStageSegment } from "@/lib/tars/tray-model";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsMonitorStyles as styles } from "./tars-monitor.styles";

type TarsState = TarsResponsibility["state"];

/** A Tars state drawn in the design system's work-state vocabulary. */
export const WORK_STATE_OF: Record<TarsState, WorkState> = {
  queued: "queued", preparing: "queued", running: "working", waiting: "waiting", paused: "paused",
  resultReady: "waiting", completed: "ready", blocked: "halted", cancelled: "stopped", takenOver: "idle",
};

/** The run lifecycle a Tars state stands for: only `running` is live (spinner, moving strip). */
const RUN_STATE_OF: Record<TarsState, AgentStepState> = {
  queued: "queued", preparing: "pending", running: "running", waiting: "pending", paused: "interrupted",
  resultReady: "pending", completed: "completed", blocked: "interrupted", cancelled: "canceled", takenOver: "interrupted",
};

const SEGMENT_OF: Record<TarsStageSegment, RunMonitorSegment["state"]> = { finished: "done", current: "now", pending: "pending", stopped: "stopped" };

/**
 * The chip tone of each state. Running, waiting, blocked and completed never
 * share a tone: running alone wears a hue, the running stage's tone (as the
 * flow's stage chip does); blocked wears the warning, completed the success.
 * Waiting, queued, paused and taken-over work stays neutral, told apart by its
 * glyph and word, so no theme where accent and info share a hue can make
 * taken-over work read as running.
 */
export function stateTone(state: TarsState): BadgeTone {
  return state === "running" ? "info" : state === "completed" ? "success" : state === "blocked" ? "warning" : "neutral";
}

/**
 * A state's mark alone, for lines that say the state in words elsewhere. Only
 * running work moves (the vocabulary's one moving state); reduced motion
 * settles it on its glyph.
 */
export function TarsWorkMark({ state, size = "xs", label }: { state: TarsState; size?: "xs" | "sm"; label?: string }) {
  return <StateMark state={WORK_STATE_OF[state]} size={size} motion={state === "running" ? "moving" : "still"} label={label} />;
}

/** The state tag every Tars surface shares with the run panel and Agents: the AUI status chip, the state mark (moving only while running) and the state's word. */
export function TarsStateTag({ state }: { state: TarsState }) {
  const { t } = useTranslation(["shell"]);
  return <Badge size="md" tone={stateTone(state)} xstyle={styles.stateTag} data-tars-state={state}>
    <TarsWorkMark state={state} />
    {/* The word fades over when the state changes (agent motion); a remount shows it settled. */}
    <AgentTextSwap swapKey={state}>{t(`shell:tars.states.${state}`)}</AgentTextSwap>
  </Badge>;
}

/**
 * The run's stages inside a work card's detail, in the design system's run
 * vocabulary (AUI `RunMonitor`'s well and strip): the stage it is on with a
 * live elapsed clock in the "now" well, then one labelled segment per stage.
 * A value the run did not record (a start time, the stage count) is left out,
 * never shown as zero; work without a read run shows nothing.
 */
export function TarsRunStages({ row, progress }: { row: Pick<TarsResponsibility, "id" | "title" | "state">; progress?: TarsRunProgress | null }) {
  const { t } = useTranslation(["shell"]);
  const staged = progress && progress.total > 0 ? progress : null;
  const current = staged?.current ?? null;
  const started = current?.startedAt ? Date.parse(current.startedAt) : Number.NaN;
  const timed = Number.isFinite(started);
  const now = useNow(timed);
  if (!staged) return null;
  const live = isLiveRunState(RUN_STATE_OF[row.state]);
  const step = current
    ? current.attempt > 1 ? t("shell:tars.tray.monitor.currentAttempt", { title: current.title, attempt: current.attempt }) : t("shell:tars.tray.monitor.current", { title: current.title })
    : null;
  const stepKey = current ? `${current.id}:${current.attempt}` : undefined;
  const segments = tarsStageSegments(staged);
  return <div className={sx(styles.stages)} data-tars-monitor={row.id} data-run-status={RUN_STATE_OF[row.state]}>
    {step ? <div className={sx(runStyles.well, runStyles.now, agentMotion.layerHost)}>
      {/* A new live step is highlighted once; a settled one stays still. */}
      {live ? <AgentHighlight highlightKey={stepKey} /> : null}
      <AgentLine
        status={live ? <span aria-hidden className={sx(runStyles.nowMark)}><Loader aria-hidden size="xs" tone="inherit" variant="spinner" /></span>
          : <span aria-hidden className={sx(runStyles.nowMarkSettled)}><StateMark motion="still" size="sm" state={WORK_STATE_OF[row.state]} /></span>}
        title={<AgentTextSwap swapKey={stepKey} truncate xstyle={live ? textShimmer.sweep : undefined}><span data-tars-monitor-step="">{step}</span></AgentTextSwap>}
        facts={timed ? <span className={sx(runStyles.clock)}><ElapsedClock live now={now}>{(clock) => {
          const duration = formatDuration(clock - started);
          return <span role="timer" aria-label={t("shell:tars.tray.monitor.elapsedLabel", { duration })} data-tars-monitor-elapsed="">{duration}</span>;
        }}</ElapsedClock></span> : null}
      />
    </div> : null}
    <ProgressStrip live={live} progress={{
      completed: staged.finished, total: staged.total,
      stripLabel: t("shell:tars.tray.monitor.stagesLabel", { title: row.title }),
      segments: staged.stages.map((stage, index) => ({ state: SEGMENT_OF[segments[index]!], label: t(`shell:tars.tray.monitor.segment.${segments[index]!}`, { title: stage.title }) })),
    }} />
  </div>;
}

/** The bare "2/3" of a staged run: what it counts is in its hint on hover and, read aloud, in words. Nothing for work without stages. */
export function TarsStepCount({ progress }: { progress?: TarsRunProgress | null }) {
  const { t } = useTranslation(["shell"]);
  const count = progress && progress.total > 0 ? tarsStepCount(progress) : null;
  if (!count) return null;
  return <Tooltip content={t("shell:tars.tray.monitor.stepCountLabel", count)}>
    <span className={sx(styles.count)} data-tars-monitor-count={`${count.position}/${count.total}`}>
      <span aria-hidden>{t("shell:tars.tray.monitor.stepCount", count)}</span><VisuallyHidden>{t("shell:tars.tray.monitor.stepCountLabel", count)}</VisuallyHidden>
    </span></Tooltip>;
}

/**
 * The work's views as icon buttons named by their tooltip: what the work was
 * handed (its request), readable in every state and before its run exists,
 * and the run's timeline once it has stages. Each keeps its full accessible name.
 */
export function TarsWorkViews({ row, progress, onOpenSide }: {
  row: Pick<TarsResponsibility, "id" | "title">; progress?: TarsRunProgress | null; onOpenSide: (target: TarsSideViewTarget) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const current = progress && progress.total > 0 ? progress.current : null;
  return <span className={sx(styles.views)} data-tars-monitor-views="">
    <Tooltip content={t("shell:tars.tray.monitor.brief")}>
      <Button variant="ghost" size="icon-xs" aria-label={t("shell:tars.tray.monitor.briefLabel", { title: row.title })} data-tars-monitor-brief={row.id}
        onClick={() => onOpenSide({ responsibilityId: row.id, kind: "brief" })}><ScrollText aria-hidden /></Button>
    </Tooltip>
    {progress && progress.total > 0 ? <Tooltip content={t("shell:tars.tray.monitor.timeline")}>
      <Button variant="ghost" size="icon-xs" aria-label={t("shell:tars.tray.monitor.timelineLabel", { title: row.title })} data-tars-monitor-timeline={row.id}
        onClick={() => onOpenSide({ responsibilityId: row.id, kind: "timeline", ...(current ? { focus: { stageId: current.id } } : {}) })}><ChartNoAxesGantt aria-hidden /></Button>
    </Tooltip> : null}
  </span>;
}

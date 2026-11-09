import type { ReactNode } from "react";
import { ChartNoAxesGantt } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDuration } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { RunMonitor, type RunMonitorSegment } from "@/components/aui/components/RunMonitor";
import { StateMark } from "@/components/aui/components/StateMark";
import { AgentTextSwap } from "@/components/aui/components/agent-motion";
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
const WORK_STATE_OF: Record<TarsState, WorkState> = {
  queued: "queued", preparing: "queued", running: "working", waiting: "waiting", paused: "paused",
  completed: "ready", blocked: "halted", cancelled: "stopped", takenOver: "idle",
};

/** The run lifecycle a Tars state stands for: only `running` is live (spinner, moving strip). */
const RUN_STATE_OF: Record<TarsState, AgentStepState> = {
  queued: "queued", preparing: "pending", running: "running", waiting: "pending", paused: "interrupted",
  completed: "completed", blocked: "interrupted", cancelled: "canceled", takenOver: "interrupted",
};

const SEGMENT_OF: Record<TarsStageSegment, RunMonitorSegment["state"]> = { finished: "done", current: "now", pending: "pending", stopped: "stopped" };

export function stateTone(state: TarsState): BadgeTone {
  return state === "completed" ? "success" : state === "blocked" ? "warning" : state === "takenOver" ? "accent" : "neutral";
}

/** The state tag every Tars surface shares with the run panel and Agents: the AUI status chip, a still state mark and the state's word. */
export function TarsStateTag({ state }: { state: TarsState }) {
  const { t } = useTranslation(["shell"]);
  return <Badge size="md" tone={stateTone(state)} xstyle={styles.stateTag} data-tars-state={state}>
    <StateMark state={WORK_STATE_OF[state]} size="xs" motion="still" />
    {/* The word fades over when the state changes (agent motion); a remount shows it settled. */}
    <AgentTextSwap swapKey={state}>{t(`shell:tars.states.${state}`)}</AgentTextSwap>
  </Badge>;
}

/**
 * One piece of Tars work as the design system's run object (AUI `RunMonitor`):
 * the stage it is on with a live elapsed clock in the "now" well, one labelled
 * segment per stage, the step count and a link to the run's timeline. A value
 * the run did not record (a start time, the stage count) is left out, never
 * shown as zero. The caller adds its own rows (`children`) and controls
 * (`actions`); every control still goes through the view's host path.
 */
export function TarsRunMonitor({ row, progress, meta, actions, children, onOpenSide, ...data }: {
  row: Pick<TarsResponsibility, "id" | "title" | "state">;
  progress?: TarsRunProgress | null;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  onOpenSide?: (target: TarsSideViewTarget) => void;
} & { [key: `data-${string}`]: string | undefined }) {
  const { t } = useTranslation(["shell"]);
  const staged = progress && progress.total > 0 ? progress : null;
  const current = staged?.current ?? null;
  const started = current?.startedAt ? Date.parse(current.startedAt) : Number.NaN;
  const live = Number.isFinite(started);
  const now = useNow(live);
  const count = staged ? tarsStepCount(staged) : null;
  const step = current
    ? current.attempt > 1 ? t("shell:tars.tray.monitor.currentAttempt", { title: current.title, attempt: current.attempt }) : t("shell:tars.tray.monitor.current", { title: current.title })
    : null;
  const segments = staged ? tarsStageSegments(staged) : [];
  const timeline = onOpenSide && staged ? <Button variant="ghost" size="2xs" aria-label={t("shell:tars.tray.monitor.timelineLabel", { title: row.title })} data-tars-monitor-timeline={row.id}
    onClick={() => onOpenSide({ responsibilityId: row.id, kind: "timeline", ...(current ? { focus: { stageId: current.id } } : {}) })}>
    <ChartNoAxesGantt aria-hidden />{t("shell:tars.tray.monitor.timeline")}</Button> : null;
  return <RunMonitor {...data} data-tars-monitor={staged ? row.id : undefined} title={row.title} meta={meta}
    status={RUN_STATE_OF[row.state]} workState={WORK_STATE_OF[row.state]} statusLabel={t(`shell:tars.states.${row.state}`)} statusTag={<TarsStateTag state={row.state} />}
    current={step ? {
      key: current ? `${current.id}:${current.attempt}` : undefined,
      label: <span data-tars-monitor-step="">{step}</span>,
      elapsed: live ? <ElapsedClock live now={now}>{(clock) => {
        const duration = formatDuration(clock - started);
        return <span role="timer" aria-label={t("shell:tars.tray.monitor.elapsedLabel", { duration })} data-tars-monitor-elapsed="">{duration}</span>;
      }}</ElapsedClock> : undefined,
    } : undefined}
    progress={staged ? {
      completed: staged.finished, total: staged.total,
      stripLabel: t("shell:tars.tray.monitor.stagesLabel", { title: row.title }),
      segments: staged.stages.map((stage, index) => ({ state: SEGMENT_OF[segments[index]!], label: t(`shell:tars.tray.monitor.segment.${segments[index]!}`, { title: stage.title }) })),
      label: count ? <span className={sx(styles.count)} aria-label={t("shell:tars.tray.monitor.stepCountLabel", count)} data-tars-monitor-count={`${count.position}/${count.total}`}>
        {t("shell:tars.tray.monitor.stepCount", count)}</span>
        : t("shell:tars.tray.stagesDone", { finished: staged.finished, total: staged.total }),
    } : undefined}
    actions={actions} trailingActions={timeline}>
    {children}
  </RunMonitor>;
}

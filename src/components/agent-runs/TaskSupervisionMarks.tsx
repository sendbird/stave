import { i18n, useTranslation } from "@/i18n";
import { memo } from "react";
import { AlarmClock, AlarmClockOff, Target } from "lucide-react";
import { StateMark } from "@/components/ads/components/StateMark";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  describeAgentRunStatus,
  formatAgentRunBadge,
  type AgentRunDecision,
} from "@/lib/agent-runs/agent-run-status";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { useAppStore } from "@/store/app.store";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { useTaskWakeUp, type TaskWakeUp } from "@/store/wake-ups-store";
import { useAgentRunDecision } from "./useAgentRun";
import { agentRunStyles as styles } from "./agent-runs.styles";

/**
 * Small marks on a task's tab: an active agent run and the task's wake-up.
 * The run's mark wears its badge (`describeAgentRunStatus`) in its state
 * color and label (`StateMark`); a run that waits on the user (Needs your
 * answer, Halted) takes the badge's glyph so the shape says so too, and any
 * other run the supervision target. Each mark carries its meaning as a label.
 */
export const TaskSupervisionMarks = memo(function TaskSupervisionMarks(props: { taskId: string }) {
  useTranslation();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const agentRun = useTaskAgentRun(workspaceId, props.taskId);
  const wakeUp = useTaskWakeUp(workspaceId, props.taskId);
  const active = Boolean(agentRun && isActiveAgentRunState(agentRun.agentRun.state));
  const decision = useAgentRunDecision(active ? agentRun?.agentRun.leadTaskId : null);
  return <TaskSupervisionMarksView agentRun={agentRun} decision={decision} wakeUp={wakeUp} />;
});

/** The marks themselves, free of the store so a test can render them. */
export function TaskSupervisionMarksView(props: {
  agentRun: AgentRunDetail | undefined;
  decision: AgentRunDecision | null;
  wakeUp: TaskWakeUp | undefined;
}) {
  useTranslation();
  const { agentRun, wakeUp } = props;
  const status = agentRun && isActiveAgentRunState(agentRun.agentRun.state)
    ? describeAgentRunStatus(agentRun, props.decision)
    : null;
  const wakeUpShown = wakeUp && wakeUp.summary.state !== "stopped";
  if (!status && !wakeUpShown) return null;
  const asksUser = status?.badge === "needs-answer" || status?.badge === "halted";
  const runLabel = status ? `${status.agentName}: ${formatAgentRunBadge(status)}` : "";
  return (
    <span className={sx(styles.inline)}>
      {status ? (
        <span data-badge={status.badge}>
          <StateMark
            state={status.mark.state}
            icon={asksUser ? undefined : Target}
            motion="still"
            label={runLabel}
            title={runLabel}
          />
        </span>
      ) : null}
      {wakeUpShown ? (
        wakeUp.summary.state === "scheduled" ? (
          <AlarmClock role="img" aria-label={i18n.t("agentRuns:taskSupervisionMarks.ariaLabel")} className={sx(styles.icon, styles.toneIdle)}>
            <title>{i18n.t("agentRuns:taskSupervisionMarks.taskSupervisionMarks")}</title>
          </AlarmClock>
        ) : (
          <AlarmClockOff role="img" aria-label={i18n.t("agentRuns:taskSupervisionMarks.ariaLabel2")} className={sx(styles.icon, styles.toneIdle)}>
            <title>{i18n.t("agentRuns:taskSupervisionMarks.taskSupervisionMarks2")}</title>
          </AlarmClockOff>
        )
      ) : null}
    </span>
  );
}

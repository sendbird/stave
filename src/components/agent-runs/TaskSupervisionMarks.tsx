import { memo } from "react";
import { AlarmClock, AlarmClockOff, Hand, Target } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { describeAgentRunStatus } from "@/lib/agent-runs/agent-run-status";
import { currentStageRecord, isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { useAppStore } from "@/store/app.store";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { useTaskWakeUp } from "@/store/wake-ups-store";
import { agentRunStyles as styles } from "./agent-runs.styles";

/**
 * Small marks on a task's tab: a running agent run (a hand when it waits for
 * the user) and the task's wake-up. Each carries its meaning as a label.
 */
export const TaskSupervisionMarks = memo(function TaskSupervisionMarks(props: { taskId: string }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const agentRun = useTaskAgentRun(workspaceId, props.taskId);
  const wakeUp = useTaskWakeUp(workspaceId, props.taskId);
  const agentRunActive = Boolean(agentRun && isActiveAgentRunState(agentRun.agentRun.state));
  const agentStatus = agentRunActive && hasAgentOrigin(agentRun!.agentRun) ? describeAgentRunStatus(agentRun!) : null;
  const waitingOnUser = agentStatus
    ? agentStatus.state === "needs-you"
    : agentRunActive &&
      agentRun!.agentRun.state === "running" &&
      currentStageRecord(agentRun!).status === "awaiting-sign-off";
  const wakeUpShown = wakeUp && wakeUp.summary.state !== "stopped";
  if (!agentRunActive && !wakeUpShown) return null;
  const agentRunLabel = agentStatus
    ? `${agentStatus.agentName}: ${agentStatus.label}`
    : waitingOnUser
      ? "Run waits for your sign-off"
      : agentRun?.agentRun.state === "paused"
        ? "Run paused"
        : "Run running";
  return (
    <span className={sx(styles.inline)}>
      {agentRunActive ? (
        waitingOnUser ? (
          <Hand role="img" aria-label={agentRunLabel} className={sx(styles.icon, styles.toneWaiting)}>
            <title>{agentRunLabel}</title>
          </Hand>
        ) : (
          <Target
            role="img"
            aria-label={agentRunLabel}
            className={sx(styles.icon, agentRun?.agentRun.state === "paused" ? styles.toneIdle : styles.toneActive)}
          >
            <title>{agentRunLabel}</title>
          </Target>
        )
      ) : null}
      {wakeUpShown ? (
        wakeUp.summary.state === "scheduled" ? (
          <AlarmClock role="img" aria-label="Schedule on" className={sx(styles.icon, styles.toneIdle)}>
            <title>Schedule on</title>
          </AlarmClock>
        ) : (
          <AlarmClockOff role="img" aria-label="Schedule paused" className={sx(styles.icon, styles.toneIdle)}>
            <title>Schedule paused</title>
          </AlarmClockOff>
        )
      ) : null}
    </span>
  );
});

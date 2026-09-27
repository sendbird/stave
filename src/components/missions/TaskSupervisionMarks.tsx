import { memo } from "react";
import { AlarmClock, AlarmClockOff, Hand, Target } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { currentStageRecord, isActiveMissionState } from "@/lib/missions/domain";
import { useAppStore } from "@/store/app.store";
import { useTaskMission } from "@/store/missions-store";
import { useTaskWakeUp } from "@/store/wake-ups-store";
import { missionStyles as styles } from "./missions.styles";

/**
 * Small marks on a task's tab: a running mission (a hand when it waits for
 * the user) and the task's wake-up. Each carries its meaning as a label.
 */
export const TaskSupervisionMarks = memo(function TaskSupervisionMarks(props: { taskId: string }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const mission = useTaskMission(workspaceId, props.taskId);
  const wakeUp = useTaskWakeUp(workspaceId, props.taskId);
  const missionActive = Boolean(mission && isActiveMissionState(mission.mission.state));
  const waitingOnUser =
    missionActive &&
    mission!.mission.state === "running" &&
    currentStageRecord(mission!).status === "awaiting-sign-off";
  const wakeUpShown = wakeUp && wakeUp.summary.state !== "stopped";
  if (!missionActive && !wakeUpShown) return null;
  const missionLabel = waitingOnUser
    ? "Mission waits for your sign-off"
    : mission?.mission.state === "paused"
      ? "Mission paused"
      : "Mission running";
  return (
    <span className={sx(styles.inline)}>
      {missionActive ? (
        waitingOnUser ? (
          <Hand role="img" aria-label={missionLabel} className={sx(styles.icon, styles.toneWaiting)}>
            <title>{missionLabel}</title>
          </Hand>
        ) : (
          <Target
            role="img"
            aria-label={missionLabel}
            className={sx(styles.icon, mission?.mission.state === "paused" ? styles.toneIdle : styles.toneActive)}
          >
            <title>{missionLabel}</title>
          </Target>
        )
      ) : null}
      {wakeUpShown ? (
        wakeUp.summary.state === "scheduled" ? (
          <AlarmClock role="img" aria-label="Wake-up scheduled" className={sx(styles.icon, styles.toneIdle)}>
            <title>Wake-up scheduled</title>
          </AlarmClock>
        ) : (
          <AlarmClockOff role="img" aria-label="Wake-up paused" className={sx(styles.icon, styles.toneIdle)}>
            <title>Wake-up paused</title>
          </AlarmClockOff>
        )
      ) : null}
    </span>
  );
});

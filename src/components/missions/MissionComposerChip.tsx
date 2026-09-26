import { Target } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { useMissionsStore } from "@/store/missions-store";
import { useScopedTaskMission } from "./useMission";
import { missionStyles as styles } from "./missions.styles";

/**
 * Just above the composer while a mission is active: a reply is guidance for
 * the current stage and the mission continues after it. Take over pauses the
 * mission now, so the next replies are the user's own; Resume hands the task
 * back.
 */
export function MissionComposerChip() {
  const { detail } = useScopedTaskMission();
  const runCommand = useMissionsStore((state) => state.runCommand);
  const missionId = detail?.mission.id ?? "";
  const busy = useMissionsStore((state) => Boolean(state.pendingByMission[missionId]));
  if (!detail) return null;
  const { mission } = detail;
  if (mission.state === "running") {
    return (
      <div className={sx(styles.chip)} data-testid="mission-composer-chip">
        <span className={sx(styles.chipLabel)}>
          <Target aria-hidden className={sx(styles.icon, styles.toneActive)} />
          Mission continues after your reply
        </span>
        <ActionButton size="xs" weight="quiet" disabled={busy} onClick={() => void runCommand("takeOver", { missionId })}>
          Take over
        </ActionButton>
      </div>
    );
  }
  if (mission.state === "paused" && mission.pauseReason === "taken-over") {
    return (
      <div className={sx(styles.chip)} data-testid="mission-composer-chip">
        <span className={sx(styles.chipLabel)}>
          <Target aria-hidden className={sx(styles.icon, styles.toneWaiting)} />
          You took over; the mission waits until you resume it
        </span>
        <ActionButton size="xs" disabled={busy} onClick={() => void runCommand("resume", { missionId })}>
          Resume mission
        </ActionButton>
      </div>
    );
  }
  return null;
}

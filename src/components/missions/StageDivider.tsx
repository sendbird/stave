import { memo } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useMissionTurnDivider } from "@/store/missions-store";
import { missionStyles as styles } from "./missions.styles";

/**
 * A quiet transcript divider before a turn a mission started, such as
 * "Stage 3 · Verify — started automatically after Build reported done".
 * Built from mission events, never from message text; renders nothing for
 * any other turn.
 */
export const StageDivider = memo(function StageDivider(props: { taskId: string; turnId: string | undefined }) {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const text = useMissionTurnDivider(workspaceId, props.taskId, props.turnId);
  if (!text) return null;
  return (
    <div className={sx(styles.divider)} role="separator" aria-label={text} data-testid="mission-stage-divider">
      <span className={sx(styles.dividerRule)} aria-hidden />
      <span className={sx(styles.dividerText)} title={text}>
        {text}
      </span>
      <span className={sx(styles.dividerRule)} aria-hidden />
    </div>
  );
});

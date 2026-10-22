import { useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useScopedTaskId } from "./task-scope-context";
import { TaskRunOverview } from "./TaskRunOverview";
import { TurnActivityHistory } from "./TurnActivityHistory";
import { turnActivityPanelStyles as styles } from "./turn-activity-panel.styles";

/**
 * The Task panel's Activity tab: the run header, the turn picker, then the
 * chosen turn — the live turn, the last one once it ends, or an earlier
 * turn's saved record — and that turn's approval record.
 *
 * It lists the turn under every placement. The placement only decides where
 * the composer shelf's own toggle opens the details; the shelf's panel button
 * always leads here, so this tab is never a pointer to somewhere else.
 */
export function TurnActivityPanel() {
  useTranslation();
  const taskId = useScopedTaskId();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  return (
    <div className={sx(styles.column)}>
      <TaskRunOverview />
      <div className={sx(styles.body)}>
        <TurnActivityHistory
          key={`${workspaceId}:${taskId}`}
          workspaceId={workspaceId}
          taskId={taskId}
        />
      </div>
    </div>
  );
}

import { TurnActivity } from "@/components/session/TurnActivity";
import { sx } from "@/components/ads/utils/stylex";
import { TaskRunOverview } from "./TaskRunOverview";
import { turnActivityPanelStyles as styles } from "./turn-activity-panel.styles";

/**
 * The Task panel's Activity tab: the run header, then the turn's list — the
 * live turn, or the last one once it ends.
 *
 * It lists the turn under every placement. The placement only decides where
 * the composer shelf's own toggle opens the details; the shelf's panel button
 * always leads here, so this tab is never a pointer to somewhere else.
 */
export function TurnActivityPanel() {
  return (
    <div className={sx(styles.column)}>
      <TaskRunOverview />
      <div className={sx(styles.body)}>
        <TurnActivity host="panel" />
      </div>
    </div>
  );
}

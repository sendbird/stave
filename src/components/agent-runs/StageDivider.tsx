import { useTranslation } from "@/i18n";
import { memo } from "react";
import { Target } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useAgentRunForTurn, useAgentRunTurnDivider } from "@/store/agent-runs-store";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** "Stage 3 · Verify — started automatically…" → the stage and the reason. */
export function splitDividerText(text: string): { stage: string; reason: string | null } {
  const separator = text.indexOf(" — ");
  return separator === -1
    ? { stage: text, reason: null }
    : { stage: text.slice(0, separator), reason: text.slice(separator + 3) };
}

/**
 * A quiet transcript divider before a turn an agent run started, such as
 * "Stage 3 · Verify — started automatically after Build reported done".
 * Built from agent run events, never from message text; renders nothing for
 * any other turn, or for a turn of a one-stage agent run.
 */
export const StageDivider = memo(function StageDivider(props: { taskId: string; turnId: string | undefined }) {
  useTranslation();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const text = useAgentRunTurnDivider(workspaceId, props.taskId, props.turnId);
  // A one-stage run has nothing to divide; a run with a workflow shows its stages.
  const agentRun = useAgentRunForTurn(workspaceId, props.taskId, props.turnId);
  if (!text || (agentRun && agentRun.workflow.stages.length <= 1)) return null;
  return <StageDividerView text={text} />;
});

export function StageDividerView({ text }: { text: string }) {
  useTranslation();
  const { stage, reason } = splitDividerText(text);
  return (
    <div className={sx(styles.divider)} role="separator" aria-label={text} data-testid="agent-run-stage-divider">
      <span className={sx(styles.dividerRule)} aria-hidden />
      <span className={sx(styles.dividerText)} title={text}>
        <Target aria-hidden className={sx(styles.iconSm, styles.toneActive)} />
        <span className={sx(styles.dividerStage)}>{stage}</span>
        {reason ? <span className={sx(styles.dividerReason)}>{reason}</span> : null}
      </span>
      <span className={sx(styles.dividerRule)} aria-hidden />
    </div>
  );
}

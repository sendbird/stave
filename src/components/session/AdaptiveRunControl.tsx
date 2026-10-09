import { i18n, useTranslation } from "@/i18n";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

/** Intent for the next Run. Its active policy is immutable in the host. */
export function AdaptiveRunControl({ taskId, providerId }: { taskId: string; providerId: string }) {
  useTranslation();
  const assigned = useAgentAssignmentsStore((state) => Boolean(state.byTaskId[taskId]));
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId);
  const enabled = useAppStore((state) => state.promptDraftByTask[taskId]?.runtimeOverrides?.agentRunAdaptive === true);
  const active = useAgentRunsStore((state) => {
    const id = state.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
    const run = id ? state.details[id]?.agentRun : undefined;
    return Boolean(run && isActiveAgentRunState(run.state));
  });
  if (!assigned || active || (providerId !== "codex" && providerId !== "claude-code")) return null;
  return <div className={sx(styles.row)}>
    <Checkbox checked={enabled} label={i18n.t("agentRuns:adaptive.enable")} description={i18n.t("agentRuns:adaptive.description")}
      onCheckedChange={(checked) => {
        const store = useAppStore.getState();
        store.updatePromptDraft({ taskId, patch: { runtimeOverrides: {
          ...store.promptDraftByTask[taskId]?.runtimeOverrides, agentRunAdaptive: checked === true,
        } } });
      }} />
  </div>;
}
const styles = stylex.create({ row: { paddingInline: vars["--ads-space-12"], paddingBlock: vars["--ads-space-8"] } });

import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { hasAgentPromptAttachments, planAgentPromptSend } from "@/lib/agent-runs/agent-run";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import { usePendingAutoRoutingStore } from "@/store/pending-auto-routing-store";
import { buildPromptDraftContentForSend } from "@/store/prompt-draft-message-content";
import type { PromptDraft } from "@/types/chat";

/** Explain the same attachment fallback that the send path will choose. */
export function AgentAttachmentNotice(props: { taskId: string; providerId: string; draft: PromptDraft }) {
  useTranslation();
  const { taskId } = props;
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId);
  const turnActive = useAppStore((state) => Boolean(workspaceId === state.activeWorkspaceId
    ? state.activeTurnIdsByTask[taskId] : state.workspaceRuntimeCacheById[workspaceId]?.activeTurnIdsByTask[taskId]));
  const taskRunsAsAgent = useAgentAssignmentsStore((state) => Boolean(state.byTaskId[taskId]));
  const runActive = useAgentRunsStore((state) => {
    if (state.loadedWorkspaceId !== workspaceId) return false;
    const id = state.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
    const run = id ? state.details[id]?.agentRun : undefined;
    return Boolean(run && isActiveAgentRunState(run.state));
  });
  const runPending = usePendingAutoRoutingStore((state) => Boolean(state.byTaskId[taskId]?.agentRun));
  const plan = planAgentPromptSend({
    taskRunsAsAgent, runActive: runActive || runPending, turnActive, queued: false,
    turnOrigin: "conversation", providerId: props.providerId,
    prompt: buildPromptDraftContentForSend(props.draft), hasAttachments: hasAgentPromptAttachments(props.draft),
  });
  if (plan.kind !== "plain-turn" || plan.reason !== "attachments") return null;
  return <p role="status" className={sx(styles.notice)} data-testid="agent-attachment-notice">
    {i18n.t("session:agentAttachmentNotice.agentAttachmentNotice")}</p>;
}

const styles = stylex.create({
  notice: {
    margin: 0,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.5,
  },
});

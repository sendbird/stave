import { i18n } from "@/i18n/runtime";
import { useMemo } from "react";
import { buildAgentRunStartInput, AGENT_RUN_DEFAULT_DONE_WHEN, AGENT_RUN_STAGE_ID } from "@/lib/agent-runs/agent-run";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { latestStageRecord } from "@/lib/agent-runs/domain";
import { openExternalUrl } from "@/lib/external-links";
import { toast } from "@/lib/notifications/toast";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { useAgentRunsStore } from "@/store/agent-runs-store";
import { snapshotProviderAccounts } from "@/lib/providers/provider-account-selection";
import { resolveStartAccountPool } from "@/store/agent-run-send";

/** What the user can do to an agent run from the bar, the result card and the panel. */
export interface AgentRunActions {
  busy?: boolean;
  /** Resumes a usage-limit wait without changing account or model. */
  onResume?: () => void;
  /** Ends the run and stops its turn. */
  onStop?: () => void;
  /** Ends the run and leaves the task in Chat, on the model the agent last used. */
  onTakeControl?: () => void;
  /** Asks a stuck stage again, or starts a new run from the same assignment. */
  onRetry?: () => void;
  onOpenPullRequest?: (url: string) => void;
}

/**
 * The actions of one agent run. Stop reuses the composer's Stop (it cancels
 * the run first, then the turn); Take control cancels the run and releases
 * the task's agent, so the conversation, its session and its model stay.
 */
export function useAgentRunActions(detail: AgentRunDetail | undefined): AgentRunActions {
  const agentRunId = detail?.agentRun.id ?? "";
  const busy = useAgentRunsStore((state) => Boolean(state.pendingByAgentRun[agentRunId]));
  return useMemo(() => {
    if (!detail) return {};
    const { agentRun } = detail;
    const stage = agentRun.workflow.stages[agentRun.currentStageIndex];
    const record = stage ? latestStageRecord(detail.stages, stage.id) : undefined;
    return {
      busy,
      onResume: () => void useAgentRunsStore.getState().runCommand("resume", { agentRunId: agentRun.id }),
      onStop: () => useAppStore.getState().abortTaskTurn({ taskId: agentRun.leadTaskId }),
      onTakeControl: () => {
        void (async () => {
          const cancelled = await useAgentRunsStore.getState().runCommand("cancel", { agentRunId: agentRun.id });
          if (!cancelled.ok && cancelled.code !== "not-active") return;
          const released = await window.api?.agents?.releaseTask({ taskId: agentRun.leadTaskId }).catch(() => null);
          if (released?.ok) void useAgentAssignmentsStore.getState().load();
          else toast.info(i18n.t("agentRuns:useAgentRunActions.copy"), { description: i18n.t("agentRuns:useAgentRunActions.description") });
        })();
      },
      onRetry: () => {
        void (async () => {
          if (agentRun.state === "running" && record) {
            await useAgentRunsStore
              .getState()
              .runCommand("retryStage", { agentRunId: agentRun.id, stageId: record.stageId, attempt: record.attempt });
            return;
          }
          // A new run needs the task to still run as that agent; otherwise the
          // next tick would end it as released, or it would run one agent's
          // stages under another.
          const current = useAgentAssignmentsStore.getState().byTaskId[agentRun.leadTaskId];
          if (current?.agentName !== agentRun.workflow.name) {
            toast.info(i18n.t("agentRuns:useAgentRunActions.copy2", { value1: agentRun.workflow.name }), {
              description: i18n.t("agentRuns:useAgentRunActions.description2", { value1: agentRun.workflow.name }),
            });
            return;
          }
          // A new run follows the same stages: the workflow it ran, or its one Work stage.
          const stages = agentRun.workflow.stages;
          const single = stages.length === 1 && stages[0]!.id === AGENT_RUN_STAGE_ID ? stages[0]! : null;
          const doneWhen = single?.kind === "ai" && single.doneWhen !== AGENT_RUN_DEFAULT_DONE_WHEN ? single.doneWhen : null;
          const accounts = snapshotProviderAccounts(useAppStore.getState().settings);
          // The task's pool choice for its next Run applies to this new run too.
          const pool = useAppStore.getState().promptDraftByTask[agentRun.leadTaskId]?.runtimeOverrides?.agentRunAccountPool;
          const accountPool = pool?.enabled ? await resolveStartAccountPool({ providerId: agentRun.fingerprint.providerId, accounts,
            excludedAccountIds: pool.excludedAccountIds }) : null;
          const started = await useAgentRunsStore.getState().startAgentRun(
            buildAgentRunStartInput({
              workspaceId: agentRun.workspaceId,
              taskId: agentRun.leadTaskId,
              agent: {
                name: agentRun.workflow.name,
                workflow: single ? undefined : stages,
                checkIns: agentRun.consent.checkIns,
                // The new run keeps the permission the last run recorded.
                permission: agentRun.consent.permissionMode === "auto" ? "auto" : "manual",
              },
              assignment: agentRun.assignment,
              adaptive: Boolean(detail.resources),
              doneWhen,
              // A new run: the accounts selected now, not the ones the last run kept.
              accounts,
              accountPool,
              now: new Date(),
            }),
          );
          if (!started.ok) toast.error(i18n.t("agentRuns:useAgentRunActions.copy3"), { description: started.message });
        })();
      },
      onOpenPullRequest: (url) => void openExternalUrl({ url }),
    };
  }, [busy, detail]);
}

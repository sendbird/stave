import type { PromptInputRunAutoTuning } from "@/components/ai-elements/prompt-input-run-auto-tuning";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { useRunAccountPool } from "./use-run-account-pool";

/** The draft configures the next Run; a live Run shows its frozen host policy. */
export function useRunAutoTuning(
  taskId: string,
  providerId: string,
): PromptInputRunAutoTuning | null {
  const assigned = useAgentAssignmentsStore((state) => Boolean(state.byTaskId[taskId]));
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId);
  const enabled = useAppStore((state) => state.promptDraftByTask[taskId]?.runtimeOverrides?.agentRunAdaptive === true);
  const detail = useAgentRunsStore((state) => {
    const id = state.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
    return id ? state.details[id] : undefined;
  });
  const locked = Boolean(detail && isActiveAgentRunState(detail.agentRun.state));
  const accountPool = useRunAccountPool({ taskId, providerId, lockedRun: locked ? detail!.agentRun : null });
  if ((!assigned && !locked) || (providerId !== "codex" && providerId !== "claude-code")) {
    return null;
  }
  return {
    enabled: locked ? Boolean(detail?.resources) : enabled,
    locked,
    accountPool,
    onEnabledChange: (nextEnabled) => {
      // Recheck at the action boundary: a Run may start while the popup is open.
      const runs = useAgentRunsStore.getState();
      const id = runs.agentRunIdByTask[agentRunTaskKey(workspaceId, taskId)];
      const run = id ? runs.details[id]?.agentRun : undefined;
      if (run && isActiveAgentRunState(run.state)) return;
      const store = useAppStore.getState();
      store.updatePromptDraft({
        taskId,
        patch: {
          runtimeOverrides: {
            ...store.promptDraftByTask[taskId]?.runtimeOverrides,
            agentRunAdaptive: nextEnabled,
          },
        },
      });
    },
  };
}

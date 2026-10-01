import { useMemo } from "react";
import { buildAgentRunStartInput, AGENT_RUN_DEFAULT_DONE_WHEN, AGENT_RUN_STAGE_ID } from "@/lib/missions/agent-run";
import type { MissionDetail } from "@/lib/missions/api";
import { latestStageRecord } from "@/lib/missions/domain";
import { openExternalUrl } from "@/lib/external-links";
import { toast } from "@/lib/notifications/toast";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore } from "@/store/missions-store";

/** What the user can do to an agent run from the bar, the result card and the panel. */
export interface AgentRunActions {
  busy?: boolean;
  /** Ends the run and stops its turn. */
  onStop?: () => void;
  /** Ends the run and leaves the task in Chat, on the model the agent last used. */
  onTakeControl?: () => void;
  /** Asks a stuck stage again, or starts a new run from the same assignment. */
  onRetry?: () => void;
  /** Focuses the composer; the agent stays assigned, so the next send starts a run. */
  onAskForChanges?: () => void;
  onOpenPullRequest?: (url: string) => void;
}

/**
 * The actions of one agent run. Stop reuses the composer's Stop (it cancels
 * the run first, then the turn); Take control cancels the run and releases
 * the task's agent, so the conversation, its session and its model stay.
 */
export function useAgentRunActions(detail: MissionDetail | undefined): AgentRunActions {
  const missionId = detail?.mission.id ?? "";
  const busy = useMissionsStore((state) => Boolean(state.pendingByMission[missionId]));
  return useMemo(() => {
    if (!detail) return {};
    const { mission } = detail;
    const stage = mission.playbook.stages[mission.currentStageIndex];
    const record = stage ? latestStageRecord(detail.stages, stage.id) : undefined;
    return {
      busy,
      onStop: () => useAppStore.getState().abortTaskTurn({ taskId: mission.leadTaskId }),
      onTakeControl: () => {
        void (async () => {
          const cancelled = await useMissionsStore.getState().runCommand("cancel", { missionId: mission.id });
          if (!cancelled.ok && cancelled.code !== "not-active") return;
          const released = await window.api?.agents?.releaseTask({ taskId: mission.leadTaskId }).catch(() => null);
          if (released?.ok) void useAgentAssignmentsStore.getState().load();
          else toast.info("The run ended", { description: "The task still has its agent. Pick a model to chat." });
        })();
      },
      onRetry: () => {
        void (async () => {
          if (mission.state === "running" && record) {
            await useMissionsStore
              .getState()
              .runCommand("retryStage", { missionId: mission.id, stageId: record.stageId, attempt: record.attempt });
            return;
          }
          // A new run follows the same stages: the workflow it ran, or its one Work stage.
          const stages = mission.playbook.stages;
          const single = stages.length === 1 && stages[0]!.id === AGENT_RUN_STAGE_ID ? stages[0]! : null;
          const doneWhen = single?.kind === "ai" && single.doneWhen !== AGENT_RUN_DEFAULT_DONE_WHEN ? single.doneWhen : null;
          const started = await useMissionsStore.getState().startMission(
            buildAgentRunStartInput({
              workspaceId: mission.workspaceId,
              taskId: mission.leadTaskId,
              agent: {
                name: mission.playbook.name,
                workflow: single ? undefined : stages,
                checkIns: mission.consent.checkIns,
              },
              assignment: mission.assignment,
              doneWhen,
              now: new Date(),
            }),
          );
          if (!started.ok) toast.error("The run did not start", { description: started.message });
        })();
      },
      onAskForChanges: () => useAppStore.setState((state) => ({ promptFocusNonce: state.promptFocusNonce + 1 })),
      onOpenPullRequest: (url) => void openExternalUrl({ url }),
    };
  }, [busy, detail]);
}

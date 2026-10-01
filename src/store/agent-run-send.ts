/**
 * The composer's side of agent runs (`src/lib/missions/agent-run.ts`).
 *
 * - Send: a prompt on a task that runs as an agent, with no run active, starts
 *   a run on the mission engine; every other send stays the plain turn it was.
 * - Stop: stopping a task's turn while its run is active cancels the run first,
 *   so the run never continues after the turn the user stopped.
 *
 * The missions store registers the bridge below, so the send path and the stop
 * action never import it (it imports the app store).
 */
import type { MissionCommandResponse, MissionStartArgs } from "@/lib/missions/api";
import { buildAgentRunStartInput, planAgentPromptSend } from "@/lib/missions/agent-run";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";
import { buildClearedPromptDraft } from "@/store/prompt-draft-state";
import type { Attachment, PromptDraft } from "@/types/chat";
import { toast } from "@/lib/notifications/toast";

export interface AgentRunBridge {
  /**
   * The task's active mission (an agent run or a playbook mission), null for
   * none, undefined while the workspace's missions are not loaded.
   */
  activeMission: (workspaceId: string, taskId: string) => { id: string; agentRun: boolean } | null | undefined;
  start: (input: MissionStartArgs) => Promise<MissionCommandResponse>;
  cancel: (missionId: string) => Promise<MissionCommandResponse>;
}

let bridge: AgentRunBridge | null = null;

export function registerAgentRunBridge(next: AgentRunBridge | null) {
  bridge = next;
}

function hasNonTextAttachments(draft: Pick<PromptDraft, "attachedFilePaths" | "attachments">) {
  return (
    draft.attachedFilePaths.length > 0 ||
    draft.attachments.some((attachment: Attachment) => attachment.kind !== "lens-annotations")
  );
}

/**
 * Starts an agent run for this send when it should start one. Returns the
 * send's result once the run started, or null for a plain turn: Chat, a run
 * already active, a turn running, or a start the host refused (the prompt
 * then runs as a single turn, as before agent runs).
 */
export async function startAgentRunForSend(args: {
  set: (update: (state: AppState) => Partial<AppState>) => void;
  workspaceId: string;
  taskId: string;
  providerId: string;
  prompt: string;
  promptDraft: Pick<PromptDraft, "attachedFilePaths" | "attachments">;
  extraContextCount: number;
  turnActive: boolean;
  queued: boolean;
  turnOrigin: "conversation" | "utility";
  preservePromptDraft?: boolean;
  now?: Date;
}): Promise<SendUserMessageResult | null> {
  const agent = useAgentAssignmentsStore.getState().byTaskId[args.taskId];
  const active = bridge?.activeMission(args.workspaceId, args.taskId);
  const plan = planAgentPromptSend({
    taskRunsAsAgent: Boolean(agent),
    runActive: Boolean(active),
    turnActive: args.turnActive,
    queued: args.queued,
    turnOrigin: args.turnOrigin,
    providerId: args.providerId,
    prompt: args.prompt,
    hasAttachments: args.extraContextCount > 0 || hasNonTextAttachments(args.promptDraft),
  });
  if (plan.kind !== "start-run" || !agent || !bridge) return null;
  const response = await bridge
    .start(
      buildAgentRunStartInput({
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        agent: { name: agent.agentName },
        assignment: args.prompt,
        now: args.now ?? new Date(),
      }),
    )
    .catch((): MissionCommandResponse => ({ ok: false, mission: null }));
  if (!response.ok || !response.mission) {
    if (response.message) toast.info("Sent as a single turn", { description: response.message });
    return null;
  }
  if (!args.preservePromptDraft) {
    args.set((state) => ({
      promptDraftByTask: {
        ...state.promptDraftByTask,
        [args.taskId]: buildClearedPromptDraft(state.promptDraftByTask[args.taskId]),
      },
    }));
  }
  return { status: "run-started", taskId: args.taskId, workspaceId: args.workspaceId, missionId: response.mission.mission.id };
}

const stoppingTaskIds = new Set<string>();

/**
 * Cancels the task's active agent run before its turn is stopped, then stops
 * the turn through `stopTurn`. True when the stop waits on the cancel; false
 * when there is no run to cancel and the caller stops the turn itself.
 */
export function cancelAgentRunBeforeStop(args: {
  workspaceId: string | null | undefined;
  taskId: string;
  stopTurn: () => void;
}): boolean {
  if (!bridge || !args.workspaceId || stoppingTaskIds.has(args.taskId)) return false;
  const active = bridge.activeMission(args.workspaceId, args.taskId);
  if (!active?.agentRun) return false;
  stoppingTaskIds.add(args.taskId);
  void bridge
    .cancel(active.id)
    .catch(() => undefined)
    .finally(() => {
      try {
        args.stopTurn();
      } finally {
        stoppingTaskIds.delete(args.taskId);
      }
    });
  return true;
}

import { i18n } from "@/i18n/runtime";
/**
 * The composer's side of agent runs (`src/lib/agent-runs/agent-run.ts`).
 *
 * - Send: a prompt on a task that runs as an agent, with no run active, starts
 *   a run on the agent run engine; every other send stays the plain turn it was.
 *   The prompt is drawn as a pending row (`pending-auto-routing-store.ts`)
 *   until the run writes its first user row, because the host routes the
 *   run's turn before it writes anything.
 * - Stop: stopping a task's turn while its run is active cancels the run first,
 *   so the run never continues after the turn the user stopped.
 *
 * The agent runs store registers the bridge below, so the send path and the stop
 * action never import it (it imports the app store).
 */
import type { AgentRunCommandResponse, AgentRunStartArgs } from "@/lib/agent-runs/api";
import { buildAgentRunAssignment, buildAgentRunStartInput, hasAgentPromptAttachments, planAgentPromptSend } from "@/lib/agent-runs/agent-run";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";
import { buildOutgoingUserMessage, buildRecentTimestamp } from "@/store/chat-state-helpers";
import { appendFailedOutgoingSend, buildFailedOutgoingSend } from "@/store/failed-send-recovery";
import {
  beginPendingAgentRun,
  endPendingAutoRoute,
  hasPendingAgentRun,
  updatePendingAutoRoute,
} from "@/store/pending-auto-routing-store";
import { buildClearedPromptDraft, hasPromptDraftPayload } from "@/store/prompt-draft-state";
import type { PromptDraft } from "@/types/chat";
import type { ProviderAccountSelection } from "@/lib/providers/provider-account-selection";
import { toast } from "@/lib/notifications/toast";
import { isTaskArchived } from "@/lib/tasks";

/** How a run's first prompt left the pending row: written by the run, or never. */
export type AgentRunFirstPromptEnd = { outcome: "landed" } | { outcome: "ended"; reason: string | null };

export interface AgentRunBridge {
  /**
   * The task's active agent run (an agent run or a legacy run), null for
   * none, undefined while the workspace's agent runs are not loaded.
   */
  activeAgentRun: (workspaceId: string, taskId: string) => { id: string; agentOrigin: boolean } | null | undefined;
  start: (input: AgentRunStartArgs) => Promise<AgentRunCommandResponse>;
  cancel: (agentRunId: string) => Promise<AgentRunCommandResponse>;
  /**
   * Calls `onEnd` once, when the task's transcript holds the run's first user
   * row or the run ended without writing one.
   */
  watchFirstPrompt: (
    args: { workspaceId: string; taskId: string; agentRunId: string },
    onEnd: (end: AgentRunFirstPromptEnd) => void,
  ) => void;
}

let bridge: AgentRunBridge | null = null;

export function registerAgentRunBridge(next: AgentRunBridge | null) {
  bridge = next;
}

type AgentRunSendArgs = {
  set: (update: (state: AppState) => Partial<AppState>) => void;
  workspaceId: string;
  taskId: string;
  providerId: string;
  prompt: string;
  promptDraft: Pick<PromptDraft, "attachedFilePaths" | "attachments"> & Pick<Partial<PromptDraft>, "promptBatch" | "runtimeOverrides">;
  extraContextCount: number;
  turnActive: boolean;
  queued: boolean;
  queuedTurnId?: string;
  turnOrigin: "conversation" | "utility";
  preservePromptDraft?: boolean;
  /** The accounts this send runs on (a queued send's are captured at enqueue). */
  accounts?: ProviderAccountSelection;
  now?: Date;
};

const UNSENT_RUN_REASON = "agentRuns:agentRunSend.unsentReason";

type RecoveryState = Pick<
  AppState,
  | "activeWorkspaceId"
  | "promptDraftByTask"
  | "failedSendsByTask"
  | "tasks"
  | "taskWorkspaceIdById"
  | "workspaceRuntimeCacheById"
>;

/**
 * Whether the task is still open in the app: listed and not archived where its
 * workspace's tasks are loaded, else still owned by the workspace (closing a
 * workspace drops its tasks' ownership).
 */
function isTaskStillOpen(state: RecoveryState, workspaceId: string, taskId: string) {
  const tasks =
    workspaceId === state.activeWorkspaceId ? state.tasks : state.workspaceRuntimeCacheById[workspaceId]?.tasks;
  if (!tasks) return state.taskWorkspaceIdById[taskId] === workspaceId;
  const task = tasks.find((entry) => entry.id === taskId);
  return Boolean(task && !isTaskArchived(task));
}

/**
 * Gives an Agent-mode prompt back when its run ended before writing it: into
 * the composer when the composer of the same workspace is still empty, else
 * as a failed send with Retry, so text typed meanwhile is never overwritten.
 * A task archived or closed meanwhile gets nothing: it has nowhere to show it.
 */
export function recoverUnsentAgentRunPrompt(
  state: RecoveryState,
  args: {
    workspaceId: string;
    taskId: string;
    prompt: string;
    /** The composer draft the send cleared; undefined when the send kept it. */
    submittedDraft: PromptDraft | undefined;
    reason: string | null;
  },
): Partial<AppState> {
  if (!isTaskStillOpen(state, args.workspaceId, args.taskId)) return {};
  const current = state.promptDraftByTask[args.taskId];
  if (
    args.submittedDraft &&
    state.activeWorkspaceId === args.workspaceId &&
    (!current || !hasPromptDraftPayload(current))
  ) {
    return {
      promptDraftByTask: {
        ...state.promptDraftByTask,
        [args.taskId]: {
          ...buildClearedPromptDraft(current ?? args.submittedDraft),
          text: args.submittedDraft.text,
          attachedFilePaths: args.submittedDraft.attachedFilePaths,
          attachments: args.submittedDraft.attachments,
        },
      },
    };
  }
  return {
    failedSendsByTask: appendFailedOutgoingSend(
      state.failedSendsByTask,
      buildFailedOutgoingSend({
        id: crypto.randomUUID(),
        taskId: args.taskId,
        failedAt: buildRecentTimestamp(),
        draft: {
          text: args.prompt,
          attachedFilePaths: [],
          attachments: args.submittedDraft?.attachments ?? [],
          ...(args.submittedDraft?.runtimeOverrides ? { runtimeOverrides: args.submittedDraft.runtimeOverrides } : {}),
        },
        error: args.reason ?? i18n.t(UNSENT_RUN_REASON),
      }),
    ),
  };
}

/**
 * Decides synchronously whether this send starts an agent run, so a Chat send
 * keeps its synchronous path (the submitted draft is cleared before any await,
 * and a workspace switch cannot revive it). Returns null for a plain turn —
 * Chat, a run already active or starting, a turn running — or the start to
 * await. The draft is cleared and the prompt drawn as a pending row before
 * the start is requested. A refused start restores the prompt and blocks the
 * send, so work requested as a run never silently becomes a single turn.
 */
export function prepareAgentRunForSend(
  args: AgentRunSendArgs,
): (() => Promise<SendUserMessageResult>) | null {
  const agent = useAgentAssignmentsStore.getState().byTaskId[args.taskId];
  const activeBridge = bridge;
  const active = activeBridge?.activeAgentRun(args.workspaceId, args.taskId);
  const plan = planAgentPromptSend({
    taskRunsAsAgent: Boolean(agent),
    // A run still starting counts as active: its first prompt is on the way.
    runActive: Boolean(active) || hasPendingAgentRun(args.taskId),
    turnActive: args.turnActive,
    queued: args.queued,
    turnOrigin: args.turnOrigin,
    providerId: args.providerId,
    prompt: buildAgentRunAssignment(args.prompt, args.promptDraft),
    hasAttachments: hasAgentPromptAttachments(args.promptDraft, args.extraContextCount),
  });
  if (plan.kind !== "start-run" || !agent || !activeBridge) return null;
  let submittedDraft: PromptDraft | undefined;
  if (!args.preservePromptDraft && !args.queued) {
    args.set((state) => {
      submittedDraft = state.promptDraftByTask[args.taskId];
      return {
        promptDraftByTask: {
          ...state.promptDraftByTask,
          [args.taskId]: buildClearedPromptDraft(state.promptDraftByTask[args.taskId]),
        },
      };
    });
  }
  // The row the run will write: the assignment, its instructions to come.
  const pendingId = `agent-run:${crypto.randomUUID()}`;
  const ownsRow = beginPendingAgentRun({
    id: pendingId,
    taskId: args.taskId,
    startedAt: Date.now(),
    userMessage: buildOutgoingUserMessage({ id: `pending-${pendingId}`, content: args.prompt.trim() }),
  });
  return async () => {
    const response = await activeBridge
      .start(
        buildAgentRunStartInput({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          agent: { name: agent.agentName, workflow: agent.agentWorkflow, checkIns: agent.agentCheckIns },
          assignment: buildAgentRunAssignment(args.prompt, args.promptDraft),
          adaptive: args.promptDraft.runtimeOverrides?.agentRunAdaptive,
          ...((args.queued || args.promptDraft.runtimeOverrides?.agentRunAdaptive) ? { routingIntent: (() => {
            const { model, modelProviderId, autoRouting, claudeEffort, codexReasoningEffort, claudeAccountProfileId, codexAccountProfileId } = args.promptDraft.runtimeOverrides ?? {};
            return { model, modelProviderId: modelProviderId ?? (args.providerId === "codex" || args.providerId === "claude-code" ? args.providerId : undefined), autoRouting, claudeEffort, codexReasoningEffort, claudeAccountProfileId, codexAccountProfileId };
          })() } : {}),
          ...(args.accounts ? { accounts: args.accounts } : {}),
          now: args.now ?? new Date(),
        }),
      )
      .catch((): AgentRunCommandResponse => ({ ok: false, agentRun: null }));
    if (!response.ok || !response.agentRun) {
      if (ownsRow) endPendingAutoRoute({ taskId: args.taskId, id: pendingId });
      const message = response.message ?? i18n.t("agentRuns:agentRunSend.unsentReason");
      args.set((state) => recoverUnsentAgentRunPrompt(state, {
        workspaceId: args.workspaceId, taskId: args.taskId, prompt: args.prompt,
        submittedDraft, reason: message,
      }));
      toast.warning(i18n.t("agentRuns:agentRunSend.copy"), { description: message });
      return { status: "blocked", message };
    }
    if (args.queuedTurnId) args.set((state) => {
      const remove = (draft: PromptDraft | undefined) => draft ? { ...draft, queuedTurns: draft.queuedTurns?.filter((turn) => turn.id !== args.queuedTurnId),
        queuedNextTurn: undefined } : draft;
      if (state.activeWorkspaceId === args.workspaceId) return { promptDraftByTask: { ...state.promptDraftByTask, [args.taskId]: remove(state.promptDraftByTask[args.taskId])! }, workspaceSnapshotVersion: state.workspaceSnapshotVersion + 1 };
      const cached = state.workspaceRuntimeCacheById[args.workspaceId];
      return cached ? { workspaceRuntimeCacheById: { ...state.workspaceRuntimeCacheById, [args.workspaceId]: { ...cached,
        promptDraftByTask: { ...cached.promptDraftByTask, [args.taskId]: remove(cached.promptDraftByTask[args.taskId])! } } } } : {};
    });
    const agentRunId = response.agentRun.agentRun.id;
    if (ownsRow) {
      updatePendingAutoRoute({ taskId: args.taskId, id: pendingId, patch: { agentRun: { agentRunId } } });
      activeBridge.watchFirstPrompt({ workspaceId: args.workspaceId, taskId: args.taskId, agentRunId }, (end) => {
        endPendingAutoRoute({ taskId: args.taskId, id: pendingId });
        if (end.outcome !== "ended") return;
        args.set((state) =>
          recoverUnsentAgentRunPrompt(state, {
            workspaceId: args.workspaceId,
            taskId: args.taskId,
            prompt: args.prompt,
            submittedDraft,
            reason: end.reason,
          }),
        );
      });
    }
    return { status: "run-started", taskId: args.taskId, workspaceId: args.workspaceId, agentRunId };
  };
}

/** `prepareAgentRunForSend` and its start in one call. */
export async function startAgentRunForSend(args: AgentRunSendArgs): Promise<SendUserMessageResult | null> {
  const start = prepareAgentRunForSend(args);
  return start ? await start() : null;
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
  const active = bridge.activeAgentRun(args.workspaceId, args.taskId);
  if (!active?.agentOrigin) return false;
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

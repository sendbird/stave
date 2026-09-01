import { startProviderTurnActivity } from "@/lib/providers/turn-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AppState } from "@/store/app-store.types";
import { buildSteeredUserMessageState } from "@/store/chat-state-helpers";
import { applySteeredPromptDraft } from "@/store/prompt-draft-send";
import { getConfiguredModelForProvider } from "@/store/prompt-draft-runtime";
import type { PromptDraft, PromptDraftQueuedTurn } from "@/types/chat";

/**
 * Fold an accepted steer into the store.
 *
 * The steered text becomes a user message attached to the turn it was steered
 * into, the queued item it came from (if any) leaves the queue, and turn
 * activity restarts so the stall net re-arms on the still-running turn. The
 * task may live in a background workspace, in which case every write lands in
 * that workspace's runtime cache instead of the active session slice.
 *
 * The turn can finish inside the provider's acknowledgement window, so
 * `turnStillActive` is re-read here rather than trusted from the caller.
 */
export function applySteeredTurnState(args: {
  state: AppState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  content: string;
  clientMessageId: string;
  storedDraft?: PromptDraft;
  sourceDraft: PromptDraft;
  sentDraft: PromptDraft;
  preservePromptDraft?: boolean;
  steeredQueuedTurn?: PromptDraftQueuedTurn;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
}): Partial<AppState> {
  const { state, taskId, turnId } = args;
  const isActiveWorkspace = args.workspaceId === state.activeWorkspaceId;
  const cachedSession = isActiveWorkspace
    ? null
    : state.workspaceRuntimeCacheById[args.workspaceId];
  if (!isActiveWorkspace && !cachedSession) {
    return state;
  }
  const messagesByTask = cachedSession?.messagesByTask ?? state.messagesByTask;
  const messageCountByTask =
    cachedSession?.messageCountByTask ?? state.messageCountByTask;
  const activeTurnIdsByTask =
    cachedSession?.activeTurnIdsByTask ?? state.activeTurnIdsByTask;
  const turnStillActive = activeTurnIdsByTask[taskId] === turnId;
  const steeredState = buildSteeredUserMessageState({
    messagesByTask,
    messageCountByTask,
    taskId,
    content: args.content,
    steeredIntoTurnId: turnId,
    clientMessageId: args.clientMessageId,
    provider: args.providerId,
    activeModel: getConfiguredModelForProvider(args.providerId, state.settings),
    turnStillActive,
  });
  const nextPromptDraftByTask = applySteeredPromptDraft({
    promptDraftByTask: cachedSession?.promptDraftByTask ?? state.promptDraftByTask,
    taskId,
    storedDraft: args.storedDraft,
    sourceDraft: args.sourceDraft,
    sentDraft: args.sentDraft,
    preservePromptDraft: args.preservePromptDraft,
    steeredQueuedTurn: args.steeredQueuedTurn,
  });
  const providerTurnActivityByTask = turnStillActive
    ? startProviderTurnActivity({
        activityByTask: state.providerTurnActivityByTask,
        taskId,
        turnId,
        providerId: args.providerId,
      })
    : state.providerTurnActivityByTask;
  if (cachedSession) {
    return {
      workspaceRuntimeCacheById: {
        ...state.workspaceRuntimeCacheById,
        [args.workspaceId]: {
          ...cachedSession,
          ...steeredState,
          promptDraftByTask: nextPromptDraftByTask,
        },
      },
      providerTurnActivityByTask,
    };
  }
  return {
    ...steeredState,
    promptDraftByTask: nextPromptDraftByTask,
    providerTurnActivityByTask,
    workspaceSnapshotVersion: args.incrementWorkspaceSnapshotVersion(state),
  };
}

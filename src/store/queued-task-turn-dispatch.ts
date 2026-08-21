import type { WorkspaceSessionState } from "@/store/workspace-session-state";

interface QueuedTaskTurnActions {
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    turnOrigin: "conversation" | "utility";
    queuedTurnId: string;
  }) => unknown;
}

export function createQueuedTaskTurnDispatcher(args: {
  getSession: (workspaceId: string) => WorkspaceSessionState | null;
  getActions: () => QueuedTaskTurnActions;
  /**
   * Whether an item must sit out automatic dispatch — currently only true
   * while a steer that promotes it into the running turn is in flight or
   * unconfirmed. Sending it here would run the same prompt a second time, so
   * such items are skipped and stay queued for the user to act on.
   */
  blocksAutoDispatch: (target: {
    taskId: string;
    queuedTurnId: string;
  }) => boolean;
}) {
  return (target: { workspaceId: string; taskId: string }) => {
    const queuedPromptDraft =
      args.getSession(target.workspaceId)?.promptDraftByTask[target.taskId];
    const nextQueuedTurn = (queuedPromptDraft?.queuedTurns ?? []).find(
      (item) =>
        !args.blocksAutoDispatch({
          taskId: target.taskId,
          queuedTurnId: item.id,
        }),
    );
    if (!nextQueuedTurn) {
      return;
    }

    // Auto-dispatch routes through the same queued-turn path as a manual
    // "send now" (`queuedTurnId`): the send uses the provider/model stored on
    // the queued item at queue time, and only that item leaves the queue —
    // the composer draft, including text typed while the previous turn
    // streamed, stays untouched.
    void args.getActions().sendUserMessage({
      taskId: target.taskId,
      content: nextQueuedTurn.content,
      // The user typed and queued this follow-up themselves; it is the task's
      // own dialogue, just delivered on turn completion instead of on Enter.
      turnOrigin: "conversation",
      queuedTurnId: nextQueuedTurn.id,
    });
  };
}

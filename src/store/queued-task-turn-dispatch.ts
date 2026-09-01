import type { WorkspaceSessionState } from "@/store/workspace-session-state";

/**
 * Why a queued item cannot be auto-dispatched right now.
 *
 * - `wait`: the block is temporary and will resolve on its own (a steer for
 *   this exact item is still awaiting the provider's acknowledgement). The
 *   queue holds its position and nothing behind it may jump the line — the
 *   release path re-runs the drain once the hold clears.
 * - `skip`: the block needs a deliberate user action to clear (delivery was
 *   never confirmed, so automatic dispatch could duplicate the prompt). The
 *   item stays queued and draining continues with the item behind it.
 */
export type QueuedTurnAutoDispatchHold = "wait" | "skip";

interface SendUserMessageOutcome {
  status?: string;
}

interface QueuedTaskTurnActions {
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    turnOrigin: "conversation" | "utility";
    queuedTurnId: string;
  }) => unknown;
}

/** Statuses that mean a turn actually took ownership of the queued item. */
const STARTED_SEND_STATUSES = new Set(["started", "steered"]);

export function createQueuedTaskTurnDispatcher(args: {
  getSession: (workspaceId: string) => WorkspaceSessionState | null;
  getActions: () => QueuedTaskTurnActions;
  /**
   * Whether an item must sit out automatic dispatch — currently only true
   * while a steer that promotes it into the running turn is in flight or
   * unconfirmed. Sending it here would run the same prompt a second time.
   */
  getAutoDispatchHold: (target: {
    taskId: string;
    queuedTurnId: string;
  }) => QueuedTurnAutoDispatchHold | undefined;
  onDispatchFailed?: (failure: {
    taskId: string;
    queuedTurnId: string;
    error: unknown;
  }) => void;
}) {
  /**
   * Tasks whose dispatch is between "left the queue" and "turn registered".
   *
   * `sendUserMessage` clears the queued item optimistically and then awaits
   * file contexts, auto-routing and provider setup before an `activeTurnId`
   * exists. Turn completion can be signalled twice in that window (provider
   * events and host turn sync both drain the queue), and neither observer can
   * see a turn that has not been registered yet — so without this guard the
   * second signal starts the *next* queued item concurrently with the first.
   */
  const inFlightTaskIds = new Map<string, { retriggered: boolean }>();
  /**
   * Queued items whose dispatch already threw once. A crashed dispatch puts
   * the item back in the queue but leaves nothing to trigger another drain, so
   * one retry is issued — bounded, so a deterministically failing item can
   * never spin.
   */
  const retriedQueuedTurnIds = new Set<string>();

  const dispatch = (target: { workspaceId: string; taskId: string }) => {
    const inFlight = inFlightTaskIds.get(target.taskId);
    if (inFlight) {
      // A dispatch for this task is mid-flight. Remember the signal so the
      // drain resumes if that dispatch ends without starting a turn.
      inFlight.retriggered = true;
      return;
    }

    const queuedPromptDraft =
      args.getSession(target.workspaceId)?.promptDraftByTask[target.taskId];
    const queuedTurns = queuedPromptDraft?.queuedTurns ?? [];

    let nextQueuedTurn: (typeof queuedTurns)[number] | undefined;
    for (const item of queuedTurns) {
      const hold = args.getAutoDispatchHold({
        taskId: target.taskId,
        queuedTurnId: item.id,
      });
      if (hold === "wait") {
        // FIFO: a temporarily held head keeps its place. Dispatching the item
        // behind it would reorder the user's queue for a hold that is about to
        // clear anyway.
        return;
      }
      if (hold === "skip") {
        continue;
      }
      nextQueuedTurn = item;
      break;
    }
    if (!nextQueuedTurn) {
      return;
    }

    const dispatchState = { retriggered: false };
    inFlightTaskIds.set(target.taskId, dispatchState);

    // Auto-dispatch routes through the same queued-turn path as a manual
    // "send now" (`queuedTurnId`): the send uses the provider/model stored on
    // the queued item at queue time, and only that item leaves the queue —
    // the composer draft, including text typed while the previous turn
    // streamed, stays untouched.
    const queuedTurnId = nextQueuedTurn.id;
    let sendResult: unknown;
    try {
      sendResult = args.getActions().sendUserMessage({
        taskId: target.taskId,
        content: nextQueuedTurn.content,
        // The user typed and queued this follow-up themselves; it is the task's
        // own dialogue, just delivered on turn completion instead of on Enter.
        turnOrigin: "conversation",
        queuedTurnId,
      });
    } catch (error) {
      settleDispatch({ target, queuedTurnId, started: false, error });
      return;
    }

    void Promise.resolve(sendResult).then(
      (result) => {
        const status = (result as SendUserMessageOutcome | undefined)?.status;
        settleDispatch({
          target,
          queuedTurnId,
          started: !!status && STARTED_SEND_STATUSES.has(status),
        });
      },
      (error: unknown) => {
        settleDispatch({ target, queuedTurnId, started: false, error });
      },
    );
  };

  function settleDispatch(settle: {
    target: { workspaceId: string; taskId: string };
    queuedTurnId: string;
    started: boolean;
    error?: unknown;
  }) {
    const dispatchState = inFlightTaskIds.get(settle.target.taskId);
    inFlightTaskIds.delete(settle.target.taskId);

    if (settle.started) {
      // The item owns a turn now; its completion drains the queue again.
      retriedQueuedTurnIds.delete(settle.queuedTurnId);
      return;
    }

    if (settle.error !== undefined) {
      args.onDispatchFailed?.({
        taskId: settle.target.taskId,
        queuedTurnId: settle.queuedTurnId,
        error: settle.error,
      });
      if (!retriedQueuedTurnIds.has(settle.queuedTurnId)) {
        // The send never reached a turn, so the item is back in the queue with
        // nothing left to wake it. Retry exactly once.
        retriedQueuedTurnIds.add(settle.queuedTurnId);
        dispatch(settle.target);
        return;
      }
      return;
    }

    // A non-error, non-started result is a deliberate refusal (`blocked`, a
    // steer that needs the user, …). Re-draining on our own would loop against
    // the same condition, so only an independently observed completion signal
    // that arrived mid-flight resumes the drain.
    if (dispatchState?.retriggered) {
      dispatch(settle.target);
    }
  }

  return dispatch;
}

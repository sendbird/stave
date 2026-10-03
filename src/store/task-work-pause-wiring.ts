import { findUsageLimitStop } from "@/lib/providers/usage-limit-stop";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { AppState } from "@/store/app-store.types";
import type {
  QueuedTurnAutoDispatchHold,
  QueuedTurnBlockedResult,
} from "@/store/queued-task-turn-dispatch";
import { resolveQueuedTurnPauseHold } from "@/store/task-work-pause";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";

/**
 * Where the turn and queue paths meet the task pause. Kept out of the store
 * and the send action so each hook there stays a single call.
 */

type QueueTarget = { workspaceId: string; taskId: string };

/** The queue dispatcher's hold for a paused task (usage limit or restart). */
export function resolvePausedQueueHold(
  state: Pick<AppState, "usageLimitPauseByTask" | "restoredQueueReleasedByTask">,
  target: { taskId: string; queuedAt: string },
): QueuedTurnAutoDispatchHold | undefined {
  return resolveQueuedTurnPauseHold({
    item: target,
    usageLimitPause: state.usageLimitPauseByTask[target.taskId],
    restoredQueueReleased: state.restoredQueueReleasedByTask[target.taskId] === true,
  });
}

/**
 * The account ran out before a queued turn could start: hold the rest of the
 * queue instead of offering it to the same limit again.
 */
export function pauseQueueOnUsageLimitRefusal(
  get: () => AppState,
  blocked: QueueTarget & { result: QueuedTurnBlockedResult },
) {
  const usageLimit = blocked.result.usageLimit;
  if (blocked.result.reason !== "account-limit" || !usageLimit) {
    return;
  }
  get().pauseTaskForUsageLimit({
    taskId: blocked.taskId,
    workspaceId: blocked.workspaceId,
    providerId: usageLimit.providerId,
    model: usageLimit.model,
    stoppedTurn: false,
    usageLimit,
  });
}

/**
 * A turn the task runs as its own dialogue answers a usage-limit pause: the
 * limit no longer refuses this task, so its queue may drain behind the turn.
 */
export function endUsageLimitPauseOnTurnStart(
  get: () => AppState,
  taskId: string,
  turnOrigin: "conversation" | "utility" | undefined,
) {
  if (turnOrigin !== "utility" && get().usageLimitPauseByTask[taskId]) {
    get().dismissUsageLimitPause({ taskId });
  }
}

/**
 * After a turn settles: pause the task when a usage limit ended the turn,
 * then drain the queue (which honours that pause).
 */
export function settleTaskQueueAfterTurn(
  get: () => AppState,
  dispatchNextQueuedTaskTurn: (target: QueueTarget) => void,
  turn: QueueTarget & {
    /** The turn's provider; defaults to the task's. */
    providerId?: ProviderId;
    model?: string;
    turnOrigin?: "conversation" | "utility";
  },
) {
  const session = getWorkspaceSessionForState({
    state: get(),
    workspaceId: turn.workspaceId,
  });
  const providerId =
    turn.providerId ??
    session?.tasks.find((task) => task.id === turn.taskId)?.provider;
  if (
    turn.turnOrigin !== "utility" &&
    providerId &&
    findUsageLimitStop(session?.messagesByTask[turn.taskId])
  ) {
    get().pauseTaskForUsageLimit({
      taskId: turn.taskId,
      workspaceId: turn.workspaceId,
      providerId,
      model: turn.model,
      stoppedTurn: true,
    });
  }
  dispatchNextQueuedTaskTurn({
    workspaceId: turn.workspaceId,
    taskId: turn.taskId,
  });
}

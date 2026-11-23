import { findUsageLimitStop, findUsageLimitStopInEvents } from "@/lib/providers/usage-limit-stop";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import { classifyProviderTurnStopReason } from "@/lib/providers/turn-stop-reason";
import type { AppState } from "@/store/app-store.types";
import type {
  QueuedTurnAutoDispatchHold,
  QueuedTurnBlockedResult,
} from "@/store/queued-task-turn-dispatch";
import { resolveQueuedTurnPauseHold } from "@/store/task-work-pause";
import { USER_STOPPED_TURN_REASONS } from "@/store/provider-message.utils";
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
    restoredQueueReleased: state.restoredQueueReleasedByTask[target.taskId],
  });
}

/**
 * The account ran out before a queued turn could start: hold the rest of the
 * queue instead of offering it to the same limit again.
 */
export function pauseQueueOnUsageLimitRefusal(
  get: () => AppState,
  blocked: QueueTarget & { queuedTurnId?: string; result: QueuedTurnBlockedResult },
) {
  const usageLimit = blocked.result.usageLimit;
  if (blocked.result.reason !== "account-limit" || !usageLimit) {
    return;
  }
  get().pauseTaskForUsageLimit({
    taskId: blocked.taskId,
    workspaceId: blocked.workspaceId,
    providerId: usageLimit.providerId,
    accountProfileId: usageLimit.accountProfileId,
    model: usageLimit.model,
    stoppedTurn: false,
    origin: blocked.queuedTurnId ? { kind: "queue", id: blocked.queuedTurnId } : undefined,
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
    turnId?: string;
    /** Captured execution identity; the persisted assistant row takes precedence. */
    providerId?: ProviderId;
    accountProfileId?: string;
    model?: string;
    turnOrigin?: "conversation" | "utility";
    done?: Extract<NormalizedProviderEvent, { type: "done" }>;
  },
) {
  const session = getWorkspaceSessionForState({
    state: get(),
    workspaceId: turn.workspaceId,
  });
  if (!session || session.activeTurnIdsByTask[turn.taskId]) return;
  const stopReason = turn.done?.stop_reason?.trim().toLowerCase() ?? "";
  if (classifyProviderTurnStopReason(stopReason) === "cancelled") return;
  const messages = session.messagesByTask[turn.taskId];
  const last = messages?.at(-1);
  const recorded = last?.role === "assistant" ? last : undefined;
  const providerId =
    (recorded?.providerId !== "user" ? recorded?.providerId : undefined) ?? turn.providerId ??
    session.tasks.find((task) => task.id === turn.taskId)?.provider;
  const originatingTurnId = turn.turnId ?? recorded?.turnId;
  const terminalLimit = turn.done ? findUsageLimitStopInEvents([turn.done]) : null;
  if (
    turn.turnOrigin !== "utility" &&
    providerId &&
    (terminalLimit || findUsageLimitStop(messages))
  ) {
    get().pauseTaskForUsageLimit({
      taskId: turn.taskId,
      workspaceId: turn.workspaceId,
      providerId,
      accountProfileId: terminalLimit?.accountProfileId ?? recorded?.nativeAccountProfileId ?? turn.accountProfileId,
      model: recorded?.model || turn.model,
      stoppedTurn: true,
      origin: originatingTurnId ? { kind: "turn", id: originatingTurnId } : undefined,
    });
  }
  if (USER_STOPPED_TURN_REASONS.includes(stopReason)) return;
  dispatchNextQueuedTaskTurn({
    workspaceId: turn.workspaceId,
    taskId: turn.taskId,
  });
}

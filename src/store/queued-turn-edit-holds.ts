import type { AppState } from "@/store/app-store.types";
import type { QueuedTurnAutoDispatchHold } from "@/store/queued-task-turn-dispatch";

export interface QueuedTurnEditHoldTarget {
  taskId: string;
  queuedTurnId: string;
}

function buildHoldKey(target: QueuedTurnEditHoldTarget) {
  return `${target.taskId}::${target.queuedTurnId}`;
}

/**
 * Keeps a queued message from being sent while the user is editing it.
 *
 * The edit lives in the composer until Save. Without a hold, a turn that
 * completes mid-edit drains the queue and sends the text as it was before the
 * edit, and the editor disappears with the unsaved change. The held item keeps
 * its place (`wait`), so nothing behind it jumps the line; releasing the hold
 * is the caller's cue to drain the queue again.
 *
 * Holds are in-memory and keyed by the queued item's id, like steer
 * reservations: a reload ends every edit, and a stale key can never match a
 * different item. The workspace is remembered so the release can drain the
 * right session even if the user has moved to another workspace since, and
 * the hold records whether it actually stopped a dispatch: only then does the
 * release owe the queue a drain.
 */
export function createQueuedTurnEditHolds() {
  const holdsByKey = new Map<
    string,
    { workspaceId: string; suppressedDispatch: boolean }
  >();

  return {
    hold(target: QueuedTurnEditHoldTarget & { workspaceId: string }) {
      holdsByKey.set(buildHoldKey(target), {
        workspaceId: target.workspaceId,
        suppressedDispatch: false,
      });
    },
    /** Ends the hold; reports where it was taken and whether it stopped a send. */
    release(
      target: QueuedTurnEditHoldTarget,
    ): { workspaceId: string; suppressedDispatch: boolean } | null {
      const key = buildHoldKey(target);
      const entry = holdsByKey.get(key);
      holdsByKey.delete(key);
      return entry ?? null;
    },
    getAutoDispatchHold(
      target: QueuedTurnEditHoldTarget,
    ): QueuedTurnAutoDispatchHold | undefined {
      const entry = holdsByKey.get(buildHoldKey(target));
      if (!entry) {
        return undefined;
      }
      entry.suppressedDispatch = true;
      return "wait";
    },
  };
}

export type QueuedTurnEditHolds = ReturnType<typeof createQueuedTurnEditHolds>;

/** The store actions the composer's queue editor calls. */
export function createQueuedTurnEditActions(args: {
  holds: QueuedTurnEditHolds;
  get: () => Pick<AppState, "activeWorkspaceId">;
  /** Dispatch the next queued item if the task is idle. */
  drain: (target: { workspaceId: string; taskId: string }) => void;
}): Pick<AppState, "holdQueuedTurnForEdit" | "releaseQueuedTurnEditHold"> {
  return {
    holdQueuedTurnForEdit: ({ taskId, queuedTurnId }) => {
      const workspaceId = args.get().activeWorkspaceId;
      if (!taskId || !queuedTurnId || !workspaceId) {
        return;
      }
      args.holds.hold({ workspaceId, taskId, queuedTurnId });
    },
    releaseQueuedTurnEditHold: ({ taskId, queuedTurnId }) => {
      const released = args.holds.release({ taskId, queuedTurnId });
      // Drain only when the edit actually stopped a send (a turn completed
      // mid-edit). Whether the item was saved, emptied away or removed, the
      // queue behind it has been waiting on this edit; the drain itself does
      // nothing while a turn is running. An open editor hides its row's Send
      // and Steer, so the item cannot have been sent by hand meanwhile.
      if (!released?.suppressedDispatch) {
        return;
      }
      args.drain({ workspaceId: released.workspaceId, taskId });
    },
  };
}

import type { ProviderId } from "@/lib/providers/provider.types";
import {
  startProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import type { Task } from "@/types/chat";

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

interface StallTimerScheduler {
  (target: { taskId: string; turnId: string; lastEventAt: number }): void;
}

/**
 * Build the "the provider is still streaming" reporter that keeps the stall /
 * auto-abort net disarmed.
 *
 * Liveness has to be driven by IPC *arrival*, not by the rAF-batched visual
 * flush: Electron throttles or fully pauses `requestAnimationFrame` while the
 * window is hidden, minimized, or occluded, whereas the wall-clock stall timer
 * keeps running. Deriving liveness from the flush therefore let a backgrounded
 * window receiving a perfectly healthy stream trip "the provider went silent."
 *
 * The turn-id guard keeps a late event that arrives after the turn was cleared
 * (done / abort) from resurrecting a stray timer. The timer's own fire callback
 * re-checks turn liveness and the pending-prompt exemption on top of this.
 */
export function createProviderTurnLivenessReporter(deps: {
  getActivityByTask: () => ProviderTurnActivityByTask;
  scheduleStallTimer: StallTimerScheduler;
  now?: () => number;
}) {
  return (args: { taskId: string; turnId: string }) => {
    if (deps.getActivityByTask()[args.taskId]?.turnId !== args.turnId) {
      return;
    }
    deps.scheduleStallTimer({
      taskId: args.taskId,
      turnId: args.turnId,
      lastEventAt: deps.now?.() ?? Date.now(),
    });
  };
}

export interface AdoptedProviderTurn {
  taskId: string;
  turnId: string;
  providerId: ProviderId;
}

/**
 * Find in-flight turns a session just adopted from persistence that no live
 * tracking covers.
 *
 * The stall / auto-abort net (`scheduleProviderTurnStallTimer` →
 * `createStalledProviderTurnAborter`) is armed from provider events as they
 * arrive, and its timers live only in renderer memory. A session rebuilt from
 * the database, however, restores `activeTurnIdsByTask` straight from every turn
 * row without a `completedAt` (see `buildWorkspaceSessionStateFromShell`). A
 * turn adopted that way is displayed as active while nothing at all watches it:
 * no timer is armed, and — because `markProviderTurnStalled` requires a
 * matching activity snapshot — no timer *could* mark it stalled even if one
 * were. If the process that owns it never emits again (host crashed, worker
 * killed, its `done` lost), the task stays "active" forever and pins its
 * workspace to "active" in the sidebar.
 *
 * Turns that already carry a matching activity snapshot are deliberately
 * excluded: whatever created the snapshot armed a timer alongside it, and
 * re-seeding here would reset a stall marker that is legitimately set.
 */
export function collectAdoptedTurnsWithoutStallNet(args: {
  tasks: Array<Pick<Task, "id" | "provider">>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  activityByTask: ProviderTurnActivityByTask;
}): AdoptedProviderTurn[] {
  const adopted: AdoptedProviderTurn[] = [];
  for (const task of args.tasks) {
    const turnId = args.activeTurnIdsByTask[task.id];
    if (!turnId || args.activityByTask[task.id]?.turnId === turnId) {
      continue;
    }
    adopted.push({
      taskId: task.id,
      turnId,
      providerId: task.provider,
    });
  }
  return adopted;
}

/**
 * Put every in-flight turn a rebuilt session just adopted under the stall net:
 * seed the liveness snapshot the net needs, then arm its timer.
 *
 * Liveness is dated from adoption rather than from the persisted turn row. The
 * renderer only knows the turn was alive from the moment it took it over, and
 * back-dating would instantly reclaim a healthy host turn that has been
 * streaming happily for longer than the grace window.
 */
export function adoptRestoredTurnsIntoStallNet(args: {
  tasks: Array<Pick<Task, "id" | "provider">>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  getActivityByTask: () => ProviderTurnActivityByTask;
  applyActivityPatch: (
    updater: (activityByTask: ProviderTurnActivityByTask) => {
      providerTurnActivityByTask: ProviderTurnActivityByTask;
    },
  ) => void;
  scheduleStallTimer: StallTimerScheduler;
  now?: number;
}) {
  const adopted = collectAdoptedTurnsWithoutStallNet({
    tasks: args.tasks,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
    activityByTask: args.getActivityByTask(),
  });
  if (adopted.length === 0) {
    return adopted;
  }

  const now = args.now ?? Date.now();
  args.applyActivityPatch((activityByTask) => ({
    providerTurnActivityByTask: adopted.reduce(
      (nextActivityByTask, turn) =>
        startProviderTurnActivity({
          activityByTask: nextActivityByTask,
          taskId: turn.taskId,
          turnId: turn.turnId,
          providerId: turn.providerId,
          now,
        }),
      activityByTask,
    ),
  }));
  for (const turn of adopted) {
    args.scheduleStallTimer({
      taskId: turn.taskId,
      turnId: turn.turnId,
      lastEventAt: now,
    });
  }
  return adopted;
}

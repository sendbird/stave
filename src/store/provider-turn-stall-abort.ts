import {
  clearProviderTurnActivity,
  markProviderTurnStalled,
  PROVIDER_TURN_AUTO_ABORT_GRACE_MS,
  resolveProviderTurnStallThresholdMs,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import { findLatestPendingToolInteraction } from "@/store/provider-message.utils";
import {
  interruptActiveTaskTurns,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import type { ChatMessage } from "@/types/chat";

export const PROVIDER_TURN_AUTO_ABORT_NOTICE =
  "Generation was stopped automatically because the provider went silent for too long.";

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

/**
 * Arm the force-abort follow-up for a turn that was just marked "stalled."
 *
 * Gives the turn one more grace window in case the provider is merely slow,
 * then force-aborts so a turn that never resumes (dead subprocess, hung
 * stream, dropped event) cannot keep its task — and therefore its workspace —
 * marked "active" forever. Deliberately reuses the caller's stall-timer map so
 * a fresh provider event before this fires reschedules cleanly: the caller's
 * scheduler clears this handle first.
 */
export function scheduleStalledTurnAutoAbort(args: {
  taskId: string;
  turnId: string;
  timerByTask: Map<string, ReturnType<typeof globalThis.setTimeout>>;
  autoAbort: (target: { taskId: string; turnId: string }) => void;
}) {
  const handle = globalThis.setTimeout(() => {
    args.timerByTask.delete(args.taskId);
    args.autoAbort({ taskId: args.taskId, turnId: args.turnId });
  }, PROVIDER_TURN_AUTO_ABORT_GRACE_MS);
  args.timerByTask.set(args.taskId, handle);
}

/**
 * Build the scheduler that arms the "no events for a while" watch for one turn.
 *
 * Called on every provider event arrival (see
 * `createProviderTurnLivenessReporter`), so it always clears the previous handle
 * first and re-arms from the new `lastEventAt`. When the window elapses in
 * silence the turn is marked stalled — a display state only — and
 * `scheduleStalledTurnAutoAbort` takes over for the force-abort follow-up.
 */
export function createProviderTurnStallTimerScheduler<
  TState extends StalledTurnAbortState,
>(deps: {
  getState: () => TState;
  applyPatch: (updater: (state: TState) => Partial<TState>) => void;
  getWorkspaceSession: (args: {
    state: TState;
    workspaceId: string;
  }) => WorkspaceSessionState | null;
  timerByTask: Map<string, ReturnType<typeof globalThis.setTimeout>>;
  clearStallTimer: (taskId: string) => void;
  autoAbort: (target: { taskId: string; turnId: string }) => void;
}) {
  return (args: { taskId: string; turnId: string; lastEventAt: number }) => {
    deps.clearStallTimer(args.taskId);
    const providerId =
      deps.getState().providerTurnActivityByTask[args.taskId]?.providerId;
    const delayMs = Math.max(
      0,
      resolveProviderTurnStallThresholdMs({ providerId }) -
        (Date.now() - args.lastEventAt),
    );
    const handle = globalThis.setTimeout(() => {
      deps.timerByTask.delete(args.taskId);
      let markedStalled = false;
      deps.applyPatch((state) => {
        // `state.activeTurnIdsByTask` only covers the active workspace; resolve
        // the owning workspace session so turns running in a backgrounded
        // workspace can still be marked stalled.
        const owningWorkspaceId =
          state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId;
        const owningSession = owningWorkspaceId
          ? deps.getWorkspaceSession({ state, workspaceId: owningWorkspaceId })
          : null;
        if (
          !owningSession ||
          owningSession.activeTurnIdsByTask[args.taskId] !== args.turnId
        ) {
          return state;
        }
        const providerTurnActivityByTask = markProviderTurnStalled({
          activityByTask: state.providerTurnActivityByTask,
          taskId: args.taskId,
          turnId: args.turnId,
          // Verified against the transcript, never trusted: see the
          // `hasPendingPrompt` contract in `markProviderTurnStalled`.
          hasPendingPrompt: Boolean(
            findLatestPendingToolInteraction({
              messages: owningSession.messagesByTask[args.taskId] ?? [],
            }),
          ),
        });
        if (providerTurnActivityByTask === state.providerTurnActivityByTask) {
          return state;
        }
        markedStalled = true;
        return { providerTurnActivityByTask } as Partial<TState>;
      });

      if (!markedStalled) {
        // Turn already ended, moved on, or is genuinely waiting on an
        // unanswered approval / user-input prompt (`markProviderTurnStalled`
        // excludes those) — no follow-up needed.
        return;
      }

      scheduleStalledTurnAutoAbort({
        taskId: args.taskId,
        turnId: args.turnId,
        timerByTask: deps.timerByTask,
        autoAbort: deps.autoAbort,
      });
    }, delayMs);
    deps.timerByTask.set(args.taskId, handle);
  };
}

/** The slice of the app store this module reads. */
export interface StalledTurnAbortState {
  activeWorkspaceId: string;
  taskWorkspaceIdById: Record<string, string>;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  workspaceSnapshotVersion: number;
}

/** The slice of the app store this module writes. */
export interface StalledTurnAbortPatch {
  providerTurnActivityByTask: ProviderTurnActivityByTask;
  messagesByTask?: Record<string, ChatMessage[]>;
  activeTurnIdsByTask?: Record<string, string | undefined>;
  workspaceRuntimeCacheById?: Record<string, WorkspaceSessionState>;
  workspaceSnapshotVersion?: number;
}

/**
 * Build the force-terminate routine for a turn that has been silently stalled
 * (no events, no pending approval/user-input) for
 * `PROVIDER_TURN_STALL_THRESHOLD_MS + PROVIDER_TURN_AUTO_ABORT_GRACE_MS`.
 *
 * This is the safety net for turns that never resume and never emit `done` —
 * the underlying cause (dead subprocess, hung network stream, a dropped bridge
 * event) does not matter; silence past the grace window is treated as dead.
 * Works for tasks in the active workspace *and* backgrounded workspaces
 * (mirrors the pattern already used by
 * `interruptWorkspaceTurnsBeforeTransition` / `archiveTask`), since a stalled
 * turn in a workspace the user isn't currently viewing is exactly the
 * "workspace stuck showing active in the sidebar" symptom.
 */
export function createStalledProviderTurnAborter<
  TState extends StalledTurnAbortState,
>(deps: {
  getState: () => TState;
  applyPatch: (updater: (state: TState) => StalledTurnAbortPatch) => void;
  getWorkspaceSession: (args: {
    state: TState;
    workspaceId: string;
  }) => WorkspaceSessionState | null;
  clearStallTimer: (taskId: string) => void;
  abortTurn: (args: { turnId: string }) => void;
  cleanupTask: (args: { taskId: string }) => void;
  onTurnAborted: (args: {
    taskId: string;
    turnId: string;
    messages: ChatMessage[];
  }) => void;
}) {
  return (args: { taskId: string; turnId: string }) => {
    deps.clearStallTimer(args.taskId);
    const state = deps.getState();
    const owningWorkspaceId =
      state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId;
    const owningSession = owningWorkspaceId
      ? deps.getWorkspaceSession({ state, workspaceId: owningWorkspaceId })
      : null;
    if (
      !owningWorkspaceId ||
      !owningSession ||
      owningSession.activeTurnIdsByTask[args.taskId] !== args.turnId
    ) {
      // Turn already ended or was replaced by a newer one.
      return;
    }
    const task = owningSession.tasks.find((item) => item.id === args.taskId);
    if (!task) {
      return;
    }
    const activity = state.providerTurnActivityByTask[args.taskId];
    if (activity?.turnId !== args.turnId || activity.stalledAt == null) {
      // Resumed in the meantime, or replaced by a newer turn.
      return;
    }
    if (
      activity.pendingInteraction != null &&
      findLatestPendingToolInteraction({
        messages: owningSession.messagesByTask[args.taskId] ?? [],
      })
    ) {
      // Genuinely waiting on an approval / user-input prompt the user has not
      // answered yet — those have their own resolution paths and must never be
      // force-aborted here. The transcript is checked instead of trusting
      // `pendingInteraction` alone: a prompt resolved without the store
      // clearing that hint (managed host answering for the agent, runtime
      // auto-decline, message replay) would otherwise leave the task pinned to
      // "active" with no path left to reclaim it.
      return;
    }

    const interrupted = interruptActiveTaskTurns({
      tasks: [task],
      messagesByTask: owningSession.messagesByTask,
      activeTurnIdsByTask: owningSession.activeTurnIdsByTask,
      notice: PROVIDER_TURN_AUTO_ABORT_NOTICE,
      messageCountByTask: owningSession.messageCountByTask,
    });
    if (interrupted.interruptedTaskIds.length === 0) {
      return;
    }

    const isActiveWorkspace = owningWorkspaceId === state.activeWorkspaceId;
    deps.applyPatch((nextState) => {
      const providerTurnActivityByTask = clearProviderTurnActivity({
        activityByTask: nextState.providerTurnActivityByTask,
        taskId: args.taskId,
      });
      if (isActiveWorkspace) {
        return {
          providerTurnActivityByTask,
          messagesByTask: interrupted.messagesByTask,
          activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
          workspaceSnapshotVersion: nextState.workspaceSnapshotVersion + 1,
        };
      }
      const cachedSession =
        nextState.workspaceRuntimeCacheById[owningWorkspaceId];
      if (!cachedSession) {
        return { providerTurnActivityByTask };
      }
      return {
        providerTurnActivityByTask,
        workspaceRuntimeCacheById: {
          ...nextState.workspaceRuntimeCacheById,
          [owningWorkspaceId]: {
            ...cachedSession,
            messagesByTask: interrupted.messagesByTask,
            activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
          },
        },
        workspaceSnapshotVersion: nextState.workspaceSnapshotVersion + 1,
      };
    });

    console.warn(
      "[app.store] Auto-aborted a provider turn stalled past the grace window",
      {
        taskId: args.taskId,
        turnId: args.turnId,
        workspaceId: owningWorkspaceId,
      },
    );

    deps.abortTurn({ turnId: args.turnId });
    deps.cleanupTask({ taskId: args.taskId });
    deps.onTurnAborted({
      taskId: args.taskId,
      turnId: args.turnId,
      messages: interrupted.messagesByTask[args.taskId] ?? [],
    });
  };
}

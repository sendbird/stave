import { i18n } from "@/i18n";
import {
  decideTurnStall,
  resolveTurnStallEvidence,
  type TurnStallEvidence,
} from "@/lib/providers/turn-activity-evidence";
import type { RecordTurnWatchdogArgs } from "@/lib/providers/turn-history";

import {
  clearProviderTurnActivity,
  markProviderTurnStalled,
  resolveProviderTurnStallThresholdMs,
  retainRetiredTurnActivity,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnActivityByTask,
} from "@/lib/providers/turn-status";
import { remainingPendingInteraction } from "@/store/provider-message.utils";
import {
  interruptActiveTaskTurns,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import type { ChatMessage } from "@/types/chat";

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

// A restored turn may have saved tool calls without a live activity snapshot.
function findRestoredToolEvidence(
  messages: ChatMessage[] | undefined,
  turnId: string,
  now: number,
): TurnStallEvidence | undefined {
  for (const message of messages ?? []) {
    if (message.turnId !== turnId) continue;
    for (const part of message.parts) {
      if (part.type !== "tool_use" || part.state !== "input-available" || part.completedAt) continue;
      const startedAt = Date.parse(part.startedAt ?? "");
      if (Number.isFinite(startedAt)) {
        return { kind: "tool", name: part.toolName.slice(0, 200), elapsedMs: Math.max(0, now - startedAt) };
      }
    }
  }
  return undefined;
}

/** Re-evaluate the same quiet interval until the provider resumes or the turn settles. */
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
  recordDecision: (record: RecordTurnWatchdogArgs) => void;
  autoAbort: (target: { taskId: string; turnId: string; transportExited: boolean }) => void;
}) {
  return (args: { taskId: string; turnId: string; lastEventAt: number }) => {
    deps.clearStallTimer(args.taskId);
    const initialActivity = deps.getState().providerTurnActivityByTask[args.taskId];
    let lastDecision: string | undefined;
    let silenceStartedAt = args.lastEventAt;
    const checkAt = (deadline: number) => {
      const handle = globalThis.setTimeout(() => {
        if (deps.timerByTask.get(args.taskId) !== handle) return;
        deps.timerByTask.delete(args.taskId);
        const state = deps.getState();
        const activity = state.providerTurnActivityByTask[args.taskId];
        const workspaceId = state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId;
        const session = workspaceId ? deps.getWorkspaceSession({ state, workspaceId }) : null;
        if (
          session?.activeTurnIdsByTask[args.taskId] !== args.turnId ||
          activity?.turnId !== args.turnId || activity.completedAt != null ||
          activity.admission?.state === "queued"
        ) return;

        const now = Math.max(deadline, Date.now());
        const messages = session.messagesByTask[args.taskId];
        const pending = remainingPendingInteraction(messages, args.turnId);
        const liveEvidence = resolveTurnStallEvidence(activity.activityEvidence, pending, now);
        const evidence = liveEvidence.kind === "silence" && activity.activityEvidence?.tools == null
          ? findRestoredToolEvidence(messages, args.turnId, now) ?? liveEvidence
          : liveEvidence;
        const silentMs = Math.max(0, now - silenceStartedAt);
        if (pending) silenceStartedAt = now;
        // A prompt can settle through host replay without a fresh provider event.
        if (!pending && silentMs < resolveProviderTurnStallThresholdMs() && evidence.kind !== "transport_exit") {
          checkAt(silenceStartedAt + resolveProviderTurnStallThresholdMs());
          return;
        }
        const { decision, recheckAfterMs } = decideTurnStall(evidence, silentMs);
        const key = `${decision}:${evidence.kind}`;
        if (key !== lastDecision) {
          deps.recordDecision({
            workspaceId,
            taskId: args.taskId,
            turnId: args.turnId,
            entry: { kind: "watchdog", at: new Date(now).toISOString(), decision, evidence, silentMs },
          });
          lastDecision = key;
        }

        if (decision === "abort") {
          deps.autoAbort({ taskId: args.taskId, turnId: args.turnId, transportExited: evidence.kind === "transport_exit" });
          return;
        }
        if (decision === "offer_continuation") {
          deps.applyPatch((latest) => ({
            providerTurnActivityByTask: markProviderTurnStalled({
              activityByTask: latest.providerTurnActivityByTask,
              taskId: args.taskId,
              turnId: args.turnId,
              hasPendingPrompt: false,
              now,
            }),
          }) as Partial<TState>);
        } else if (decision === "warn" && !activity.stallWarning) {
          deps.applyPatch((latest) => ({
            providerTurnActivityByTask: {
              ...latest.providerTurnActivityByTask,
              [args.taskId]: { ...activity, stallWarning: evidence },
            },
          }) as Partial<TState>);
        }
        if (recheckAfterMs != null && !deps.timerByTask.has(args.taskId)) checkAt(now + recheckAfterMs);
      }, Math.max(0, deadline - Date.now()));
      deps.timerByTask.set(args.taskId, handle);
    };
    checkAt(args.lastEventAt + (initialActivity?.activityEvidence?.transportExited
      ? 0 : resolveProviderTurnStallThresholdMs({ providerId: initialActivity?.providerId })));
  };
}

/** The slice of the app store this module reads. */
export interface StalledTurnAbortState {
  activeWorkspaceId: string;
  taskWorkspaceIdById: Record<string, string>;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
  retainedTurnActivityByTask: RetainedTurnActivityByTask;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  workspaceSnapshotVersion: number;
}

/** The slice of the app store this module writes. */
export interface StalledTurnAbortPatch {
  providerTurnActivityByTask: ProviderTurnActivityByTask;
  retainedTurnActivityByTask?: RetainedTurnActivityByTask;
  messagesByTask?: Record<string, ChatMessage[]>;
  activeTurnIdsByTask?: Record<string, string | undefined>;
  workspaceRuntimeCacheById?: Record<string, WorkspaceSessionState>;
  workspaceSnapshotVersion?: number;
}

/** Release a dead turn from its owning workspace and stop its provider runtime. */
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
  return (args: { taskId: string; turnId: string; transportExited: boolean }) => {
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
    if (
      activity?.turnId !== args.turnId ||
      activity.completedAt != null ||
      remainingPendingInteraction(owningSession.messagesByTask[args.taskId], args.turnId)
    ) return;

    const interrupted = interruptActiveTaskTurns({
      tasks: [task],
      messagesByTask: owningSession.messagesByTask,
      activeTurnIdsByTask: owningSession.activeTurnIdsByTask,
      notice: args.transportExited
        ? i18n.t("session:turnWatchdog.stopTransport")
        : i18n.t("session:turnWatchdog.stopSilence"),
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
      // A turn killed for going silent is exactly the one worth reading back:
      // the retained rows name the step it never returned from.
      const retainedTurnActivityByTask = retainRetiredTurnActivity({
        retainedByTask: nextState.retainedTurnActivityByTask,
        previous: nextState.providerTurnActivityByTask,
        next: providerTurnActivityByTask,
        taskId: args.taskId,
        outcome: "stopped",
      });
      if (isActiveWorkspace) {
        return {
          providerTurnActivityByTask,
          retainedTurnActivityByTask,
          messagesByTask: interrupted.messagesByTask,
          activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
          workspaceSnapshotVersion: nextState.workspaceSnapshotVersion + 1,
        };
      }
      const cachedSession =
        nextState.workspaceRuntimeCacheById[owningWorkspaceId];
      if (!cachedSession) {
        return { providerTurnActivityByTask, retainedTurnActivityByTask };
      }
      return {
        providerTurnActivityByTask,
        retainedTurnActivityByTask,
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
      "[app.store] Automatically stopped an unresponsive provider turn",
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

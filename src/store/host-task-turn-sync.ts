import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import {
  loadTaskMessagesPage,
  loadWorkspaceShellForRestore,
} from "@/lib/db/workspaces.db";
import type { LocalMcpTaskTurnUpdate } from "@/lib/local-mcp/task-turn-update";
import {
  applyProviderTurnActivityEvents,
  clearProviderTurnActivity,
  retainRetiredTurnActivity,
  startProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnActivityByTask,
} from "@/lib/providers/turn-status";
import {
  applyAdvisorActivityEvents,
  type AdvisorExchangeByTask,
} from "@/lib/providers/advisor-activity";
import type { AdvisorConsultLogByTask } from "@/lib/providers/advisor-consult-log";
import {
  createWorkspaceSessionStateFromAppState,
  type WorkspaceRuntimeStatePatch,
} from "@/store/workspace-runtime-state";
import {
  buildWorkspaceSessionStateFromShell,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import {
  TASK_MESSAGES_PAGE_SIZE,
  trimLoadedTaskMessages,
} from "@/store/task-message-loading";

type HostTaskTurnStoreState = Parameters<
  typeof createWorkspaceSessionStateFromAppState
>[0] & {
  activeWorkspaceId: string;
  hostOwnedTurnIdsByTask: Record<string, string | undefined>;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  taskWorkspaceIdById: Record<string, string>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  retainedTurnActivityByTask: RetainedTurnActivityByTask;
  advisorExchangeByTask: AdvisorExchangeByTask;
  advisorConsultLogByTask: AdvisorConsultLogByTask;
};

interface LoadedHostTaskTurn {
  persistedSession: WorkspaceSessionState;
  persistedActiveTurnId: string | undefined;
  messages: WorkspaceSessionState["messagesByTask"][string];
  messageCount: number;
}

export async function loadHostTaskTurn(
  update: LocalMcpTaskTurnUpdate,
): Promise<LoadedHostTaskTurn | null> {
  const [shell, activeTurns, page] = await Promise.all([
    loadWorkspaceShellForRestore({
      workspaceId: update.workspaceId,
    }),
    listActiveWorkspaceTurns({
      workspaceId: update.workspaceId,
    }),
    loadTaskMessagesPage({
      workspaceId: update.workspaceId,
      taskId: update.taskId,
      limit: TASK_MESSAGES_PAGE_SIZE,
      offset: 0,
    }),
  ]);
  if (!shell || !shell.tasks.some((task) => task.id === update.taskId)) {
    return null;
  }

  const persistedSession = buildWorkspaceSessionStateFromShell({
    shell,
    messagesByTask: {
      [update.taskId]: page.messages,
    },
    messageCountByTaskOverrides: {
      [update.taskId]: page.totalCount,
    },
    latestTurns: activeTurns,
  });
  return {
    persistedSession,
    persistedActiveTurnId: persistedSession.activeTurnIdsByTask[update.taskId],
    messages: trimLoadedTaskMessages({
      messages: page.messages,
    }),
    messageCount: Math.max(page.totalCount, page.messages.length),
  };
}

function mergePersistedTaskIntoSession(args: {
  currentSession: WorkspaceSessionState;
  loaded: LoadedHostTaskTurn;
  update: LocalMcpTaskTurnUpdate;
}) {
  const persistedTask = args.loaded.persistedSession.tasks.find(
    (task) => task.id === args.update.taskId,
  )!;
  const currentActiveTurnId =
    args.currentSession.activeTurnIdsByTask[args.update.taskId];
  const turnSettled =
    args.loaded.persistedActiveTurnId === undefined &&
    (currentActiveTurnId === args.update.turnId ||
      (args.update.done && currentActiveTurnId === undefined));
  return {
    turnSettled,
    session: {
      ...args.currentSession,
      tasks: args.currentSession.tasks.some(
        (task) => task.id === args.update.taskId,
      )
        ? args.currentSession.tasks.map((task) =>
            task.id === args.update.taskId ? persistedTask : task,
          )
        : [persistedTask, ...args.currentSession.tasks],
      messagesByTask: {
        ...args.currentSession.messagesByTask,
        [args.update.taskId]: args.loaded.messages,
      },
      messageCountByTask: {
        ...args.currentSession.messageCountByTask,
        [args.update.taskId]: args.loaded.messageCount,
      },
      activeTurnIdsByTask: {
        ...args.currentSession.activeTurnIdsByTask,
        [args.update.taskId]: args.loaded.persistedActiveTurnId,
      },
      providerSessionByTask: {
        ...args.currentSession.providerSessionByTask,
        [args.update.taskId]:
          args.loaded.persistedSession.providerSessionByTask[
            args.update.taskId
          ] ?? {},
      },
      providerGoalByTask: {
        ...args.currentSession.providerGoalByTask,
        [args.update.taskId]:
          args.loaded.persistedSession.providerGoalByTask[args.update.taskId],
      },
      nativeSessionReadyByTask: {
        ...args.currentSession.nativeSessionReadyByTask,
        [args.update.taskId]:
          args.loaded.persistedSession.nativeSessionReadyByTask[
            args.update.taskId
          ] ?? false,
      },
    } satisfies WorkspaceSessionState,
  };
}

export function applyHostTaskTurnSync(args: {
  state: HostTaskTurnStoreState;
  loaded: LoadedHostTaskTurn;
  update: LocalMcpTaskTurnUpdate;
}) {
  const currentSession =
    args.state.activeWorkspaceId === args.update.workspaceId
      ? createWorkspaceSessionStateFromAppState(args.state)
      : (args.state.workspaceRuntimeCacheById[args.update.workspaceId] ?? null);
  const merged = mergePersistedTaskIntoSession({
    currentSession: currentSession ?? args.loaded.persistedSession,
    loaded: args.loaded,
    update: args.update,
  });
  const active = args.loaded.persistedActiveTurnId === args.update.turnId;
  const startedActivityByTask = active
    ? startProviderTurnActivity({
        activityByTask: args.state.providerTurnActivityByTask,
        taskId: args.update.taskId,
        turnId: args.update.turnId,
        providerId: args.update.providerId,
        pendingInteraction:
          args.update.eventType === "approval"
            ? "approval"
            : args.update.eventType === "user_input"
              ? "user_input"
              : undefined,
      })
    : args.state.providerTurnActivityByTask;
  const providerTurnActivityByTask = args.update.activityEvents?.length
    ? applyProviderTurnActivityEvents({
        activityByTask: startedActivityByTask,
        taskId: args.update.taskId,
        turnId: args.update.turnId,
        providerId: args.update.providerId,
        events: args.update.activityEvents,
      })
    : active
      ? startedActivityByTask
      : clearProviderTurnActivity({
          activityByTask: args.state.providerTurnActivityByTask,
          taskId: args.update.taskId,
        });
  // A host-driven turn ends the same way a local one does — the snapshot just
  // disappears from the map — so it retires through the same comparison.
  const retainedTurnActivityByTask = retainRetiredTurnActivity({
    retainedByTask: args.state.retainedTurnActivityByTask,
    previous: args.state.providerTurnActivityByTask,
    next: providerTurnActivityByTask,
    taskId: args.update.taskId,
  });
  // A host batch carries the same hazard as a renderer flush: several complete
  // consults can arrive at once, so the archive happens inside the fold rather
  // than by comparing the exchange map on either side of it.
  const advisor = args.update.activityEvents?.length
    ? applyAdvisorActivityEvents({
        exchangeByTask: args.state.advisorExchangeByTask,
        logByTask: args.state.advisorConsultLogByTask,
        taskId: args.update.taskId,
        turnId: args.update.turnId,
        events: args.update.activityEvents,
      })
    : {
        exchangeByTask: args.state.advisorExchangeByTask,
        logByTask: args.state.advisorConsultLogByTask,
      };
  const sharedPatch = {
    hostOwnedTurnIdsByTask: {
      ...args.state.hostOwnedTurnIdsByTask,
      [args.update.taskId]: args.loaded.persistedActiveTurnId,
    },
    providerTurnActivityByTask,
    retainedTurnActivityByTask,
    advisorExchangeByTask: advisor.exchangeByTask,
    advisorConsultLogByTask: advisor.logByTask,
    taskWorkspaceIdById: {
      ...args.state.taskWorkspaceIdById,
      [args.update.taskId]: args.update.workspaceId,
    },
    workspaceRuntimeCacheById: {
      ...args.state.workspaceRuntimeCacheById,
      [args.update.workspaceId]: merged.session,
    },
  };
  const statePatch =
    args.state.activeWorkspaceId === args.update.workspaceId
      ? {
          ...sharedPatch,
          tasks: merged.session.tasks,
          messagesByTask: merged.session.messagesByTask,
          messageCountByTask: merged.session.messageCountByTask,
          activeTurnIdsByTask: merged.session.activeTurnIdsByTask,
          providerSessionByTask: merged.session.providerSessionByTask,
          providerGoalByTask: merged.session.providerGoalByTask,
          nativeSessionReadyByTask: merged.session.nativeSessionReadyByTask,
        }
      : sharedPatch;

  return {
    statePatch: statePatch satisfies WorkspaceRuntimeStatePatch & {
      hostOwnedTurnIdsByTask: Record<string, string | undefined>;
      taskWorkspaceIdById: Record<string, string>;
      providerTurnActivityByTask: Record<
        string,
        ProviderTurnActivitySnapshot | undefined
      >;
      retainedTurnActivityByTask: RetainedTurnActivityByTask;
      advisorExchangeByTask: AdvisorExchangeByTask;
      advisorConsultLogByTask: AdvisorConsultLogByTask;
    },
    syncedSession: merged.session,
    turnSettled: merged.turnSettled,
    active,
  };
}

import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type {
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import { collectActiveColiseumTaskIds } from "@/store/coliseum.utils";
import type { LayoutState } from "@/store/layout.utils";
import type {
  ChatMessage,
  ColiseumGroupState,
  EditorTab,
  PromptDraft,
  Task,
} from "@/types/chat";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

type PromptDraftByTask = Record<string, PromptDraft>;

type ActiveWorkspaceProjectionState = {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  promptDraftByTask: PromptDraftByTask;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  nativeSessionReadyByTask: Record<string, boolean>;
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
};

type WorkspaceRuntimeCacheState = ActiveWorkspaceProjectionState & {
  activeWorkspaceId: string;
  layout: Pick<LayoutState, "terminalDocked">;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  workspaceSnapshotVersion: number;
};

export type ActiveWorkspaceStatePatch = Pick<
  ActiveWorkspaceProjectionState,
  | "activeTaskId"
  | "tasks"
  | "messagesByTask"
  | "messageCountByTask"
  | "promptDraftByTask"
  | "workspaceInformation"
  | "editorTabs"
  | "activeEditorTabId"
  | "terminalTabs"
  | "activeTerminalTabId"
  | "cliSessionTabs"
  | "activeCliSessionTabId"
  | "activeSurface"
  | "activeTurnIdsByTask"
  | "providerSessionByTask"
  | "nativeSessionReadyByTask"
  | "activeColiseumsByTask"
>;

export type WorkspaceRuntimeStatePatch = Partial<ActiveWorkspaceStatePatch> & {
  workspaceSnapshotVersion?: number;
  workspaceRuntimeCacheById?: Record<string, WorkspaceSessionState>;
};

export function createWorkspaceSessionStateFromAppState(
  state: ActiveWorkspaceProjectionState & {
    layout: Pick<LayoutState, "terminalDocked">;
  },
): WorkspaceSessionState {
  return {
    activeTaskId: state.activeTaskId,
    tasks: state.tasks,
    messagesByTask: state.messagesByTask,
    messageCountByTask: state.messageCountByTask,
    promptDraftByTask: state.promptDraftByTask,
    workspaceInformation: state.workspaceInformation,
    editorTabs: state.editorTabs,
    activeEditorTabId: state.activeEditorTabId,
    terminalTabs: state.terminalTabs,
    activeTerminalTabId: state.activeTerminalTabId,
    terminalDocked: state.layout.terminalDocked,
    cliSessionTabs: state.cliSessionTabs,
    activeCliSessionTabId: state.activeCliSessionTabId,
    activeSurface: state.activeSurface,
    activeTurnIdsByTask: state.activeTurnIdsByTask,
    providerSessionByTask: state.providerSessionByTask,
    nativeSessionReadyByTask: state.nativeSessionReadyByTask,
    activeColiseumsByTask: state.activeColiseumsByTask,
  };
}

export function createActiveWorkspaceStatePatch(
  session: WorkspaceSessionState,
): ActiveWorkspaceStatePatch {
  return {
    activeTaskId: session.activeTaskId,
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    messageCountByTask: session.messageCountByTask,
    promptDraftByTask: session.promptDraftByTask,
    workspaceInformation: session.workspaceInformation,
    editorTabs: session.editorTabs,
    activeEditorTabId: session.activeEditorTabId,
    terminalTabs: session.terminalTabs,
    activeTerminalTabId: session.activeTerminalTabId,
    cliSessionTabs: session.cliSessionTabs,
    activeCliSessionTabId: session.activeCliSessionTabId,
    activeSurface: session.activeSurface,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    providerSessionByTask: session.providerSessionByTask,
    nativeSessionReadyByTask: session.nativeSessionReadyByTask,
    activeColiseumsByTask: session.activeColiseumsByTask,
  };
}

function compactWorkspaceSessionMessages(
  session: WorkspaceSessionState,
): WorkspaceSessionState {
  const retainedTaskIds = new Set<string>();
  if (session.activeTaskId) {
    retainedTaskIds.add(session.activeTaskId);
  }
  for (const [taskId, turnId] of Object.entries(session.activeTurnIdsByTask)) {
    if (turnId) {
      retainedTaskIds.add(taskId);
    }
  }
  for (const taskId of collectActiveColiseumTaskIds({
    activeColiseumsByTask: session.activeColiseumsByTask,
  })) {
    retainedTaskIds.add(taskId);
  }
  const nextMessagesByTask = Object.fromEntries(
    Object.entries(session.messagesByTask).filter(([taskId]) =>
      retainedTaskIds.has(taskId),
    ),
  );
  if (
    Object.keys(nextMessagesByTask).length ===
    Object.keys(session.messagesByTask).length
  ) {
    return session;
  }
  return {
    ...session,
    messagesByTask: nextMessagesByTask,
  };
}

export function saveActiveWorkspaceRuntimeCache(args: {
  state: Pick<
    WorkspaceRuntimeCacheState,
    | "activeWorkspaceId"
    | "workspaceRuntimeCacheById"
    | "layout"
    | "activeTaskId"
    | "tasks"
    | "messagesByTask"
    | "messageCountByTask"
    | "promptDraftByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "cliSessionTabs"
    | "activeCliSessionTabId"
    | "activeSurface"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "nativeSessionReadyByTask"
    | "activeColiseumsByTask"
  >;
}) {
  if (!args.state.activeWorkspaceId) {
    return args.state.workspaceRuntimeCacheById;
  }
  const nextSession = compactWorkspaceSessionMessages(
    createWorkspaceSessionStateFromAppState(args.state),
  );
  return {
    ...args.state.workspaceRuntimeCacheById,
    [args.state.activeWorkspaceId]: nextSession,
  };
}

export function applyPendingProviderEventsToStoreState(args: {
  state: WorkspaceRuntimeCacheState;
  taskWorkspaceId: string;
  taskId: string;
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId: string;
}) {
  const isActiveWorkspaceTarget =
    args.taskWorkspaceId === args.state.activeWorkspaceId;
  if (isActiveWorkspaceTarget) {
    const activeTurnId = args.state.activeTurnIdsByTask[args.taskId];
    if (activeTurnId !== args.turnId) {
      console.warn("[provider-turn] dropped late events for inactive turn", {
        taskId: args.taskId,
        workspaceId: args.taskWorkspaceId,
        expectedTurnId: args.turnId,
        activeTurnId: activeTurnId ?? null,
        eventTypes: args.events.map((event) => event.type),
      });
      return {
        stateChanged: false,
        statePatch: {} as WorkspaceRuntimeStatePatch,
        persistInactiveWorkspaceSession: null,
        updatedSession: null,
        turnCompleted: false,
      };
    }

    const applied = applyProviderEventsToWorkspaceSession({
      session: createWorkspaceSessionStateFromAppState(args.state),
      taskId: args.taskId,
      events: args.events,
      provider: args.provider,
      model: args.model,
      turnId: args.turnId,
    });

    if (!applied.stateChanged) {
      return {
        stateChanged: false,
        statePatch: {} as WorkspaceRuntimeStatePatch,
        persistInactiveWorkspaceSession: null,
        updatedSession: null,
        turnCompleted: false,
      };
    }

    return {
      stateChanged: true,
      statePatch: {
        ...createActiveWorkspaceStatePatch(applied.session),
        workspaceSnapshotVersion: applied.snapshotChanged
          ? args.state.workspaceSnapshotVersion + 1
          : args.state.workspaceSnapshotVersion,
      },
      persistInactiveWorkspaceSession: null,
      updatedSession: applied.session,
      turnCompleted: applied.turnCompleted,
    };
  }

  const workspaceSession =
    args.state.workspaceRuntimeCacheById[args.taskWorkspaceId];
  if (!workspaceSession) {
    return {
      stateChanged: false,
      statePatch: {} as WorkspaceRuntimeStatePatch,
      persistInactiveWorkspaceSession: null,
      updatedSession: null,
      turnCompleted: false,
    };
  }

  const activeTurnId = workspaceSession.activeTurnIdsByTask[args.taskId];
  if (activeTurnId !== args.turnId) {
    console.warn(
      "[provider-turn] dropped late events for inactive cached workspace turn",
      {
        taskId: args.taskId,
        workspaceId: args.taskWorkspaceId,
        expectedTurnId: args.turnId,
        activeTurnId: activeTurnId ?? null,
        eventTypes: args.events.map((event) => event.type),
      },
    );
    return {
      stateChanged: false,
      statePatch: {} as WorkspaceRuntimeStatePatch,
      persistInactiveWorkspaceSession: null,
      updatedSession: null,
      turnCompleted: false,
    };
  }

  const applied = applyProviderEventsToWorkspaceSession({
    session: workspaceSession,
    taskId: args.taskId,
    events: args.events,
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
  });

  if (!applied.stateChanged) {
    return {
      stateChanged: false,
      statePatch: {} as WorkspaceRuntimeStatePatch,
      persistInactiveWorkspaceSession: null,
      updatedSession: null,
    };
  }

  return {
    stateChanged: true,
    statePatch: {
      workspaceRuntimeCacheById: {
        ...args.state.workspaceRuntimeCacheById,
        [args.taskWorkspaceId]: applied.session,
      },
    },
    persistInactiveWorkspaceSession: applied.turnCompleted
      ? {
          workspaceId: args.taskWorkspaceId,
          session: applied.session,
        }
      : null,
    updatedSession: applied.session,
    turnCompleted: applied.turnCompleted,
  };
}

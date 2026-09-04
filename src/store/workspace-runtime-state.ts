import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type {
  PaneDockLayout,
  PaneTabMeta,
  WorkspaceLensTab,
} from "@/lib/panes/types";
import type {
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type {
  NormalizedProviderEvent,
  ProviderGoalSnapshot,
  ProviderId,
} from "@/lib/providers/provider.types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { LayoutState } from "@/store/layout.utils";
import type { ChatMessage, EditorTab, PromptDraft, Task } from "@/types/chat";
import type { ReviewComment } from "@/types/review";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

type PromptDraftByTask = Record<string, PromptDraft>;

type ActiveWorkspaceProjectionState = {
  activeTaskId: string;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  promptDraftByTask: PromptDraftByTask;
  reviewCommentsByTask: Record<string, ReviewComment[] | undefined>;
  workspaceInformation: WorkspaceInformationState;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  openTaskTabIds: string[];
  lensTabs: WorkspaceLensTab[];
  paneTabMeta: Record<string, PaneTabMeta>;
  dockLayout: PaneDockLayout | null;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  providerGoalByTask: Record<string, ProviderGoalSnapshot | null | undefined>;
  nativeSessionReadyByTask: Record<string, boolean>;
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
  | "reviewCommentsByTask"
  | "workspaceInformation"
  | "editorTabs"
  | "activeEditorTabId"
  | "terminalTabs"
  | "activeTerminalTabId"
  | "cliSessionTabs"
  | "activeCliSessionTabId"
  | "activeSurface"
  | "openTaskTabIds"
  | "lensTabs"
  | "paneTabMeta"
  | "dockLayout"
  | "activeTurnIdsByTask"
  | "providerSessionByTask"
  | "providerGoalByTask"
  | "nativeSessionReadyByTask"
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
    reviewCommentsByTask: state.reviewCommentsByTask,
    workspaceInformation: state.workspaceInformation,
    editorTabs: state.editorTabs,
    activeEditorTabId: state.activeEditorTabId,
    terminalTabs: state.terminalTabs,
    activeTerminalTabId: state.activeTerminalTabId,
    terminalDocked: state.layout.terminalDocked,
    cliSessionTabs: state.cliSessionTabs,
    activeCliSessionTabId: state.activeCliSessionTabId,
    activeSurface: state.activeSurface,
    openTaskTabIds: state.openTaskTabIds,
    lensTabs: state.lensTabs,
    paneTabMeta: state.paneTabMeta,
    dockLayout: state.dockLayout,
    activeTurnIdsByTask: state.activeTurnIdsByTask,
    providerSessionByTask: state.providerSessionByTask,
    providerGoalByTask: state.providerGoalByTask,
    nativeSessionReadyByTask: state.nativeSessionReadyByTask,
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
    reviewCommentsByTask: session.reviewCommentsByTask,
    workspaceInformation: session.workspaceInformation,
    editorTabs: session.editorTabs,
    activeEditorTabId: session.activeEditorTabId,
    terminalTabs: session.terminalTabs,
    activeTerminalTabId: session.activeTerminalTabId,
    cliSessionTabs: session.cliSessionTabs,
    activeCliSessionTabId: session.activeCliSessionTabId,
    activeSurface: session.activeSurface,
    openTaskTabIds: session.openTaskTabIds,
    lensTabs: session.lensTabs,
    paneTabMeta: session.paneTabMeta,
    dockLayout: session.dockLayout,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    providerSessionByTask: session.providerSessionByTask,
    providerGoalByTask: session.providerGoalByTask,
    nativeSessionReadyByTask: session.nativeSessionReadyByTask,
  };
}

/**
 * Resolve the session view for a workspace: the live store projection when it
 * is the active workspace, otherwise its runtime-cache entry (null when the
 * workspace has not been activated this app run).
 */
export function getWorkspaceSessionForState(args: {
  state: Omit<WorkspaceRuntimeCacheState, "workspaceSnapshotVersion">;
  workspaceId: string;
}) {
  if (args.workspaceId === args.state.activeWorkspaceId) {
    return createWorkspaceSessionStateFromAppState(args.state);
  }
  return args.state.workspaceRuntimeCacheById[args.workspaceId] ?? null;
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

/**
 * How many workspace sessions stay resident in `workspaceRuntimeCacheById`.
 *
 * The cache is a convenience layer, not a source of truth: `switchWorkspace`
 * flushes the outgoing workspace to SQLite before swapping it out, and a
 * missing cache entry makes the next activation reload the shell from
 * persistence. Without a cap the cache grew once per workspace visited and
 * never shrank, so a long session across many worktrees held every one of
 * them (tabs, drafts, information, and the active task's message window) in
 * renderer memory for the rest of the run.
 */
export const MAX_CACHED_WORKSPACE_SESSIONS = 8;

/**
 * Drop the least-recently-saved workspace sessions once the cache exceeds its
 * cap. The active workspace and any workspace with an in-flight turn are never
 * evicted — a running turn keeps applying provider events into its cached
 * session, so evicting it would lose that turn's transcript.
 *
 * Recency is the cache's own key order: `saveActiveWorkspaceRuntimeCache`
 * re-inserts the active workspace last on every save, and non-numeric string
 * keys iterate in insertion order.
 */
export function evictColdWorkspaceRuntimeCacheEntries(args: {
  cache: Record<string, WorkspaceSessionState>;
  activeWorkspaceId: string;
  limit?: number;
}) {
  const limit = args.limit ?? MAX_CACHED_WORKSPACE_SESSIONS;
  const entries = Object.entries(args.cache);
  if (entries.length <= limit) {
    return args.cache;
  }

  const isPinned = (workspaceId: string, session: WorkspaceSessionState) =>
    workspaceId === args.activeWorkspaceId ||
    Object.values(session.activeTurnIdsByTask).some((turnId) => Boolean(turnId));

  let evictable = entries.filter(([id, session]) => !isPinned(id, session))
    .length;
  const overflow = entries.length - limit;
  const evicted = new Set<string>();
  for (const [workspaceId, session] of entries) {
    if (evicted.size >= overflow || evictable === 0) {
      break;
    }
    if (isPinned(workspaceId, session)) {
      continue;
    }
    evicted.add(workspaceId);
    evictable -= 1;
  }

  if (evicted.size === 0) {
    return args.cache;
  }
  return Object.fromEntries(
    entries.filter(([workspaceId]) => !evicted.has(workspaceId)),
  );
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
    | "reviewCommentsByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "cliSessionTabs"
    | "activeCliSessionTabId"
    | "activeSurface"
    | "openTaskTabIds"
    | "lensTabs"
    | "paneTabMeta"
    | "dockLayout"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "providerGoalByTask"
    | "nativeSessionReadyByTask"
  >;
}) {
  if (!args.state.activeWorkspaceId) {
    return args.state.workspaceRuntimeCacheById;
  }
  const nextSession = compactWorkspaceSessionMessages(
    createWorkspaceSessionStateFromAppState(args.state),
  );
  // Re-insert the active workspace last so key order tracks recency, which is
  // what `evictColdWorkspaceRuntimeCacheEntries` reads.
  const { [args.state.activeWorkspaceId]: _previous, ...others } =
    args.state.workspaceRuntimeCacheById;
  return evictColdWorkspaceRuntimeCacheEntries({
    cache: {
      ...others,
      [args.state.activeWorkspaceId]: nextSession,
    },
    activeWorkspaceId: args.state.activeWorkspaceId,
  });
}

/** Return workspace ids present before cache compaction but absent afterwards. */
export function listRemovedWorkspaceRuntimeCacheIds(args: {
  previousCache: Record<string, WorkspaceSessionState>;
  nextCache: Record<string, WorkspaceSessionState>;
}): string[] {
  return Object.keys(args.previousCache).filter(
    (workspaceId) => !(workspaceId in args.nextCache),
  );
}

/** Save the cache and release browser guests for entries removed by its cap. */
export function saveActiveWorkspaceRuntimeCacheWithLensCleanup(
  args: Parameters<typeof saveActiveWorkspaceRuntimeCache>[0],
) {
  const previousCache = args.state.workspaceRuntimeCacheById;
  const nextCache = saveActiveWorkspaceRuntimeCache(args);
  const releaseWorkspaceGuests =
    typeof window === "undefined"
      ? undefined
      : window.api?.lens?.releaseWorkspaceGuests;
  if (releaseWorkspaceGuests) {
    for (const workspaceId of listRemovedWorkspaceRuntimeCacheIds({
      previousCache,
      nextCache,
    })) {
      void releaseWorkspaceGuests({ workspaceId }).catch(() => undefined);
    }
  }
  return nextCache;
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

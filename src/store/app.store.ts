import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState } from "@/store/app-store.types";
import { type PersistedTurnSummary } from "@/lib/db/turns.db";
import { workspaceFsAdapter } from "@/lib/fs";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { rememberTurnDurableFacts } from "@/store/project-memory-runtime";
import {
  type ScriptTrigger,
  buildTurnVerificationResult,
} from "@/lib/workspace-scripts";
import { createEditorActions } from "@/store/app-store-editor-actions";
import { createSendUserMessageAction } from "@/store/app-store-send-user-message";
import { createPaneActions } from "@/store/app-store-pane-actions";
import { createTerminalActions } from "@/store/app-store-terminal-actions";
import { createMacroActions } from "@/store/app-store-macro-actions";
import { createSettingsActions } from "@/store/app-store-settings-actions";
import { createCompareActions } from "@/store/app-store-compare-actions";
import { createTaskCoreActions } from "@/store/app-store-task-core-actions";
import { createConversationThreadActions } from "@/store/app-store-conversation-thread-actions";
import { createTaskLifecycleActions } from "@/store/app-store-task-lifecycle-actions";
import { createSupportActions } from "@/store/app-store-support-actions";
import { createProviderInteractionActions } from "@/store/app-store-provider-interaction-actions";
import { createFailedSendActions } from "@/store/app-store-failed-send-actions";
import {
  createAppStorePersistenceOptions,
  normalizeSharedSkillsHomeSetting,
} from "@/store/app-store-persistence";
import { createAppStoreNotificationRuntime } from "@/store/app-store-notification-runtime";
import { createWorkspaceTurnSummaryGenerator } from "@/store/workspace-turn-summary-runtime";
import {
  createRefreshWorkspaceFilesInBackground,
  createWorkspaceManagementActions,
  logWorkspaceSwitchMetric,
} from "@/store/app-store-workspace-management-actions";
import { createWorkspaceCreateActions } from "@/store/app-store-workspace-create-actions";
import { createProjectActions } from "@/store/app-store-project-actions";
import {
  createWorkspaceHydrationActions,
  loadWorkspaceSessionFromPersistence,
  loadWorkspaceShellStateFromPersistence,
} from "@/store/app-store-workspace-hydration-actions";
import {
  createAppSurfaceActions,
  WORKSPACE_APP_SURFACE,
} from "@/store/app-surface";
import type { TurnIntentComplianceResult } from "@/lib/source-control-review";
import { isTaskManaged } from "@/lib/tasks";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  collectMartinTriggerContext,
  notifyMartinTaskArchived,
  notifyMartinTurnSummary,
} from "@/lib/martin-sync/renderer-triggers";
import { createWorkspaceTurnSummary } from "@/lib/workspace-turn-summary";
import {
  applyHostTaskTurnSync,
  loadHostTaskTurn,
} from "@/store/host-task-turn-sync";
import { createQueuedTaskTurnDispatcher } from "@/store/queued-task-turn-dispatch";
import { createIntentGuardRunner } from "@/store/intent-guard-runtime";
import {
  createProviderTurnStallTimerScheduler,
  createStalledProviderTurnAborter,
} from "@/store/provider-turn-stall-abort";
import {
  adoptRestoredTurnsIntoStallNet,
  createProviderTurnLivenessReporter,
} from "@/store/provider-turn-stall-rearm";
import { createSteerQueueReservations } from "@/store/steer-queue-reservations";
import {
  createWorkspaceSessionStateFromAppState,
  getWorkspaceSessionForState,
} from "@/store/workspace-runtime-state";
import { createWorkspaceKickoffResolver } from "@/store/workspace-kickoff-actions";
import type { ChatMessage, PromptDraft } from "@/types/chat";
import {
  appendInterruptedTurnNotices,
  scheduleWorkspaceSnapshotPersist,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import { trimPersistedMessageWindow } from "@/store/resident-message-budget";
import {
  TASK_MESSAGES_PAGE_SIZE,
  resolveInitialLatestTaskMessagesPageSize,
} from "@/store/task-message-loading";
import {
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
} from "@/store/layout.utils";
import {
  registerTaskWorkspaceOwnership,
  resolveWorkspaceName,
} from "@/store/project.utils";
import {
  createDefaultProviderAvailability,
  defaultSettings,
} from "@/store/app-settings";
import { createDefaultProviderRuntimeCapabilities } from "@/lib/providers/runtime-capabilities";

const LOCAL_ABORT_SYSTEM_EVENT_CONTENT =
  "Generation was stopped locally before completion.";
export { WORKSPACE_SIDEBAR_MIN_WIDTH } from "@/store/layout.utils";
export type { LayoutState } from "@/store/layout.utils";
export {
  THEME_TOKEN_NAMES,
  PRESET_THEME_TOKENS,
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
} from "@/lib/themes";
export {
  parseCustomThemeFile,
  exportCustomThemeJson,
  listAllCustomThemes,
} from "@/lib/themes";
export type {
  ThemeTokenName,
  ThemeModeName,
  ThemeTokenValues,
  ThemeOverrideValues,
  CustomThemeDefinition,
  ThemeValidationResult,
} from "@/lib/themes";
export type { RecentProjectState } from "@/store/project.utils";
// This module stays the public entry point for the app store, so settings and
// archive-cleanup names that moved into sibling modules are re-exported here.
export type { AppSettings } from "@/store/app-settings";
export { SIDEBAR_NAV_VIEWS } from "@/store/app-settings";
export type { SidebarNavView } from "@/store/app-settings";
export { waitForPendingWorkspaceArchiveCleanups } from "@/store/workspace-archive-cleanup";

const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
export {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";

function resolveTaskRuntimeTarget(args: {
  state: Pick<
    AppState,
    | "activeTaskId"
    | "activeWorkspaceId"
    | "taskWorkspaceIdById"
    | "tasks"
    | "workspaceRuntimeCacheById"
    | "messagesByTask"
    | "messageCountByTask"
    | "promptDraftByTask"
    | "reviewCommentsByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "layout"
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
  taskId: string;
}) {
  const activeTask =
    args.state.tasks.find((task) => task.id === args.taskId) ?? null;
  if (activeTask) {
    return {
      workspaceId: args.state.activeWorkspaceId,
      isActiveWorkspace: true,
      session: createWorkspaceSessionStateFromAppState(args.state),
      task: activeTask,
    };
  }

  const mappedWorkspaceId = args.state.taskWorkspaceIdById[args.taskId];
  if (mappedWorkspaceId && mappedWorkspaceId !== args.state.activeWorkspaceId) {
    const mappedSession =
      args.state.workspaceRuntimeCacheById[mappedWorkspaceId];
    const mappedTask =
      mappedSession?.tasks.find((task) => task.id === args.taskId) ?? null;
    if (mappedSession && mappedTask) {
      return {
        workspaceId: mappedWorkspaceId,
        isActiveWorkspace: false,
        session: mappedSession,
        task: mappedTask,
      };
    }
  }

  for (const [workspaceId, session] of Object.entries(
    args.state.workspaceRuntimeCacheById,
  )) {
    const task =
      session.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
    if (task) {
      return {
        workspaceId,
        isActiveWorkspace: false,
        session,
        task,
      };
    }
  }

  return null;
}

function clearRestoredTaskProviderSession(args: {
  state: AppState;
  taskId: string;
}) {
  const taskWorkspaceId =
    args.state.taskWorkspaceIdById[args.taskId] ?? args.state.activeWorkspaceId;
  if (taskWorkspaceId && taskWorkspaceId !== args.state.activeWorkspaceId) {
    const cachedSession = args.state.workspaceRuntimeCacheById[taskWorkspaceId];
    if (!cachedSession) {
      return {};
    }
    const { [args.taskId]: _dropped, ...providerSessionByTask } =
      cachedSession.providerSessionByTask;
    const { [args.taskId]: _droppedGoal, ...providerGoalByTask } =
      cachedSession.providerGoalByTask ?? {};
    return {
      workspaceRuntimeCacheById: {
        ...args.state.workspaceRuntimeCacheById,
        [taskWorkspaceId]: {
          ...cachedSession,
          providerSessionByTask,
          providerGoalByTask,
          nativeSessionReadyByTask: {
            ...cachedSession.nativeSessionReadyByTask,
            [args.taskId]: false,
          },
        },
      },
    };
  }

  const { [args.taskId]: _dropped, ...providerSessionByTask } =
    args.state.providerSessionByTask;
  const { [args.taskId]: _droppedGoal, ...providerGoalByTask } =
    args.state.providerGoalByTask;
  return {
    providerSessionByTask,
    providerGoalByTask,
    nativeSessionReadyByTask: {
      ...args.state.nativeSessionReadyByTask,
      [args.taskId]: false,
    },
  };
}

const ARCHIVED_TASK_TURN_NOTICE =
  "Generation stopped because the task was archived before this turn completed.";
export const STAVE_OPEN_SETTINGS_EVENT = "stave:open-settings";
const WORKSPACE_PR_STATUS_FRESH_MS = 4 * 60 * 1000;
const WORKSPACE_PR_STATUS_POLL_CONCURRENCY = 3;

function incrementWorkspaceSnapshotVersion(
  state: Pick<AppState, "workspaceSnapshotVersion">,
) {
  return state.workspaceSnapshotVersion + 1;
}

function incrementPromptDraftPersistenceVersion(
  state: Pick<AppState, "promptDraftPersistenceVersion">,
) {
  return state.promptDraftPersistenceVersion + 1;
}

function shouldLoadLatestTaskMessages(args: {
  taskId: string;
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
}) {
  return (
    (args.messagesByTask[args.taskId]?.length ?? 0) === 0 &&
    (args.messageCountByTask[args.taskId] ?? 0) > 0
  );
}

function mergeTaskMessagePage(args: {
  currentMessages: ChatMessage[];
  pageMessages: ChatMessage[];
  mode: "latest" | "older";
}) {
  if (args.mode === "latest") {
    const currentById = new Map(
      args.currentMessages.map((message) => [message.id, message] as const),
    );
    const merged = args.pageMessages.map(
      (message) => currentById.get(message.id) ?? message,
    );
    const seen = new Set(merged.map((message) => message.id));
    for (const message of args.currentMessages) {
      if (!seen.has(message.id)) {
        merged.push(message);
      }
    }
    return merged;
  }

  const seen = new Set(args.currentMessages.map((message) => message.id));
  const olderMessages = args.pageMessages.filter(
    (message) => !seen.has(message.id),
  );
  if (olderMessages.length === 0) {
    return args.currentMessages;
  }
  return [...olderMessages, ...args.currentMessages];
}

function findTaskById(state: Pick<AppState, "tasks">, taskId: string) {
  return state.tasks.find((task) => task.id === taskId) ?? null;
}

export const useAppStore = create<AppState>()(
  persist((set, get) => {
    const resolveScriptHookWorkspaceContext = (workspaceId: string) => {
      const state = get();
      const projectPath = state.projectPath;
      const workspacePath = state.workspacePathById[workspaceId];
      const branch = state.workspaceBranchById[workspaceId];
      if (!projectPath || !workspacePath || !branch) {
        return null;
      }
      const workspaceName =
        state.workspaces.find((workspace) => workspace.id === workspaceId)
          ?.name ?? branch;
      return {
        workspaceId,
        projectPath,
        workspacePath,
        workspaceName,
        branch,
      };
    };

    // Turn ids whose events showed the working tree being touched. The intent
    // guard has nothing new to judge after a turn that only read or answered,
    // so this is what keeps a conversation-only turn from paying for a diff
    // review. Bounded because only the most recent turns are ever consulted.
    const turnIdsWithFileEdits = new Set<string>();
    // The badge is cleared while a turn is in flight so a stale verdict never
    // reads as fresh. A turn that changed no files does not earn a new model
    // call, but the previous verdict is still true of the unchanged diff — so
    // it is retained here and restored instead of vanishing.
    const retainedIntentComplianceByWorkspace = new Map<
      string,
      TurnIntentComplianceResult
    >();
    const MAX_TRACKED_FILE_EDIT_TURN_IDS = 200;
    const recordTurnFileEdits = (turnId: string) => {
      turnIdsWithFileEdits.add(turnId);
      while (turnIdsWithFileEdits.size > MAX_TRACKED_FILE_EDIT_TURN_IDS) {
        const oldest = turnIdsWithFileEdits.values().next();
        if (oldest.done) {
          break;
        }
        turnIdsWithFileEdits.delete(oldest.value);
      }
    };

    const { runIntentGuardForTurn } = createIntentGuardRunner({
      getState: get,
      setState: set,
      turnIdsWithFileEdits,
      retainedByWorkspace: retainedIntentComplianceByWorkspace,
    });

    const runScriptHookInBackground = (args: {
      workspaceId: string;
      trigger: ScriptTrigger;
      taskId?: string;
      taskTitle?: string;
      turnId?: string;
    }) => {
      // A new turn invalidates the previous turn's verification badge so it
      // never lingers as a stale ✅ while fresh work is in flight.
      if (args.trigger === "turn.started") {
        set((state) => {
          if (
            state.turnVerificationByWorkspace[args.workspaceId] === undefined
          ) {
            return state;
          }
          const next = { ...state.turnVerificationByWorkspace };
          delete next[args.workspaceId];
          return { turnVerificationByWorkspace: next };
        });
        set((state) => {
          if (
            state.turnIntentComplianceByWorkspace[args.workspaceId] ===
            undefined
          ) {
            return state;
          }
          const next = { ...state.turnIntentComplianceByWorkspace };
          delete next[args.workspaceId];
          return { turnIntentComplianceByWorkspace: next };
        });
      }

      const runScriptHook = window.api?.scripts?.runHook;
      const context = resolveScriptHookWorkspaceContext(args.workspaceId);

      if (args.trigger === "task.archiving" && args.taskTitle) {
        const state = get();
        notifyMartinTaskArchived({
          context: collectMartinTriggerContext(state, args.workspaceId),
          settings: state.settings.martinSync,
          taskTitle: args.taskTitle,
        });
      }

      // Intent guard runs independently of verify hooks; it only needs the
      // resolved workspace context (path) to diff against.
      if (args.trigger === "turn.completed" && context) {
        runIntentGuardForTurn({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          turnId: args.turnId,
          workspacePath: context.workspacePath,
        });
      }

      if (!runScriptHook || !context) {
        return;
      }

      void runScriptHook({
        ...context,
        trigger: args.trigger,
        ...(args.taskId ? { taskId: args.taskId } : {}),
        ...(args.taskTitle ? { taskTitle: args.taskTitle } : {}),
        ...(args.turnId ? { turnId: args.turnId } : {}),
      })
        .then((result) => {
          // Surface turn.completed verify hooks as a Changes-panel badge.
          // Only record when at least one hook entry was configured, so a
          // project without verify hooks shows nothing rather than a
          // misleading green check.
          if (
            args.trigger === "turn.completed" &&
            result.summary &&
            result.summary.totalEntries > 0
          ) {
            const verification = buildTurnVerificationResult({
              workspaceId: args.workspaceId,
              taskId: args.taskId,
              turnId: args.turnId,
              summary: result.summary,
              completedAt: Date.now(),
            });
            set((state) => ({
              turnVerificationByWorkspace: {
                ...state.turnVerificationByWorkspace,
                [args.workspaceId]: verification,
              },
            }));
          }
          if (!result.ok && result.summary?.failures.length) {
            console.warn("[workspace-scripts] hook failures", {
              trigger: args.trigger,
              failures: result.summary.failures,
            });
          }
        })
        .catch((error) => {
          console.warn("[workspace-scripts] hook failed", {
            trigger: args.trigger,
            error: String(error),
          });
        });
    };

    const workspaceTurnSummaryRequestIdByWorkspaceId = new Map<
      string,
      string
    >();
    const kickoffResolver = createWorkspaceKickoffResolver({
      getState: get,
    });
    const providerTurnStallTimerByTask = new Map<
      string,
      ReturnType<typeof globalThis.setTimeout>
    >();

    const clearProviderTurnStallTimer = (taskId: string) => {
      const handle = providerTurnStallTimerByTask.get(taskId);
      if (handle == null) {
        return;
      }
      globalThis.clearTimeout(handle);
      providerTurnStallTimerByTask.delete(taskId);
    };

    const scheduleProviderTurnStallTimer =
      createProviderTurnStallTimerScheduler({
        getState: get,
        applyPatch: (updater) => set(updater),
        getWorkspaceSession: getWorkspaceSessionForState,
        timerByTask: providerTurnStallTimerByTask,
        clearStallTimer: clearProviderTurnStallTimer,
        // Lazy: the aborter is built below and needs this scheduler.
        autoAbort: (target) => autoAbortStalledTaskTurn(target),
      });

    /** Disarms the stall net from IPC arrival — see the factory's rationale. */
    const reportProviderTurnLiveness = createProviderTurnLivenessReporter({
      getActivityByTask: () => get().providerTurnActivityByTask,
      scheduleStallTimer: scheduleProviderTurnStallTimer,
    });

    const autoAbortStalledTaskTurn = createStalledProviderTurnAborter({
      getState: get,
      applyPatch: (updater) => set(updater),
      getWorkspaceSession: getWorkspaceSessionForState,
      clearStallTimer: clearProviderTurnStallTimer,
      abortTurn: (target) => void window.api?.provider?.abortTurn?.(target),
      cleanupTask: (target) => void window.api?.provider?.cleanupTask?.(target),
      onTurnAborted: (aborted) =>
        attentionSync.syncTaskInteractions({
          taskId: aborted.taskId,
          messages: aborted.messages,
          endedTurnId: aborted.turnId,
        }),
    });

    const steerQueueReservations = createSteerQueueReservations();

    const dispatchNextQueuedTaskTurn = createQueuedTaskTurnDispatcher({
      getSession: (workspaceId) =>
        getWorkspaceSessionForState({ state: get(), workspaceId }),
      getActions: get,
      getAutoDispatchHold: steerQueueReservations.getAutoDispatchHold,
      onDispatchFailed: ({ taskId, queuedTurnId, error }) => {
        console.error("[queued-turn] auto-dispatch failed", {
          taskId,
          queuedTurnId,
          error,
        });
      },
    });

    /**
     * Re-drain a task's queue after a steer settles.
     *
     * A steer awaits the provider for up to the ack deadline, and the running
     * turn frequently completes inside that window. Completion is what
     * normally drains the queue, but it skipped this task because the steered
     * item was reserved — so once the reservation lifts, nothing else would
     * ever start the remaining items. Only drain when the task is genuinely
     * idle; a still-running turn will drain on its own completion.
     */
    const drainQueueAfterSteerSettled = (target: {
      workspaceId: string;
      taskId: string;
    }) => {
      const session = getWorkspaceSessionForState({
        state: get(),
        workspaceId: target.workspaceId,
      });
      if (!session || session.activeTurnIdsByTask[target.taskId]) {
        return;
      }
      dispatchNextQueuedTaskTurn(target);
    };

    const hasAsyncIterable = (
      value: unknown,
    ): value is AsyncIterable<unknown> => {
      if (!value || typeof value !== "object") {
        return false;
      }
      return Symbol.asyncIterator in value;
    };

    const collectProviderEvents = async (
      value: unknown,
    ): Promise<NormalizedProviderEvent[]> => {
      const resolved = await value;
      if (Array.isArray(resolved)) {
        return resolved as NormalizedProviderEvent[];
      }
      if (!hasAsyncIterable(resolved)) {
        return [];
      }
      const events: NormalizedProviderEvent[] = [];
      for await (const item of resolved) {
        events.push(item as NormalizedProviderEvent);
      }
      return events;
    };

    const persistWorkspaceSessionInBackground = (args: {
      workspaceId: string;
      session: WorkspaceSessionState;
    }) => {
      const latestState = get();
      scheduleWorkspaceSnapshotPersist({
        workspaceId: args.workspaceId,
        workspaceName: resolveWorkspaceName({
          state: latestState,
          workspaceId: args.workspaceId,
        }),
        activeTaskId: args.session.activeTaskId,
        tasks: args.session.tasks,
        messagesByTask: args.session.messagesByTask,
        promptDraftByTask: args.session.promptDraftByTask,
        reviewCommentsByTask: args.session.reviewCommentsByTask,
        workspaceInformation: args.session.workspaceInformation,
        editorTabs: args.session.editorTabs,
        activeEditorTabId: args.session.activeEditorTabId,
        terminalTabs: args.session.terminalTabs,
        activeTerminalTabId: args.session.activeTerminalTabId,
        terminalDocked: args.session.terminalDocked,
        cliSessionTabs: args.session.cliSessionTabs,
        activeCliSessionTabId: args.session.activeCliSessionTabId,
        activeSurface: args.session.activeSurface,
        openTaskTabIds: args.session.openTaskTabIds,
        lensTabs: args.session.lensTabs,
        paneTabMeta: args.session.paneTabMeta,
        dockLayout: args.session.dockLayout,
        providerSessionByTask: args.session.providerSessionByTask,
      });
    };

    const applyWorkspaceTurnSummaryToState = (args: {
      workspaceId: string;
      summary: ReturnType<typeof createWorkspaceTurnSummary>;
    }) => {
      let didUpdate = false;

      set((state) => {
        const cachedSession = state.workspaceRuntimeCacheById[args.workspaceId];
        const currentWorkspaceInformation =
          args.workspaceId === state.activeWorkspaceId
            ? state.workspaceInformation
            : cachedSession?.workspaceInformation;
        if (!currentWorkspaceInformation) {
          return state;
        }

        const currentSummary = currentWorkspaceInformation.turnSummary ?? null;
        if (
          currentSummary?.turnId === args.summary.turnId &&
          currentSummary.requestSummary === args.summary.requestSummary &&
          currentSummary.workSummary === args.summary.workSummary &&
          currentSummary.model === args.summary.model
        ) {
          return state;
        }

        didUpdate = true;
        const nextWorkspaceInformation = {
          ...currentWorkspaceInformation,
          turnSummary: args.summary,
        };

        if (args.workspaceId === state.activeWorkspaceId) {
          return {
            workspaceInformation: nextWorkspaceInformation,
            workspaceRuntimeCacheById: cachedSession
              ? {
                  ...state.workspaceRuntimeCacheById,
                  [args.workspaceId]: {
                    ...cachedSession,
                    workspaceInformation: nextWorkspaceInformation,
                  },
                }
              : state.workspaceRuntimeCacheById,
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        }

        if (!cachedSession) {
          return state;
        }

        return {
          workspaceRuntimeCacheById: {
            ...state.workspaceRuntimeCacheById,
            [args.workspaceId]: {
              ...cachedSession,
              workspaceInformation: nextWorkspaceInformation,
            },
          },
        };
      });

      if (!didUpdate) {
        return;
      }

      const state = get();
      notifyMartinTurnSummary({
        context: collectMartinTriggerContext(state, args.workspaceId),
        settings: state.settings.martinSync,
        workSummary: args.summary.workSummary,
      });

      const latestSession = getWorkspaceSessionForState({
        state,
        workspaceId: args.workspaceId,
      });
      if (latestSession) {
        persistWorkspaceSessionInBackground({
          workspaceId: args.workspaceId,
          session: latestSession,
        });
      }
    };

    const generateWorkspaceTurnSummaryInBackground =
      createWorkspaceTurnSummaryGenerator({
        getState: get,
        applySummary: applyWorkspaceTurnSummaryToState,
        rememberDurableFacts: rememberTurnDurableFacts,
        collectProviderEvents,
      });

    const { attentionSync, persistNotifications } =
      createAppStoreNotificationRuntime({ set, get });

    const loadTaskMessagesIntoSession = async (args: {
      workspaceId: string;
      taskId: string;
      mode: "latest" | "older";
    }) => {
      const stateBefore = get();
      const ownerWorkspaceId =
        stateBefore.taskWorkspaceIdById[args.taskId] ??
        stateBefore.activeWorkspaceId;
      if (
        !args.taskId ||
        !ownerWorkspaceId ||
        ownerWorkspaceId !== args.workspaceId
      ) {
        return;
      }
      if (stateBefore.taskMessagesLoadingByTask[args.taskId]) {
        return;
      }
      const currentSession =
        args.workspaceId === stateBefore.activeWorkspaceId
          ? stateBefore
          : stateBefore.workspaceRuntimeCacheById[args.workspaceId];
      if (!currentSession) {
        return;
      }
      const currentMessages = currentSession.messagesByTask[args.taskId] ?? [];
      const totalCount =
        currentSession.messageCountByTask[args.taskId] ??
        currentMessages.length;
      if (args.mode === "latest" && currentMessages.length > 0) {
        return;
      }
      if (args.mode === "older" && currentMessages.length >= totalCount) {
        return;
      }

      set((state) => ({
        taskMessagesLoadingByTask: {
          ...state.taskMessagesLoadingByTask,
          [args.taskId]: true,
        },
      }));

      try {
        const page = await loadTaskMessagesPage({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          limit:
            args.mode === "latest"
              ? resolveInitialLatestTaskMessagesPageSize()
              : TASK_MESSAGES_PAGE_SIZE,
          offset: args.mode === "older" ? currentMessages.length : 0,
        });
        set((state) => {
          const targetSession = getWorkspaceSessionForState({
            state,
            workspaceId: args.workspaceId,
          });
          if (!targetSession) {
            return {
              taskMessagesLoadingByTask: {
                ...state.taskMessagesLoadingByTask,
                [args.taskId]: false,
              },
            };
          }
          const sessionMessages =
            targetSession.messagesByTask[args.taskId] ?? [];
          const nextMessages = mergeTaskMessagePage({
            currentMessages: sessionMessages,
            pageMessages:
              args.mode === "latest" && sessionMessages.length === 0
                ? trimPersistedMessageWindow({ messages: page.messages })
                : page.messages,
            mode: args.mode,
          });
          const nextLoadingState = {
            ...state.taskMessagesLoadingByTask,
            [args.taskId]: false,
          };
          if (args.workspaceId === state.activeWorkspaceId) {
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [args.taskId]: nextMessages,
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [args.taskId]: Math.max(page.totalCount, nextMessages.length),
              },
              taskMessagesLoadingByTask: nextLoadingState,
            };
          }
          return {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [args.workspaceId]: {
                ...targetSession,
                messagesByTask: {
                  ...targetSession.messagesByTask,
                  [args.taskId]: nextMessages,
                },
                messageCountByTask: {
                  ...targetSession.messageCountByTask,
                  [args.taskId]: Math.max(page.totalCount, nextMessages.length),
                },
              },
            },
            taskMessagesLoadingByTask: nextLoadingState,
          };
        });
        attentionSync.syncTaskInteractions({
          taskId: args.taskId,
          messages:
            getWorkspaceSessionForState({
              state: get(),
              workspaceId: args.workspaceId,
            })?.messagesByTask[args.taskId] ?? [],
        });
      } catch (error) {
        console.error("[workspace] failed to load task messages", error);
        set((state) => ({
          taskMessagesLoadingByTask: {
            ...state.taskMessagesLoadingByTask,
            [args.taskId]: false,
          },
        }));
      }
    };

    const hydrateWorkspaceMessagesInBackground = (args: {
      workspaceId: string;
      taskIds: string[];
      latestTurns: PersistedTurnSummary[];
      switchMetricToken?: number;
    }) => {
      const taskIds = [...new Set(args.taskIds.filter(Boolean))];
      if (taskIds.length === 0) {
        return;
      }

      const interruptedTurnByTaskId = new Map(
        args.latestTurns
          .filter((turn) => !turn.completedAt)
          .map((turn) => [turn.taskId, turn] as const),
      );

      set((state) => {
        let changed = false;
        const nextTaskMessagesLoadingByTask = {
          ...state.taskMessagesLoadingByTask,
        };
        for (const taskId of taskIds) {
          if (nextTaskMessagesLoadingByTask[taskId] === true) {
            continue;
          }
          nextTaskMessagesLoadingByTask[taskId] = true;
          changed = true;
        }
        return changed
          ? { taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask }
          : state;
      });

      void Promise.allSettled(
        taskIds.map(async (taskId) => ({
          taskId,
          page: await loadTaskMessagesPage({
            workspaceId: args.workspaceId,
            taskId,
            limit: TASK_MESSAGES_PAGE_SIZE,
            offset: 0,
          }),
        })),
      )
        .then((results) => {
          set((state) => {
            const nextTaskMessagesLoadingByTask = {
              ...state.taskMessagesLoadingByTask,
            };
            for (const taskId of taskIds) {
              nextTaskMessagesLoadingByTask[taskId] = false;
            }

            const targetSession = getWorkspaceSessionForState({
              state,
              workspaceId: args.workspaceId,
            });
            if (!targetSession) {
              return {
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            }

            const messagesPatch: Record<string, ChatMessage[]> = {};
            const messageCountPatch: Record<string, number> = {};

            for (const result of results) {
              if (result.status !== "fulfilled") {
                continue;
              }
              const sessionMessages =
                targetSession.messagesByTask[result.value.taskId] ?? [];
              const mergedMessages = mergeTaskMessagePage({
                currentMessages: sessionMessages,
                pageMessages:
                  sessionMessages.length === 0
                    ? trimPersistedMessageWindow({
                        messages: result.value.page.messages,
                      })
                    : result.value.page.messages,
                mode: "latest",
              });
              const interruptedTurn = interruptedTurnByTaskId.get(
                result.value.taskId,
              );
              const nextMessages = interruptedTurn
                ? (appendInterruptedTurnNotices({
                    messagesByTask: { [result.value.taskId]: mergedMessages },
                    latestTurns: [interruptedTurn],
                    messageCountByTask: {
                      [result.value.taskId]: result.value.page.totalCount,
                    },
                  })[result.value.taskId] ?? mergedMessages)
                : mergedMessages;
              messagesPatch[result.value.taskId] = nextMessages;
              messageCountPatch[result.value.taskId] = Math.max(
                result.value.page.totalCount,
                nextMessages.length,
              );
            }

            if (Object.keys(messagesPatch).length === 0) {
              return {
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            }

            if (args.workspaceId === state.activeWorkspaceId) {
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  ...messagesPatch,
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  ...messageCountPatch,
                },
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            }

            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [args.workspaceId]: {
                  ...targetSession,
                  messagesByTask: {
                    ...targetSession.messagesByTask,
                    ...messagesPatch,
                  },
                  messageCountByTask: {
                    ...targetSession.messageCountByTask,
                    ...messageCountPatch,
                  },
                },
              },
              taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
            };
          });
          // Turns that died with the previous app session get their pending
          // requests interrupted during hydration, so their durable needs must
          // be settled too instead of waiting in Fleet forever.
          const hydrated = getWorkspaceSessionForState({
            state: get(),
            workspaceId: args.workspaceId,
          });
          for (const taskId of taskIds) {
            attentionSync.syncTaskInteractions({
              taskId,
              messages: hydrated?.messagesByTask[taskId] ?? [],
            });
          }
          logWorkspaceSwitchMetric({
            workspaceId: args.workspaceId,
            token: args.switchMetricToken,
            phase: "messages",
            extra: {
              taskCount: taskIds.length,
            },
          });
        })
        .catch((error) => {
          console.error(
            "[workspace] failed to hydrate initial task messages",
            error,
          );
          set((state) => ({
            taskMessagesLoadingByTask: {
              ...state.taskMessagesLoadingByTask,
              ...Object.fromEntries(
                taskIds.map((taskId) => [taskId, false] as const),
              ),
            },
          }));
        });
    };

    const refreshWorkspaceFilesInBackground =
      createRefreshWorkspaceFilesInBackground({ set, get });

    const editorActions = createEditorActions({
      set,
      get,
    });
    const terminalActions = createTerminalActions({ set, get });
    const paneActions = createPaneActions({
      set,
      get,
      loadTaskMessagesIntoSession,
    });
    const settingsActions = createSettingsActions({
      set,
      get,
      normalizeSharedSkillsHomeSetting,
    });
    const macroActions = createMacroActions({ set, get });
    const compareActions = createCompareActions({
      set,
      get,
      emptyPromptDraft: EMPTY_PROMPT_DRAFT,
      incrementWorkspaceSnapshotVersion,
    });
    const taskCoreActions = createTaskCoreActions({
      set,
      get,
      runScriptHookInBackground,
      attentionSync,
      loadTaskMessagesIntoSession,
      emptyPromptDraft: EMPTY_PROMPT_DRAFT,
      incrementWorkspaceSnapshotVersion,
      incrementPromptDraftPersistenceVersion,
      shouldLoadLatestTaskMessages,
      findTaskById,
    });
    const failedSendActions = createFailedSendActions({ set, get });
    const conversationThreadActions = createConversationThreadActions({
      set,
      get,
      runScriptHookInBackground,
      incrementWorkspaceSnapshotVersion,
    });
    const taskLifecycleActions = createTaskLifecycleActions({
      set,
      get,
      runScriptHookInBackground,
      attentionSync,
      clearRestoredTaskProviderSession,
      archivedTaskTurnNotice: ARCHIVED_TASK_TURN_NOTICE,
      incrementWorkspaceSnapshotVersion,
      findTaskById,
    });
    const supportActions = createSupportActions({
      set,
      get,
      clearProviderTurnStallTimer,
      persistWorkspaceSessionInBackground,
      attentionSync,
      workspacePrStatusFreshMs: WORKSPACE_PR_STATUS_FRESH_MS,
      workspacePrStatusPollConcurrency: WORKSPACE_PR_STATUS_POLL_CONCURRENCY,
      incrementWorkspaceSnapshotVersion,
      normalizeSharedSkillsHomeSetting,
    });
    const providerInteractionActions = createProviderInteractionActions({
      set,
      get,
      clearProviderTurnStallTimer,
      scheduleProviderTurnStallTimer,
      attentionSync,
      localAbortSystemEventContent: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
      resolveTaskRuntimeTarget,
      incrementWorkspaceSnapshotVersion,
      findTaskById,
    });
    const workspaceManagementActions = createWorkspaceManagementActions({
      set,
      get,
      loadWorkspaceShellStateFromPersistence,
      loadTaskMessagesIntoSession,
      hydrateWorkspaceMessagesInBackground,
      refreshWorkspaceFilesInBackground,
    });
    const workspaceCreateActions = createWorkspaceCreateActions({
      set,
      get,
      runScriptHookInBackground,
      kickoffResolver,
    });
    const projectActions = createProjectActions({
      set,
      get,
      loadWorkspaceShellStateFromPersistence,
      loadTaskMessagesIntoSession,
      hydrateWorkspaceMessagesInBackground,
      refreshWorkspaceFilesInBackground,
    });
    const workspaceHydrationActions = createWorkspaceHydrationActions({
      set,
      get,
      loadTaskMessagesIntoSession,
      hydrateWorkspaceMessagesInBackground,
      refreshWorkspaceFilesInBackground,
    });
    return {
      hasHydratedWorkspaces: false,
      workspaceSnapshotVersion: 0,
      promptDraftPersistenceVersion: 0,
      workspaces: [],
      activeWorkspaceId: "",
      projectPath: null,
      recentProjects: [],
      defaultBranch: "main",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      workspaceLastActiveAtById: {},
      workspacePrInfoById: {},
      rateLimitsSnapshot: null,
      autoRoutingDecisionByTask: {},
      rateLimitsUpdatedAtByProvider: {},
      rateLimitsLoading: false,
      rateLimitsError: null,
      isDarkMode: true,
      activeTaskId: "",
      draftProvider: "claude-code",
      promptDraftByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
      promptFocusNonce: 0,
      providerCommandCatalogRefreshNonce: 0,
      workspacePlansRefreshNonce: 0,
      tasks: [],
      messagesByTask: {},
      failedSendsByTask: {},
      messageCountByTask: {},
      taskMessagesLoadingByTask: {},
      layout: {
        workspaceSidebarWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
        workspaceSidebarCollapsed: false,
        workspaceSidebarItemDisplayMode:
          DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
        explorerPanelWidth: 300,
        sidebarOverlayVisible: false,
        sidebarOverlayTab: "explorer",
        terminalDocked: false,
        editorDiffMode: false,
        editorMarkdownPreviewMode: false,
        turnActivityFloatPos: null,
      },
      settings: defaultSettings,
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeAppSurface: WORKSPACE_APP_SURFACE,
      activeSurface: { kind: "task", taskId: "" },
      openTaskTabIds: [],
      lensTabs: [],
      paneTabMeta: {},
      dockLayout: null,
      focusPendingInteractionRequest: null,
      focusTranscriptToolRequest: null,
      scrollToLatestMessageRequest: null,
      pendingCloseEditorTabId: null,
      pendingEditorSelection: null,
      projectName: null,
      projectFiles: workspaceFsAdapter.getKnownFiles(),
      workspaceFileCacheByPath: {},
      taskCheckpointById: {},
      providerAvailability: createDefaultProviderAvailability(),
      providerRuntimeCapabilities: createDefaultProviderRuntimeCapabilities(),
      skillCatalog: {
        status: "idle",
        workspacePath: null,
        sharedSkillsHome: null,
        fetchedAt: null,
        skills: [],
        roots: [],
        detail: "Skill catalog has not been loaded yet.",
      },
      notifications: [],
      reviewCommentsByTask: {},
      compareRunsById: {},
      activeCompareRunId: null,
      activeTurnIdsByTask: {},
      hostOwnedTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      retainedTurnActivityByTask: {},
      advisorExchangeByTask: {},
      advisorConsultLogByTask: {},
      advisorVerdictTallyByModel: {},
      advisorConsultLogView: null,
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      providerGoalByTask: {},
      turnVerificationByWorkspace: {},
      turnIntentComplianceByWorkspace: {},
      workspaceRuntimeCacheById: {},
      taskWorkspaceIdById: {},
      persistenceBootstrapPhase: "idle",
      persistenceBootstrapMessage: "",
      ...workspaceHydrationActions,
      refreshActiveManagedTask: async () => {
        const stateBefore = get();
        const workspaceId = stateBefore.activeWorkspaceId;
        const activeTask = findTaskById(stateBefore, stateBefore.activeTaskId);
        if (!workspaceId || !activeTask || !isTaskManaged(activeTask)) {
          return;
        }

        const loadedWorkspaceSession =
          await loadWorkspaceSessionFromPersistence({
            workspaceId,
          });
        if (!loadedWorkspaceSession.shell) {
          return;
        }

        const nextSession = loadedWorkspaceSession.workspaceState;
        const preferredActiveTaskId = nextSession.tasks.some(
          (task) => task.id === stateBefore.activeTaskId,
        )
          ? stateBefore.activeTaskId
          : nextSession.activeTaskId;
        const refreshedSession: WorkspaceSessionState = {
          ...nextSession,
          activeTaskId: preferredActiveTaskId,
        };

        set((state) => {
          if (state.activeWorkspaceId !== workspaceId) {
            return state;
          }
          return {
            tasks: refreshedSession.tasks,
            messagesByTask: refreshedSession.messagesByTask,
            messageCountByTask: refreshedSession.messageCountByTask,
            activeTaskId: refreshedSession.activeTaskId,
            workspaceInformation: refreshedSession.workspaceInformation,
            activeTurnIdsByTask: refreshedSession.activeTurnIdsByTask,
            providerSessionByTask: refreshedSession.providerSessionByTask,
            providerGoalByTask: refreshedSession.providerGoalByTask,
            nativeSessionReadyByTask: refreshedSession.nativeSessionReadyByTask,
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: refreshedSession,
            },
            taskWorkspaceIdById: registerTaskWorkspaceOwnership({
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspaceId,
              tasks: refreshedSession.tasks,
            }),
          };
        });
        if (get().activeWorkspaceId === workspaceId) {
          // This refresh adopts in-flight turns straight from the database, so
          // nothing is watching them yet.
          adoptRestoredTurnsIntoStallNet({
            tasks: refreshedSession.tasks,
            activeTurnIdsByTask: refreshedSession.activeTurnIdsByTask,
            getActivityByTask: () => get().providerTurnActivityByTask,
            applyActivityPatch: (updater) =>
              set((state) => updater(state.providerTurnActivityByTask)),
            scheduleStallTimer: scheduleProviderTurnStallTimer,
          });
        }
        // A managed host can answer requests on its own (agent-driven MCP
        // responses), so re-align the durable needs with the refreshed session.
        for (const task of refreshedSession.tasks) {
          attentionSync.syncTaskInteractions({
            taskId: task.id,
            messages: refreshedSession.messagesByTask[task.id] ?? [],
          });
        }
      },
      syncHostTaskTurn: async (update) => {
        const loaded = await loadHostTaskTurn(update);
        if (!loaded) {
          return;
        }
        const syncResult = applyHostTaskTurnSync({
          state: get(),
          loaded,
          update,
        });
        set(syncResult.statePatch);
        if (syncResult.active) {
          scheduleProviderTurnStallTimer({
            taskId: update.taskId,
            turnId: update.turnId,
            lastEventAt: Date.now(),
          });
        } else {
          clearProviderTurnStallTimer(update.taskId);
        }
        attentionSync.syncTaskInteractions({
          taskId: update.taskId,
          messages:
            syncResult.syncedSession.messagesByTask[update.taskId] ?? [],
          endedTurnId: syncResult.turnSettled ? update.turnId : undefined,
        });

        if (
          update.eventType === "approval" ||
          update.eventType === "user_input" ||
          update.eventType === "error" ||
          update.done
        ) {
          void get().hydrateNotifications();
        }
        if (syncResult.turnSettled) {
          dispatchNextQueuedTaskTurn({
            workspaceId: update.workspaceId,
            taskId: update.taskId,
          });
        }
      },
      ...projectActions,
      ...workspaceCreateActions,
      ...workspaceManagementActions,
      ...settingsActions,
      ...macroActions,
      ...createAppSurfaceActions<AppState>(set),
      ...compareActions,
      ...taskCoreActions,
      ...conversationThreadActions,
      ...failedSendActions,
      ...terminalActions,
      ...taskLifecycleActions,
      ...paneActions,
      ...supportActions,
      sendUserMessage: createSendUserMessageAction({
        set,
        get,
        emptyPromptDraft: EMPTY_PROMPT_DRAFT,
        resolveTaskRuntimeTarget,
        incrementWorkspaceSnapshotVersion,
        findTaskById,
        recordTurnFileEdits,
        runScriptHookInBackground,
        clearProviderTurnStallTimer,
        scheduleProviderTurnStallTimer,
        reportProviderTurnLiveness,
        steerQueueReservations,
        dispatchNextQueuedTaskTurn,
        drainQueueAfterSteerSettled,
        persistWorkspaceSessionInBackground,
        generateWorkspaceTurnSummaryInBackground,
        attentionSync,
        persistNotifications,
      }),
      ...providerInteractionActions,
      ...editorActions,
    };
  }, createAppStorePersistenceOptions()),
);

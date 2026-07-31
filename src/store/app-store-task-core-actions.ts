import type { StoreApi } from "zustand";
import {
  loadWorkspaceShellForRestore,
  loadWorkspaceSnapshot,
  type TaskProviderSessionState,
} from "@/lib/db/workspaces.db";
import { getProviderSessionId } from "@/lib/providers/provider-sessions";
import { toProviderSessionTitle } from "@/lib/providers/thread-actions";
import {
  isTaskArchived,
  isTaskManaged,
  reorderTasksWithinFilter,
} from "@/lib/tasks";
import type { ScriptTrigger } from "@/lib/workspace-scripts";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";
import type { AppState } from "@/store/app-store.types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import { arePromptDraftRuntimeOverridesEqual } from "@/store/prompt-draft-runtime";
import {
  arePromptDraftBatchItemsEqual,
  arePromptDraftQueuedTurnsEqual,
  buildClearedPromptDraft,
  hasPromptDraftPayload,
  normalizePromptDraftForStorage,
} from "@/store/prompt-draft-state";
import { reduceTaskScrollToLatestRequest } from "@/store/task-scroll.utils";
import type { PromptDraft, Task } from "@/types/chat";

type TaskCoreActionKey =
  | "focusTaskAttention"
  | "requestTaskScrollToLatest"
  | "selectTask"
  | "loadTaskMessages"
  | "clearTaskSelection"
  | "updatePromptDraft"
  | "clearTaskProviderSession"
  | "updateWorkspaceInformation"
  | "applyExternalWorkspaceInformationUpdate"
  | "clearPromptDraft"
  | "createTask"
  | "renameTask"
  | "restoreTask"
  | "duplicateTask"
  | "reorderTasks";

type TaskCoreActions = Pick<AppState, TaskCoreActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createTaskCoreActions(args: {
  set: StoreSet;
  get: StoreGet;
  runScriptHookInBackground: (args: {
    workspaceId: string;
    trigger: ScriptTrigger;
    taskId?: string;
    taskTitle?: string;
    turnId?: string;
  }) => void;
  attentionSync: NotificationAttentionSync;
  loadTaskMessagesIntoSession: (args: {
    workspaceId: string;
    taskId: string;
    mode: "latest" | "older";
  }) => Promise<void>;
  emptyPromptDraft: PromptDraft;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
  incrementPromptDraftPersistenceVersion: (
    state: Pick<AppState, "promptDraftPersistenceVersion">,
  ) => number;
  shouldLoadLatestTaskMessages: (args: {
    taskId: string;
    messagesByTask: AppState["messagesByTask"];
    messageCountByTask: AppState["messageCountByTask"];
  }) => boolean;
  findTaskById: (state: Pick<AppState, "tasks">, taskId: string) => Task | null;
}): TaskCoreActions {
  const {
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
  } = args;

  return {
    focusTaskAttention: async ({
      taskId,
      workspaceId,
      projectPath,
      refreshFromPersistence = false,
    }) => {
      const stateBefore = get();
      if (projectPath && projectPath !== stateBefore.projectPath) {
        await stateBefore.openProject({ projectPath });
      }

      const stateAfterProjectOpen = get();
      const resolvedWorkspaceId =
        workspaceId ??
        stateAfterProjectOpen.taskWorkspaceIdById[taskId] ??
        stateAfterProjectOpen.activeWorkspaceId;

      if (
        resolvedWorkspaceId &&
        resolvedWorkspaceId !== stateAfterProjectOpen.activeWorkspaceId
      ) {
        await stateAfterProjectOpen.switchWorkspace({
          workspaceId: resolvedWorkspaceId,
        });
      }

      if (refreshFromPersistence && resolvedWorkspaceId) {
        const shell = await loadWorkspaceShellForRestore({
          workspaceId: resolvedWorkspaceId,
        });
        const persistedTask =
          shell?.tasks.find((task) => task.id === taskId) ?? null;
        if (persistedTask) {
          set((state) => {
            if (state.activeWorkspaceId !== resolvedWorkspaceId) {
              return {};
            }
            const nextTasks = state.tasks.some((task) => task.id === taskId)
              ? state.tasks.map((task) =>
                  task.id === taskId ? persistedTask : task,
                )
              : [persistedTask, ...state.tasks];
            const persistedDraft = shell?.promptDraftByTask[taskId];
            const persistedProviderSession =
              shell?.providerSessionByTask[taskId];
            return {
              tasks: nextTasks,
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: [],
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [taskId]: shell?.messageCountByTask[taskId] ?? 0,
              },
              promptDraftByTask: persistedDraft
                ? {
                    ...state.promptDraftByTask,
                    [taskId]: persistedDraft,
                  }
                : state.promptDraftByTask,
              providerSessionByTask: persistedProviderSession
                ? {
                    ...state.providerSessionByTask,
                    [taskId]: persistedProviderSession,
                  }
                : state.providerSessionByTask,
              taskWorkspaceIdById: {
                ...state.taskWorkspaceIdById,
                [taskId]: resolvedWorkspaceId,
              },
            };
          });
        }
      }

      const stateAfterWorkspaceOpen = get();
      stateAfterWorkspaceOpen.selectTask({ taskId });
      set((state) => ({
        focusPendingInteractionRequest: {
          taskId,
          nonce: (state.focusPendingInteractionRequest?.nonce ?? 0) + 1,
        },
      }));
    },
    requestTaskScrollToLatest: ({ taskId }) =>
      set((state) => reduceTaskScrollToLatestRequest({ state, taskId })),
    selectTask: ({ taskId }) => {
      const stateBefore = get();
      const targetTask =
        stateBefore.tasks.find((task) => task.id === taskId) ?? null;
      if (!targetTask || isTaskArchived(targetTask)) {
        return;
      }
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      const shouldLoadMessages = shouldLoadLatestTaskMessages({
        taskId,
        messagesByTask: stateBefore.messagesByTask,
        messageCountByTask: stateBefore.messageCountByTask,
      });
      // Reviewing a task in the task window is the normal way to clear its
      // turn outcomes; Fleet only mirrors what has not been looked at yet.
      attentionSync.markTaskReviewed(taskId);
      attentionSync.syncTaskInteractions({
        taskId,
        messages: stateBefore.messagesByTask[taskId] ?? [],
      });
      if (
        stateBefore.activeTaskId === taskId &&
        stateBefore.activeAppSurface.kind === "workspace" &&
        stateBefore.activeSurface.kind === "task" &&
        stateBefore.activeSurface.taskId === taskId
      ) {
        if (workspaceId && shouldLoadMessages) {
          void loadTaskMessagesIntoSession({
            workspaceId,
            taskId,
            mode: "latest",
          });
        }
        get().requestTaskScrollToLatest({ taskId });
        return;
      }
      set((state) => ({
        activeTaskId: taskId,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        activeSurface: { kind: "task", taskId },
        openTaskTabIds: state.openTaskTabIds.includes(taskId)
          ? state.openTaskTabIds
          : [...state.openTaskTabIds, taskId],
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
      }));
      if (workspaceId && shouldLoadMessages) {
        void loadTaskMessagesIntoSession({
          workspaceId,
          taskId,
          mode: "latest",
        });
      }
    },
    loadTaskMessages: async ({ taskId, mode = "latest" }) => {
      const state = get();
      const workspaceId =
        state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
      if (!workspaceId || !taskId) {
        return;
      }
      await loadTaskMessagesIntoSession({
        workspaceId,
        taskId,
        mode,
      });
    },
    clearTaskSelection: () =>
      set((state) => {
        if (!state.activeTaskId) {
          if (state.activeAppSurface.kind !== "workspace") {
            return {
              activeAppSurface: WORKSPACE_APP_SURFACE,
            };
          }
          return state;
        }
        return {
          activeTaskId: "",
          activeAppSurface: WORKSPACE_APP_SURFACE,
          activeSurface:
            state.activeSurface.kind === "task"
              ? { kind: "task", taskId: "" }
              : state.activeSurface,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      }),
    updatePromptDraft: ({ taskId, patch }) => {
      set((state) => {
        const workspaceId =
          state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
        const cachedSession =
          workspaceId && workspaceId !== state.activeWorkspaceId
            ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
            : null;
        const promptDraftByTask =
          cachedSession?.promptDraftByTask ?? state.promptDraftByTask;
        const currentDraft = promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
        const nextDraft = normalizePromptDraftForStorage({
          text: currentDraft.text,
          attachedFilePaths: currentDraft.attachedFilePaths,
          attachments: currentDraft.attachments,
          runtimeOverrides: currentDraft.runtimeOverrides,
          promptBatch: currentDraft.promptBatch,
          queuedTurns: currentDraft.queuedTurns,
          queuedNextTurn: currentDraft.queuedNextTurn,
          ...patch,
        });
        const textChanged = nextDraft.text !== currentDraft.text;
        const attachedFilePathsChanged =
          nextDraft.attachedFilePaths.length !==
            currentDraft.attachedFilePaths.length ||
          nextDraft.attachedFilePaths.some(
            (p, i) => p !== currentDraft.attachedFilePaths[i],
          );
        const attachmentsChanged =
          nextDraft.attachments.length !== currentDraft.attachments.length ||
          nextDraft.attachments.some(
            (a, i) => a !== currentDraft.attachments[i],
          );
        const runtimeOverridesChanged = !arePromptDraftRuntimeOverridesEqual(
          nextDraft.runtimeOverrides,
          currentDraft.runtimeOverrides,
        );
        const promptBatchChanged = !arePromptDraftBatchItemsEqual(
          nextDraft.promptBatch,
          currentDraft.promptBatch,
        );
        const queuedTurnsChanged = !arePromptDraftQueuedTurnsEqual(
          nextDraft.queuedTurns,
          currentDraft.queuedTurns,
        );
        if (
          !textChanged &&
          !attachedFilePathsChanged &&
          !attachmentsChanged &&
          !runtimeOverridesChanged &&
          !promptBatchChanged &&
          !queuedTurnsChanged
        ) {
          return state;
        }
        if (cachedSession) {
          return {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: {
                ...cachedSession,
                promptDraftByTask: {
                  ...cachedSession.promptDraftByTask,
                  [taskId]: nextDraft,
                },
              },
            },
          };
        }
        const onlyTextChanged =
          textChanged &&
          !attachedFilePathsChanged &&
          !attachmentsChanged &&
          !runtimeOverridesChanged &&
          !promptBatchChanged &&
          !queuedTurnsChanged;
        return {
          promptDraftByTask: {
            ...state.promptDraftByTask,
            [taskId]: nextDraft,
          },
          ...(onlyTextChanged
            ? {
                promptDraftPersistenceVersion:
                  incrementPromptDraftPersistenceVersion(state),
              }
            : {
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              }),
        };
      });
    },
    clearTaskProviderSession: ({ taskId, providerId }) => {
      set((state) => {
        const currentSession = state.providerSessionByTask[taskId];
        const existingSessionId = getProviderSessionId({
          sessions: currentSession,
          providerId,
        });
        if (!existingSessionId) {
          return state;
        }

        const nextTaskSession: TaskProviderSessionState = {
          ...currentSession,
        };
        delete nextTaskSession[providerId];
        const providerGoalByTask =
          providerId === "codex"
            ? (() => {
                const { [taskId]: _droppedGoal, ...rest } =
                  state.providerGoalByTask;
                return rest;
              })()
            : state.providerGoalByTask;

        const activeProvider = state.tasks.find(
          (task) => task.id === taskId,
        )?.provider;
        const nextNativeSessionReady =
          activeProvider !== undefined &&
          Boolean(
            getProviderSessionId({
              sessions: nextTaskSession,
              providerId: activeProvider,
            }),
          );

        return {
          providerSessionByTask: {
            ...state.providerSessionByTask,
            [taskId]: nextTaskSession,
          },
          providerGoalByTask,
          nativeSessionReadyByTask: {
            ...state.nativeSessionReadyByTask,
            [taskId]: nextNativeSessionReady,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    updateWorkspaceInformation: ({ updater }) => {
      set((state) => {
        const nextWorkspaceInformation = updater(state.workspaceInformation);
        if (nextWorkspaceInformation === state.workspaceInformation) {
          return state;
        }
        return {
          workspaceInformation: nextWorkspaceInformation,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    applyExternalWorkspaceInformationUpdate: ({
      workspaceId,
      workspaceInformation,
    }) => {
      set((state) => {
        const cachedSession = state.workspaceRuntimeCacheById[workspaceId];
        const nextRuntimeCacheById = cachedSession
          ? {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: {
                ...cachedSession,
                workspaceInformation,
              },
            }
          : state.workspaceRuntimeCacheById;

        if (workspaceId === state.activeWorkspaceId) {
          return {
            workspaceInformation,
            workspaceRuntimeCacheById: nextRuntimeCacheById,
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        }

        if (cachedSession) {
          return {
            workspaceRuntimeCacheById: nextRuntimeCacheById,
          };
        }

        return state;
      });
    },
    clearPromptDraft: ({ taskId }) => {
      set((state) => {
        const workspaceId =
          state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
        const cachedSession =
          workspaceId && workspaceId !== state.activeWorkspaceId
            ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
            : null;
        const promptDraftByTask =
          cachedSession?.promptDraftByTask ?? state.promptDraftByTask;
        const currentDraft = promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
        if (
          !hasPromptDraftPayload(currentDraft) &&
          !currentDraft.queuedNextTurn &&
          (currentDraft.queuedTurns?.length ?? 0) === 0
        ) {
          return state;
        }
        const nextDraft = buildClearedPromptDraft(currentDraft);
        if (cachedSession) {
          return {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: {
                ...cachedSession,
                promptDraftByTask: {
                  ...cachedSession.promptDraftByTask,
                  [taskId]: nextDraft,
                },
              },
            },
          };
        }
        return {
          promptDraftByTask: {
            ...state.promptDraftByTask,
            [taskId]: nextDraft,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    createTask: ({ title }) => {
      const trimmed = (title ?? "").trim();
      const stateBefore = get();
      const workspaceId = stateBefore.activeWorkspaceId;
      if (
        !workspaceId ||
        !stateBefore.workspaces.some(
          (workspace) => workspace.id === workspaceId,
        )
      ) {
        return;
      }
      const nextTask: Task = {
        id: crypto.randomUUID(),
        title: trimmed.length > 0 ? trimmed : "New Task",
        provider: stateBefore.draftProvider,
        updatedAt: buildRecentTimestamp(),
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      };
      set((state) => {
        return {
          tasks: [nextTask, ...state.tasks],
          activeTaskId: nextTask.id,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          activeSurface: { kind: "task", taskId: nextTask.id },
          openTaskTabIds: [...state.openTaskTabIds, nextTask.id],
          messagesByTask: {
            ...state.messagesByTask,
            [nextTask.id]: [],
          },
          messageCountByTask: {
            ...state.messageCountByTask,
            [nextTask.id]: 0,
          },
          nativeSessionReadyByTask: {
            ...state.nativeSessionReadyByTask,
            [nextTask.id]: false,
          },
          providerSessionByTask: {
            ...state.providerSessionByTask,
            [nextTask.id]: {},
          },
          taskWorkspaceIdById: {
            ...state.taskWorkspaceIdById,
            [nextTask.id]: workspaceId,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      runScriptHookInBackground({
        workspaceId,
        trigger: "task.created",
        taskId: nextTask.id,
        taskTitle: nextTask.title,
      });
    },
    renameTask: ({ taskId, title, source = "manual" }) => {
      const nextTitle = title.trim();
      if (!nextTitle) {
        return;
      }
      const stateBefore = get();
      const targetBefore = findTaskById(stateBefore, taskId);
      if (
        isTaskManaged(targetBefore) ||
        (source === "auto" && targetBefore?.titleManuallySet)
      ) {
        return;
      }
      set((state) => {
        if (isTaskManaged(findTaskById(state, taskId))) {
          return state;
        }
        const target = state.tasks.find((task) => task.id === taskId);
        // A manual rename is a deliberate user choice — never let an
        // automatic suggestion overwrite it afterwards.
        if (source === "auto" && target?.titleManuallySet) {
          return state;
        }
        const markManual = source === "manual";
        return {
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  title: nextTitle,
                  updatedAt: buildRecentTimestamp(),
                  ...(markManual ? { titleManuallySet: true } : {}),
                }
              : task,
          ),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      if (source !== "manual") {
        return;
      }

      const providerSession = stateBefore.providerSessionByTask[taskId];
      const nativeSessionTitle = toProviderSessionTitle(nextTitle);
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      const cwd =
        stateBefore.workspacePathById[workspaceId] ??
        stateBefore.projectPath ??
        undefined;
      const renameRequests: Array<Promise<{ ok: boolean; detail: string }>> =
        [];
      const claudeSessionId = getProviderSessionId({
        sessions: providerSession,
        providerId: "claude-code",
      });
      const renameClaudeSession = window.api?.provider?.renameClaudeSession;
      if (claudeSessionId && renameClaudeSession) {
        renameRequests.push(
          renameClaudeSession({
            sessionId: claudeSessionId,
            title: nativeSessionTitle,
            ...(cwd ? { cwd } : {}),
          }),
        );
      }
      const codexThreadId = getProviderSessionId({
        sessions: providerSession,
        providerId: "codex",
      });
      const renameCodexThread = window.api?.provider?.renameCodexThread;
      if (codexThreadId && renameCodexThread) {
        renameRequests.push(
          renameCodexThread({
            threadId: codexThreadId,
            name: nativeSessionTitle,
            ...(stateBefore.settings.codexBinaryPath
              ? {
                  runtimeOptions: {
                    codexBinaryPath: stateBefore.settings.codexBinaryPath,
                  },
                }
              : {}),
          }),
        );
      }
      if (renameRequests.length > 0) {
        void Promise.all(renameRequests)
          .then((results) => {
            for (const result of results) {
              if (!result.ok) {
                console.warn("[task-rename] Native session rename failed", {
                  taskId,
                  detail: result.detail,
                });
              }
            }
          })
          .catch((error) => {
            console.warn("[task-rename] Native session rename failed", {
              taskId,
              detail: error instanceof Error ? error.message : String(error),
            });
          });
      }
    },
    restoreTask: ({ taskId }) => {
      const stateBefore = get();
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      const shouldLoadMessages =
        !(taskId in stateBefore.messagesByTask) &&
        (stateBefore.messageCountByTask[taskId] ?? 0) > 0;
      set((state) => {
        const targetTask = state.tasks.find((task) => task.id === taskId);
        if (!targetTask || !isTaskArchived(targetTask)) {
          return {};
        }
        return {
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  archivedAt: null,
                  updatedAt: buildRecentTimestamp(),
                }
              : task,
          ),
          activeTaskId: taskId,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          activeSurface: { kind: "task", taskId },
          openTaskTabIds: state.openTaskTabIds.includes(taskId)
            ? state.openTaskTabIds
            : [...state.openTaskTabIds, taskId],
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      if (workspaceId && shouldLoadMessages) {
        void loadTaskMessagesIntoSession({
          workspaceId,
          taskId,
          mode: "latest",
        });
      }
    },
    duplicateTask: async ({ taskId }) => {
      const stateBefore = get();
      const sourceTask = stateBefore.tasks.find((task) => task.id === taskId);
      if (!sourceTask) {
        return;
      }
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      const sourceMessages = (() => {
        const loadedMessages = stateBefore.messagesByTask[taskId];
        const totalCount =
          stateBefore.messageCountByTask[taskId] ?? loadedMessages?.length ?? 0;
        if (loadedMessages && loadedMessages.length >= totalCount) {
          return loadedMessages;
        }
        return null;
      })();
      const completeSourceMessages =
        sourceMessages ??
        (await loadWorkspaceSnapshot({ workspaceId }))?.messagesByTask[
          taskId
        ] ??
        [];

      set((state) => {
        const nextTaskId = crypto.randomUUID();
        const duplicatedMessages = completeSourceMessages.map((message) => ({
          ...message,
          id: crypto.randomUUID(),
          isStreaming: false,
        }));
        const duplicatedTask: Task = {
          ...sourceTask,
          id: nextTaskId,
          title: `${sourceTask.title} (copy)`,
          updatedAt: buildRecentTimestamp(),
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        };
        return {
          tasks: [duplicatedTask, ...state.tasks],
          activeTaskId: duplicatedTask.id,
          activeSurface: { kind: "task", taskId: duplicatedTask.id },
          openTaskTabIds: [...state.openTaskTabIds, duplicatedTask.id],
          taskCheckpointById: {
            ...state.taskCheckpointById,
            [duplicatedTask.id]: state.taskCheckpointById[taskId] ?? "",
          },
          messagesByTask: {
            ...state.messagesByTask,
            [duplicatedTask.id]: duplicatedMessages,
          },
          messageCountByTask: {
            ...state.messageCountByTask,
            [duplicatedTask.id]: duplicatedMessages.length,
          },
          nativeSessionReadyByTask: {
            ...state.nativeSessionReadyByTask,
            [duplicatedTask.id]: false,
          },
          providerSessionByTask: {
            ...state.providerSessionByTask,
            [duplicatedTask.id]: {},
          },
          taskWorkspaceIdById: {
            ...state.taskWorkspaceIdById,
            [duplicatedTask.id]: workspaceId,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    reorderTasks: ({ activeTaskId, overTaskId, filter }) => {
      set((state) => {
        const nextTasks = reorderTasksWithinFilter({
          tasks: state.tasks,
          activeTaskId,
          overTaskId,
          filter,
        });
        if (nextTasks === state.tasks) {
          return {};
        }
        return {
          tasks: nextTasks,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
  };
}

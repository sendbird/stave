import type { StoreApi } from "zustand";
import {
  loadAllTaskMessages,
  truncateTaskMessagesAfter,
} from "@/lib/db/workspaces.db";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import {
  buildConversationTurnActionStateByMessageId,
  toProviderSessionTitle,
} from "@/lib/providers/thread-actions";
import type { ScriptTrigger } from "@/lib/workspace-scripts";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";
import type {
  AppState,
  ConversationThreadActionResult,
} from "@/store/app-store.types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import { trimLoadedTaskMessages } from "@/store/task-message-loading";
import type { ChatMessage, Task } from "@/types/chat";

type ConversationThreadActionKey =
  "forkConversationFromMessage" | "rollbackConversationToMessage";

type ConversationThreadActions = Pick<AppState, ConversationThreadActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

function failure(detail: string): ConversationThreadActionResult {
  return { ok: false, detail };
}

function getWorkspaceCwd(args: {
  state: AppState;
  workspaceId: string;
}): string | undefined {
  return (
    args.state.workspacePathById[args.workspaceId] ??
    args.state.projectPath ??
    undefined
  );
}

async function loadCompleteTaskMessages(args: {
  state: AppState;
  taskId: string;
  workspaceId: string;
}) {
  const loadedMessages = args.state.messagesByTask[args.taskId];
  const totalCount =
    args.state.messageCountByTask[args.taskId] ?? loadedMessages?.length ?? 0;
  if (loadedMessages && loadedMessages.length >= totalCount) {
    return loadedMessages;
  }
  return loadAllTaskMessages({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
  });
}

function cloneForkMessages(args: {
  messages: ChatMessage[];
  targetIndex: number;
  providerId: "claude-code" | "codex";
  sourceNativeSessionId: string;
  nativeSessionId: string;
  claudeMessageIdMap?: Record<string, string>;
  claudeLastAssistantMessageId?: string;
  codexTurnIds?: string[];
}) {
  const prefix = args.messages.slice(0, args.targetIndex + 1);
  const target = prefix.at(-1);
  const codexTurnIdByMessageId = new Map<string, string>();
  if (args.providerId === "codex" && args.codexTurnIds?.length) {
    const codexMessages = prefix.filter(
      (message) =>
        message.role === "assistant" &&
        message.providerId === "codex" &&
        (!message.nativeProviderSessionId ||
          message.nativeProviderSessionId === args.sourceNativeSessionId),
    );
    const offset = Math.max(0, args.codexTurnIds.length - codexMessages.length);
    codexMessages.forEach((message, index) => {
      const nativeTurnId = args.codexTurnIds?.[offset + index];
      if (nativeTurnId) {
        codexTurnIdByMessageId.set(message.id, nativeTurnId);
      }
    });
  }

  let clonedTargetMessageId = "";
  const messages = prefix.map((message) => {
    const id = crypto.randomUUID();
    if (message.id === target?.id) {
      clonedTargetMessageId = id;
    }
    if (
      message.role !== "assistant" ||
      message.providerId !== args.providerId ||
      (message.nativeProviderSessionId &&
        message.nativeProviderSessionId !== args.sourceNativeSessionId)
    ) {
      return { ...message, id, isStreaming: false };
    }

    const mappedTurnId =
      args.providerId === "claude-code"
        ? message.nativeProviderTurnId
          ? args.claudeMessageIdMap?.[message.nativeProviderTurnId]
          : undefined
        : codexTurnIdByMessageId.get(message.id);
    const nativeProviderTurnId =
      mappedTurnId ??
      (message.id === target?.id
        ? args.claudeLastAssistantMessageId
        : undefined);
    return {
      ...message,
      id,
      isStreaming: false,
      nativeProviderSessionId: args.nativeSessionId,
      nativeProviderTurnId,
    };
  });

  return { messages, clonedTargetMessageId };
}

export function createConversationThreadActions(args: {
  set: StoreSet;
  get: StoreGet;
  runScriptHookInBackground: (args: {
    workspaceId: string;
    trigger: ScriptTrigger;
    taskId?: string;
    taskTitle?: string;
    turnId?: string;
  }) => void;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
}): ConversationThreadActions {
  const {
    set,
    get,
    runScriptHookInBackground,
    incrementWorkspaceSnapshotVersion,
  } = args;

  return {
    forkConversationFromMessage: async ({ taskId, messageId }) => {
      const stateBefore = get();
      const sourceTask = stateBefore.tasks.find((task) => task.id === taskId);
      if (!sourceTask) {
        return failure("The source task no longer exists.");
      }
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      if (!workspaceId) {
        return failure("No workspace is linked to this task.");
      }

      const completeMessages = await loadCompleteTaskMessages({
        state: stateBefore,
        taskId,
        workspaceId,
      });
      const targetIndex = completeMessages.findIndex(
        (message) => message.id === messageId,
      );
      const target = completeMessages[targetIndex];
      if (
        !target ||
        target.role !== "assistant" ||
        (target.providerId !== "claude-code" && target.providerId !== "codex")
      ) {
        return failure("The selected provider response could not be found.");
      }

      const providerSession = stateBefore.providerSessionByTask[taskId];
      const actionState = buildConversationTurnActionStateByMessageId({
        messages: completeMessages,
        providerSession,
        hasActiveTurn: Boolean(stateBefore.activeTurnIdsByTask[taskId]),
      }).get(messageId)?.fork;
      if (!actionState?.enabled) {
        return failure(actionState?.reason ?? "Fork is unavailable here.");
      }
      const sessionCursor = getProviderSessionCursor({
        sessions: providerSession,
        providerId: target.providerId,
      });
      if (!sessionCursor || !target.nativeProviderTurnId) {
        return failure("Native provider turn metadata is unavailable.");
      }

      const nextTaskId = crypto.randomUUID();
      const nextTaskTitle = `${sourceTask.title} (fork)`;
      const nativeSessionTitle = toProviderSessionTitle(nextTaskTitle);
      const cwd = getWorkspaceCwd({ state: stateBefore, workspaceId });
      let nativeSessionId = "";
      let claudeMessageIdMap: Record<string, string> | undefined;
      let claudeLastAssistantMessageId: string | undefined;
      let codexTurnIds: string[] | undefined;

      if (target.providerId === "claude-code") {
        const forkClaudeSession = window.api?.provider?.forkClaudeSession;
        if (!forkClaudeSession) {
          return failure("Claude session fork controls are unavailable.");
        }
        const result = await forkClaudeSession({
          sessionId: sessionCursor.nativeSessionId,
          upToMessageId: target.nativeProviderTurnId,
          title: nativeSessionTitle,
          ...(cwd ? { cwd } : {}),
        });
        if (!result.ok || !result.sessionId) {
          return failure(result.detail);
        }
        nativeSessionId = result.sessionId;
        claudeMessageIdMap = result.messageIdMap;
        claudeLastAssistantMessageId = result.lastAssistantMessageId;
      } else {
        const forkCodexThread = window.api?.provider?.forkCodexThread;
        if (!forkCodexThread) {
          return failure("Codex thread fork controls are unavailable.");
        }
        const result = await forkCodexThread({
          threadId: sessionCursor.nativeSessionId,
          lastTurnId: target.nativeProviderTurnId,
          ...(stateBefore.settings.codexBinaryPath
            ? {
                runtimeOptions: {
                  codexBinaryPath: stateBefore.settings.codexBinaryPath,
                },
              }
            : {}),
        });
        if (!result.ok || !result.threadId) {
          return failure(result.detail);
        }
        nativeSessionId = result.threadId;
        codexTurnIds = result.turnIds;
      }

      const cloned = cloneForkMessages({
        messages: completeMessages,
        targetIndex,
        providerId: target.providerId,
        sourceNativeSessionId: sessionCursor.nativeSessionId,
        nativeSessionId,
        claudeMessageIdMap,
        claudeLastAssistantMessageId,
        codexTurnIds,
      });
      if (!cloned.clonedTargetMessageId) {
        return failure("The local fork boundary could not be created.");
      }
      const forkedTask: Task = {
        ...sourceTask,
        id: nextTaskId,
        title: nextTaskTitle,
        provider: target.providerId,
        titleManuallySet: true,
        updatedAt: buildRecentTimestamp(),
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      };

      set((state) => ({
        tasks: [forkedTask, ...state.tasks],
        activeTaskId: nextTaskId,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        activeSurface: { kind: "task", taskId: nextTaskId },
        openTaskTabIds: state.openTaskTabIds.includes(nextTaskId)
          ? state.openTaskTabIds
          : [...state.openTaskTabIds, nextTaskId],
        taskCheckpointById: {
          ...state.taskCheckpointById,
          [nextTaskId]: state.taskCheckpointById[taskId] ?? "",
        },
        messagesByTask: {
          ...state.messagesByTask,
          [nextTaskId]: cloned.messages,
        },
        messageCountByTask: {
          ...state.messageCountByTask,
          [nextTaskId]: cloned.messages.length,
        },
        nativeSessionReadyByTask: {
          ...state.nativeSessionReadyByTask,
          [nextTaskId]: true,
        },
        providerSessionByTask: {
          ...state.providerSessionByTask,
          [nextTaskId]: {
            [target.providerId]: {
              nativeSessionId,
              syncedThroughMessageId: cloned.clonedTargetMessageId,
            },
          },
        },
        providerGoalByTask: {
          ...state.providerGoalByTask,
          [nextTaskId]: null,
        },
        taskWorkspaceIdById: {
          ...state.taskWorkspaceIdById,
          [nextTaskId]: workspaceId,
        },
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
      }));

      runScriptHookInBackground({
        workspaceId,
        trigger: "task.created",
        taskId: nextTaskId,
        taskTitle: nextTaskTitle,
      });
      if (target.providerId === "codex") {
        void window.api?.provider
          ?.renameCodexThread?.({
            threadId: nativeSessionId,
            name: nativeSessionTitle,
            ...(stateBefore.settings.codexBinaryPath
              ? {
                  runtimeOptions: {
                    codexBinaryPath: stateBefore.settings.codexBinaryPath,
                  },
                }
              : {}),
          })
          .catch(() => {
            // The fork is already usable; native title sync is best-effort.
          });
      }
      await get().flushActiveWorkspaceSnapshot();

      return {
        ok: true,
        detail: `Forked a new task from this ${target.providerId === "codex" ? "Codex" : "Claude"} response.`,
        taskId: nextTaskId,
      };
    },

    rollbackConversationToMessage: async ({ taskId, messageId }) => {
      const stateBefore = get();
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      if (!workspaceId) {
        return failure("No workspace is linked to this task.");
      }
      const completeMessages = await loadCompleteTaskMessages({
        state: stateBefore,
        taskId,
        workspaceId,
      });
      const targetIndex = completeMessages.findIndex(
        (message) => message.id === messageId,
      );
      const target = completeMessages[targetIndex];
      if (!target || target.role !== "assistant") {
        return failure("The selected response could not be found.");
      }

      const providerSession = stateBefore.providerSessionByTask[taskId];
      const actionState = buildConversationTurnActionStateByMessageId({
        messages: completeMessages,
        providerSession,
        hasActiveTurn: Boolean(stateBefore.activeTurnIdsByTask[taskId]),
      }).get(messageId)?.rollback;
      if (
        !actionState?.enabled ||
        actionState.rollbackTurnCount === undefined
      ) {
        return failure(
          actionState?.reason ?? "Rollback is unavailable at this response.",
        );
      }
      const sessionCursor = getProviderSessionCursor({
        sessions: providerSession,
        providerId: "codex",
      });
      const rollbackCodexThread = window.api?.provider?.rollbackCodexThread;
      if (!sessionCursor) {
        return failure("Codex thread rollback controls are unavailable.");
      }

      if (actionState.rollbackTurnCount > 0) {
        if (!rollbackCodexThread) {
          return failure("Codex thread rollback controls are unavailable.");
        }
        const result = await rollbackCodexThread({
          threadId: sessionCursor.nativeSessionId,
          numTurns: actionState.rollbackTurnCount,
          ...(stateBefore.settings.codexBinaryPath
            ? {
                runtimeOptions: {
                  codexBinaryPath: stateBefore.settings.codexBinaryPath,
                },
              }
            : {}),
        });
        if (!result.ok) {
          return failure(result.detail);
        }
      }

      const remainingMessages = completeMessages.slice(0, targetIndex + 1);
      let persistenceFailure: string | null = null;
      try {
        await truncateTaskMessagesAfter({
          workspaceId,
          taskId,
          messageId,
        });
      } catch (error) {
        persistenceFailure =
          error instanceof Error ? error.message : String(error);
      }

      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                provider: "codex",
                updatedAt: buildRecentTimestamp(),
              }
            : task,
        ),
        messagesByTask: {
          ...state.messagesByTask,
          [taskId]: trimLoadedTaskMessages({ messages: remainingMessages }),
        },
        messageCountByTask: {
          ...state.messageCountByTask,
          [taskId]: remainingMessages.length,
        },
        providerSessionByTask: {
          ...state.providerSessionByTask,
          [taskId]: {
            codex: {
              nativeSessionId: sessionCursor.nativeSessionId,
              syncedThroughMessageId: messageId,
            },
          },
        },
        providerGoalByTask: {
          ...state.providerGoalByTask,
          [taskId]: null,
        },
        nativeSessionReadyByTask: {
          ...state.nativeSessionReadyByTask,
          [taskId]: true,
        },
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
      }));
      const cleanupTask = window.api?.provider?.cleanupTask;
      if (cleanupTask) {
        try {
          await cleanupTask({ taskId });
        } catch (error) {
          console.warn("[conversation-rollback] Runtime cleanup failed", {
            taskId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await get().flushActiveWorkspaceSnapshot();

      if (persistenceFailure) {
        return failure(
          `Codex rolled back, but Stave could not persist the local transcript boundary: ${persistenceFailure}`,
        );
      }
      return {
        ok: true,
        detail:
          actionState.rollbackTurnCount > 0
            ? `Rolled back ${actionState.rollbackTurnCount} Codex turn${actionState.rollbackTurnCount === 1 ? "" : "s"} and removed the later task messages. Workspace files were not changed.`
            : "Returned the task to this Codex response. Workspace files were not changed.",
      };
    },
  };
}

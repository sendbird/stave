import type { StoreApi } from "zustand";
import type { AppState } from "@/store/app-store.types";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import type { LoadTaskMessagesIntoSession } from "@/store/app-store-workspace-action-types";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { mergeTaskMessagePage } from "@/store/task-message-merge";
import { trimPersistedMessageWindow } from "@/store/resident-message-budget";
import { markTaskMessagesLoadFailed } from "@/store/task-message-load-failures";
import {
  TASK_MESSAGES_PAGE_SIZE,
  resolveInitialLatestTaskMessagesPageSize,
} from "@/store/task-message-loading";

/** Historical search windows never replace the live transcript used for replay or saving. */
export function createTaskMessagePageLoader(deps: {
  set: StoreApi<AppState>["setState"];
  get: StoreApi<AppState>["getState"];
  attentionSync: NotificationAttentionSync;
}): LoadTaskMessagesIntoSession {
  const { set, get, attentionSync } = deps;
  return async (args: {
    workspaceId: string;
    taskId: string;
    mode: "latest" | "older" | "newer";
    messageId?: string;
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
      return "unchanged";
    }
    if (stateBefore.taskMessagesLoadingByTask[args.taskId]) {
      return "unchanged";
    }
    const currentSession =
      args.workspaceId === stateBefore.activeWorkspaceId
        ? stateBefore
        : stateBefore.workspaceRuntimeCacheById[args.workspaceId];
    if (!currentSession) {
      return "unchanged";
    }
    const currentMessages =
      stateBefore.taskHistoryMessagesByTask?.[args.taskId] ??
      currentSession.messagesByTask[args.taskId] ??
      [];
    const totalCount =
      currentSession.messageCountByTask[args.taskId] ?? currentMessages.length;
    const windowOffset =
      (stateBefore.taskMessageWindowOffsetByTask?.[args.taskId] ?? 0) +
      (stateBefore.taskHistoryMessagesByTask?.[args.taskId]
        ? Math.max(
            0,
            totalCount -
              (stateBefore.taskHistoryMessageCountByTask?.[args.taskId] ??
                totalCount),
          )
        : 0);
    if (
      !args.messageId &&
      args.mode === "latest" &&
      currentMessages.length > 0 &&
      windowOffset === 0
    ) {
      return "unchanged";
    }
    if (
      !args.messageId &&
      args.mode === "older" &&
      currentMessages.length + windowOffset >= totalCount
    ) {
      return "unchanged";
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
        offset:
          args.mode === "older"
            ? currentMessages.length + windowOffset
            : args.mode === "newer"
              ? Math.max(0, windowOffset - TASK_MESSAGES_PAGE_SIZE)
              : 0,
        messageId: args.messageId,
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
        const liveMessages = targetSession.messagesByTask[args.taskId] ?? [];
        const historyMessages = state.taskHistoryMessagesByTask?.[args.taskId];
        const browsingHistory =
          args.messageId || (historyMessages && args.mode !== "latest");
        const sessionMessages = browsingHistory
          ? (historyMessages ?? liveMessages)
          : liveMessages;
        const nextMessages = args.messageId
          ? page.messages
          : args.mode === "newer"
            ? [
                ...sessionMessages,
                ...page.messages.filter(
                  (message) =>
                    !sessionMessages.some(
                      (resident) => resident.id === message.id,
                    ),
                ),
              ]
            : mergeTaskMessagePage({
                currentMessages: sessionMessages,
                pageMessages:
                  args.mode === "latest" && sessionMessages.length === 0
                    ? trimPersistedMessageWindow({ messages: page.messages })
                    : page.messages,
                mode: args.mode,
                supersedeDisjointWindow:
                  args.mode === "latest" && windowOffset > 0,
              });
        const nextWindowOffset =
          args.messageId || args.mode !== "older" ? page.offset : windowOffset;
        const nextHistoryWindows = { ...state.taskHistoryMessagesByTask };
        if (browsingHistory && nextWindowOffset > 0) {
          return {
            taskHistoryMessagesByTask: {
              ...nextHistoryWindows,
              [args.taskId]: nextMessages,
            },
            taskHistoryMessageCountByTask: {
              ...state.taskHistoryMessageCountByTask,
              [args.taskId]: page.totalCount,
            },
            taskMessageWindowOffsetByTask: {
              ...state.taskMessageWindowOffsetByTask,
              [args.taskId]: nextWindowOffset,
            },
            taskMessagesLoadingByTask: {
              ...state.taskMessagesLoadingByTask,
              [args.taskId]: false,
            },
          };
        }
        delete nextHistoryWindows[args.taskId];
        const liveNextMessages = browsingHistory
          ? mergeTaskMessagePage({
              currentMessages: liveMessages,
              pageMessages: page.messages,
              mode: "latest",
              supersedeDisjointWindow: true,
            })
          : nextMessages;
        const nextWindowOffsets = {
          ...state.taskMessageWindowOffsetByTask,
          [args.taskId]: nextWindowOffset,
        };
        const nextLoadingState = {
          ...state.taskMessagesLoadingByTask,
          [args.taskId]: false,
        };
        if (args.workspaceId === state.activeWorkspaceId) {
          return {
            messagesByTask: {
              ...state.messagesByTask,
              [args.taskId]: liveNextMessages,
            },
            messageCountByTask: {
              ...state.messageCountByTask,
              [args.taskId]: Math.max(page.totalCount, liveNextMessages.length),
            },
            taskMessagesLoadingByTask: nextLoadingState,
            taskMessageWindowOffsetByTask: nextWindowOffsets,
            taskHistoryMessagesByTask: nextHistoryWindows,
          };
        }
        return {
          workspaceRuntimeCacheById: {
            ...state.workspaceRuntimeCacheById,
            [args.workspaceId]: {
              ...targetSession,
              messagesByTask: {
                ...targetSession.messagesByTask,
                [args.taskId]: liveNextMessages,
              },
              messageCountByTask: {
                ...targetSession.messageCountByTask,
                [args.taskId]: Math.max(
                  page.totalCount,
                  liveNextMessages.length,
                ),
              },
            },
          },
          taskMessagesLoadingByTask: nextLoadingState,
          taskMessageWindowOffsetByTask: nextWindowOffsets,
          taskHistoryMessagesByTask: nextHistoryWindows,
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
      return "loaded";
    } catch (error) {
      console.error("[workspace] failed to load task messages", error);
      markTaskMessagesLoadFailed(args.taskId);
      set((state) => ({
        taskMessagesLoadingByTask: {
          ...state.taskMessagesLoadingByTask,
          [args.taskId]: false,
        },
      }));
      return "failed";
    }
  };
}

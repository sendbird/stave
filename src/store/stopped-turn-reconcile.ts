import type { StoreApi } from "zustand";
import { listTaskTurns } from "@/lib/db/turns.db";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { AppState } from "@/store/app-store.types";
import { TASK_MESSAGES_PAGE_SIZE } from "@/store/task-message-loading";
import { mergeTaskMessagePage } from "@/store/task-message-merge";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";

type StoreSet = StoreApi<AppState>["setState"];

const RECENT_TURN_LOOKUP_LIMIT = 20;

/**
 * Stop is offered for whatever turn the renderer still believes is running.
 * When that belief is stale (the turn finished in the main process while the
 * renderer missed its completion), the stop only stamps an old copy of the
 * reply. The persisted turn tells the two cases apart: a turn that completed
 * before the stop was requested ended on its own, so the task reloads its
 * latest persisted messages instead of keeping the stale copy.
 */
export async function reconcileStopOfFinishedTurn(args: {
  set: StoreSet;
  workspaceId: string;
  taskId: string;
  turnId: string;
  stopRequestedAt: string;
}) {
  try {
    const turns = await listTaskTurns({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: RECENT_TURN_LOOKUP_LIMIT,
    });
    const turn = turns.find((candidate) => candidate.id === args.turnId);
    if (!turn?.completedAt || turn.completedAt >= args.stopRequestedAt) {
      return false;
    }
    const page = await loadTaskMessagesPage({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      limit: TASK_MESSAGES_PAGE_SIZE,
    });
    console.warn("[turns] stop targeted a turn that had already finished; reloading messages", {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
    });
    args.set((state) => {
      const session = getWorkspaceSessionForState({
        state,
        workspaceId: args.workspaceId,
      });
      if (!session) {
        return {};
      }
      const messages = mergeTaskMessagePage({
        currentMessages: session.messagesByTask[args.taskId] ?? [],
        pageMessages: page.messages,
        mode: "latest",
      });
      const messageCount = Math.max(page.totalCount, messages.length);
      if (args.workspaceId === state.activeWorkspaceId) {
        return {
          messagesByTask: { ...state.messagesByTask, [args.taskId]: messages },
          messageCountByTask: {
            ...state.messageCountByTask,
            [args.taskId]: messageCount,
          },
          workspaceSnapshotVersion: state.workspaceSnapshotVersion + 1,
        };
      }
      return {
        workspaceRuntimeCacheById: {
          ...state.workspaceRuntimeCacheById,
          [args.workspaceId]: {
            ...session,
            messagesByTask: { ...session.messagesByTask, [args.taskId]: messages },
            messageCountByTask: {
              ...session.messageCountByTask,
              [args.taskId]: messageCount,
            },
          },
        },
      };
    });
    return true;
  } catch {
    return false;
  }
}

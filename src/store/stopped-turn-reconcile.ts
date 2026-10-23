import type { StoreApi } from "zustand";
import { listTaskTurns } from "@/lib/db/turns.db";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { AppState } from "@/store/app-store.types";
import { TASK_MESSAGES_PAGE_SIZE } from "@/store/task-message-loading";
import { mergeTaskMessagePage } from "@/store/task-message-merge";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";

type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

const RECENT_TURN_LOOKUP_LIMIT = 20;

/**
 * Stop is offered for whatever turn the renderer still believes is running.
 * When that belief is stale (the turn finished in the main process while the
 * renderer missed its completion), the stop only stamps an old copy of the
 * reply. The persisted turn tells the two cases apart: a turn that completed
 * before the stop was requested ended on its own, so the task reloads its
 * latest persisted messages instead of keeping the stale copy. Only the
 * messages the task held when the stop ran are replaced; anything added while
 * the reload was in flight (a new turn) is kept as it is.
 */
export async function reconcileStopOfFinishedTurn(args: {
  get: StoreGet;
  set: StoreSet;
  workspaceId: string;
  taskId: string;
  turnId: string;
  stopRequestedAt: string;
}) {
  const sessionAtStop = getWorkspaceSessionForState({
    state: args.get(),
    workspaceId: args.workspaceId,
  });
  const staleMessageIds = new Set(
    (sessionAtStop?.messagesByTask[args.taskId] ?? []).map((message) => message.id),
  );
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
      const current = session.messagesByTask[args.taskId] ?? [];
      const staleWindow = current.filter((message) => staleMessageIds.has(message.id));
      const laterMessages = current.filter((message) => !staleMessageIds.has(message.id));
      const laterIds = new Set(laterMessages.map((message) => message.id));
      const reconciled = mergeTaskMessagePage({
        currentMessages: staleWindow,
        // A message added after the stop is live; its persisted copy must not
        // replace it.
        pageMessages: page.messages.filter((message) => !laterIds.has(message.id)),
        mode: "latest",
        // The stop targeted a turn that had already ended, so the window it
        // held is a stale copy that the persisted page may replace.
        supersedeDisjointWindow: true,
      });
      const messages = [...reconciled, ...laterMessages];
      const persistedIds = new Set(page.messages.map((message) => message.id));
      const unpersistedLater = laterMessages.filter(
        (message) => !persistedIds.has(message.id),
      ).length;
      const messageCount = Math.max(
        page.totalCount + unpersistedLater,
        messages.length,
      );
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

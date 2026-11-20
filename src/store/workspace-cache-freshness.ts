import { listActiveWorkspaceTurns, listTaskTurns } from "@/lib/db/turns.db";
import { loadTaskMessagesPage, loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import {
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import { TASK_MESSAGES_PAGE_SIZE } from "@/store/task-message-loading";
import { trimPersistedMessageWindow } from "@/store/resident-message-budget";

/**
 * Tasks a cached runtime session knows whose persisted message count is higher
 * than the cache counted. A non-empty cache is otherwise reused as-is, so a
 * stale task would hide those messages and write its older copy back on the
 * next snapshot. Tasks the cache does not know are left to the shell
 * heuristics.
 */
export function findStaleCachedTaskIds(args: {
  cachedWorkspaceState?: WorkspaceSessionState;
  persistedMessageCountByTask?: Record<string, number> | null;
}) {
  const cached = args.cachedWorkspaceState;
  const persistedCounts = args.persistedMessageCountByTask;
  if (!cached || !persistedCounts) {
    return [];
  }
  return cached.tasks
    .filter(
      (task) =>
        (persistedCounts[task.id] ?? 0) >
        (cached.messageCountByTask[task.id] ?? 0),
    )
    .map((task) => task.id);
}

export interface StaleCachedWorkspaceRefresh {
  session: WorkspaceSessionState;
  refreshedTaskIds: string[];
  /** Ended cached turns. Only a verified completion with its final reply may resume the queue. */
  endedTurns: Array<{ taskId: string; turnId: string; resumeQueue?: true }>;
}

/**
 * Resets the stale tasks of a cached session to their persisted count and an
 * empty window, so the regular latest-page load fills them from SQLite. Every
 * other task keeps its live cached state. A stale task whose cached turn is
 * still running in persistence is left alone; one whose turn already ended
 * drops that turn id too.
 */
export function resetStaleCachedTasks(args: {
  cachedWorkspaceState: WorkspaceSessionState;
  staleTaskIds: string[];
  persistedMessageCountByTask: Record<string, number>;
  liveTurnIds: ReadonlySet<string>;
}): StaleCachedWorkspaceRefresh {
  const cached = args.cachedWorkspaceState;
  const refreshedTaskIds = args.staleTaskIds.filter((taskId) => {
    const turnId = cached.activeTurnIdsByTask[taskId];
    return !turnId || !args.liveTurnIds.has(turnId);
  });
  if (refreshedTaskIds.length === 0) {
    return { session: cached, refreshedTaskIds, endedTurns: [] };
  }
  const messagesByTask = { ...cached.messagesByTask };
  const messageCountByTask = { ...cached.messageCountByTask };
  const activeTurnIdsByTask = { ...cached.activeTurnIdsByTask };
  const endedTurns: StaleCachedWorkspaceRefresh["endedTurns"] = [];
  for (const taskId of refreshedTaskIds) {
    const turnId = activeTurnIdsByTask[taskId];
    if (turnId) {
      endedTurns.push({ taskId, turnId });
    }
    messagesByTask[taskId] = [];
    messageCountByTask[taskId] =
      args.persistedMessageCountByTask[taskId] ?? cached.messageCountByTask[taskId] ?? 0;
    activeTurnIdsByTask[taskId] = undefined;
  }
  return {
    session: { ...cached, messagesByTask, messageCountByTask, activeTurnIdsByTask },
    refreshedTaskIds,
    endedTurns,
  };
}

/**
 * The cached session a workspace switch should install. The switch reads the
 * cache, then awaits persistence before it installs the session; provider
 * events for the workspace's background turns keep landing in the cache during
 * that wait. Installing the copy read before the wait would discard them, and
 * when one of them was the turn's `done`, the finished turn would come back as
 * running with no stream left to end it. This returns the cache as it is now,
 * with the stale-task refresh computed from the earlier read applied to it. A
 * task whose cache now holds a different running turn keeps its live state.
 */
export function resolveLatestCachedWorkspace(args: {
  readCache: WorkspaceSessionState | undefined;
  latestCache: WorkspaceSessionState | undefined;
  refresh: StaleCachedWorkspaceRefresh | null;
}): {
  session: WorkspaceSessionState | undefined;
  refresh: StaleCachedWorkspaceRefresh | null;
} {
  const { readCache, latestCache, refresh } = args;
  if (!latestCache || latestCache === readCache) {
    return { session: refresh?.session ?? readCache, refresh };
  }
  if (!refresh || refresh.refreshedTaskIds.length === 0) {
    return { session: latestCache, refresh };
  }
  const refreshedTaskIds = refresh.refreshedTaskIds.filter((taskId) => {
    // A local completion may already have sent the next item. Keep that
    // live transcript even if the task is idle again by the time we merge.
    const latestTurnId = latestCache.activeTurnIdsByTask[taskId];
    return (
      (!latestTurnId || latestTurnId === readCache?.activeTurnIdsByTask[taskId]) &&
      latestCache.messagesByTask[taskId] === readCache?.messagesByTask[taskId]
    );
  });
  if (refreshedTaskIds.length === 0) {
    return {
      session: latestCache,
      refresh: { session: latestCache, refreshedTaskIds, endedTurns: [] },
    };
  }
  const messagesByTask = { ...latestCache.messagesByTask };
  const messageCountByTask = { ...latestCache.messageCountByTask };
  const activeTurnIdsByTask = { ...latestCache.activeTurnIdsByTask };
  for (const taskId of refreshedTaskIds) {
    messagesByTask[taskId] = refresh.session.messagesByTask[taskId] ?? [];
    messageCountByTask[taskId] = refresh.session.messageCountByTask[taskId] ?? 0;
    activeTurnIdsByTask[taskId] = undefined;
  }
  const session = { ...latestCache, messagesByTask, messageCountByTask, activeTurnIdsByTask };
  return {
    session,
    refresh: {
      session,
      refreshedTaskIds,
      endedTurns: refresh.endedTurns.filter(({ taskId }) => refreshedTaskIds.includes(taskId)),
    },
  };
}

/**
 * Drops the activity of turns a cache refresh found already ended, so their
 * task no longer shows a running turn or a pending "input needed" state.
 * Activity of any other turn is kept.
 */
export function clearEndedTurnActivity(args: {
  activityByTask: Record<string, ProviderTurnActivitySnapshot | undefined>;
  endedTurns: StaleCachedWorkspaceRefresh["endedTurns"];
}) {
  let activityByTask = args.activityByTask;
  for (const { taskId, turnId } of args.endedTurns) {
    if (activityByTask[taskId]?.turnId === turnId) {
      activityByTask = clearProviderTurnActivity({ activityByTask, taskId });
    }
  }
  return activityByTask;
}

/**
 * Checks a cached session against the persisted shell summary (one small read)
 * and resets the tasks that fell behind or adopts completed queued turns.
 * Returns null when the cache is current or a read fails.
 */
export async function refreshStaleCachedWorkspace(args: {
  workspaceId: string;
  cachedWorkspaceState?: WorkspaceSessionState;
}): Promise<StaleCachedWorkspaceRefresh | null> {
  const cached = args.cachedWorkspaceState;
  if (!cached) {
    return null;
  }
  try {
    const summary = await loadWorkspaceShellSummary({
      workspaceId: args.workspaceId,
    });
    const persistedMessageCountByTask = summary?.messageCountByTask ?? {};
    const staleTaskIds = new Set(findStaleCachedTaskIds({
      cachedWorkspaceState: cached,
      persistedMessageCountByTask,
    }));
    // Completion can update an existing assistant row in place. A message
    // count comparison alone will miss it.
    const queuedActiveTasks = cached.tasks.filter(({ id }) =>
      cached.activeTurnIdsByTask[id] && cached.promptDraftByTask[id]?.queuedTurns?.length,
    );
    const completedQueuePages = new Map<string, Awaited<ReturnType<typeof loadTaskMessagesPage>>>();
    await Promise.all(queuedActiveTasks.map(async ({ id: taskId }) => {
      const [latest] = await listTaskTurns({ workspaceId: args.workspaceId, taskId, limit: 1 })
        .catch(() => []);
      if (
        !latest || latest.id !== cached.activeTurnIdsByTask[taskId] ||
        latest.workspaceId !== args.workspaceId || latest.taskId !== taskId ||
        !latest.completedAt || !latest.terminalReceipt?.doneObserved ||
        latest.terminalReceipt.outcome !== "completed"
      ) {
        return;
      }
      const page = await loadTaskMessagesPage({
        workspaceId: args.workspaceId, taskId, limit: TASK_MESSAGES_PAGE_SIZE,
      }).catch(() => null);
      const last = page?.messages.at(-1);
      if (
        !page || last?.role !== "assistant" || last.turnId !== latest.id ||
        !last.completedAt || !last.terminalReceipt?.doneObserved
      ) {
        // The receipt can reach SQLite before the final reply is saved.
        // Keep the live turn so a late stream completion can still apply.
        staleTaskIds.delete(taskId);
        return;
      }
      completedQueuePages.set(taskId, page);
      staleTaskIds.add(taskId);
    }));
    if (staleTaskIds.size === 0) {
      return null;
    }
    const needsTurnCheck = [...staleTaskIds].some(
      (taskId) => cached.activeTurnIdsByTask[taskId],
    );
    const liveTurnIds = new Set(
      needsTurnCheck
        ? (await listActiveWorkspaceTurns({ workspaceId: args.workspaceId })).map(
            (turn) => turn.id,
          )
        : [],
    );
    const refreshed = resetStaleCachedTasks({
      cachedWorkspaceState: cached,
      staleTaskIds: [...staleTaskIds],
      persistedMessageCountByTask,
      liveTurnIds,
    });
    if (refreshed.refreshedTaskIds.length === 0) {
      return null;
    }
    for (const ended of refreshed.endedTurns) {
      const page = completedQueuePages.get(ended.taskId);
      if (page) {
        ended.resumeQueue = true;
        refreshed.session.messagesByTask[ended.taskId] = trimPersistedMessageWindow({
          messages: page.messages,
        });
        refreshed.session.messageCountByTask[ended.taskId] = Math.max(
          page.totalCount, page.messages.length,
        );
      }
    }
    console.warn("[workspace] cached tasks are behind persistence; reloading them", {
      workspaceId: args.workspaceId,
      taskIds: refreshed.refreshedTaskIds,
    });
    return refreshed;
  } catch {
    return null;
  }
}

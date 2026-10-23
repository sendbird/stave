import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import { loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

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
}): { session: WorkspaceSessionState; refreshedTaskIds: string[] } {
  const cached = args.cachedWorkspaceState;
  const refreshedTaskIds = args.staleTaskIds.filter((taskId) => {
    const turnId = cached.activeTurnIdsByTask[taskId];
    return !turnId || !args.liveTurnIds.has(turnId);
  });
  if (refreshedTaskIds.length === 0) {
    return { session: cached, refreshedTaskIds };
  }
  const messagesByTask = { ...cached.messagesByTask };
  const messageCountByTask = { ...cached.messageCountByTask };
  const activeTurnIdsByTask = { ...cached.activeTurnIdsByTask };
  for (const taskId of refreshedTaskIds) {
    messagesByTask[taskId] = [];
    messageCountByTask[taskId] = args.persistedMessageCountByTask[taskId] ?? 0;
    activeTurnIdsByTask[taskId] = undefined;
  }
  return {
    session: { ...cached, messagesByTask, messageCountByTask, activeTurnIdsByTask },
    refreshedTaskIds,
  };
}

/**
 * Checks a cached session against the persisted shell summary (one small read)
 * and resets the tasks that fell behind. Returns null when the cache is
 * current or a read fails: this only adds a reload, it never blocks a
 * workspace from opening.
 */
export async function refreshStaleCachedWorkspace(args: {
  workspaceId: string;
  cachedWorkspaceState?: WorkspaceSessionState;
}): Promise<{ session: WorkspaceSessionState; refreshedTaskIds: string[] } | null> {
  const cached = args.cachedWorkspaceState;
  if (!cached) {
    return null;
  }
  try {
    const summary = await loadWorkspaceShellSummary({
      workspaceId: args.workspaceId,
    });
    const persistedMessageCountByTask = summary?.messageCountByTask ?? {};
    const staleTaskIds = findStaleCachedTaskIds({
      cachedWorkspaceState: cached,
      persistedMessageCountByTask,
    });
    if (staleTaskIds.length === 0) {
      return null;
    }
    const needsTurnCheck = staleTaskIds.some(
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
      staleTaskIds,
      persistedMessageCountByTask,
      liveTurnIds,
    });
    if (refreshed.refreshedTaskIds.length === 0) {
      return null;
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

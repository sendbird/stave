import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import { loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import {
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
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

export interface StaleCachedWorkspaceRefresh {
  session: WorkspaceSessionState;
  refreshedTaskIds: string[];
  /** Cached turns of refreshed tasks that had already ended in persistence. */
  endedTurns: Array<{ taskId: string; turnId: string }>;
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
    messageCountByTask[taskId] = args.persistedMessageCountByTask[taskId] ?? 0;
    activeTurnIdsByTask[taskId] = undefined;
  }
  return {
    session: { ...cached, messagesByTask, messageCountByTask, activeTurnIdsByTask },
    refreshedTaskIds,
    endedTurns,
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
 * and resets the tasks that fell behind. Returns null when the cache is
 * current or a read fails: this only adds a reload, it never blocks a
 * workspace from opening.
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

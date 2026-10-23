import { loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

/**
 * Whether a cached runtime session lost track of messages persistence already
 * holds: a task the cache knows has more durable rows than the cache counted.
 * A non-empty cache is otherwise reused as-is, so a stale one would hide those
 * messages and write its older copy back on the next snapshot. Tasks the cache
 * does not know are left to the existing shell heuristics.
 */
export function isWorkspaceRuntimeCacheBehindPersistence(args: {
  cachedWorkspaceState?: WorkspaceSessionState;
  persistedMessageCountByTask?: Record<string, number> | null;
}) {
  const cached = args.cachedWorkspaceState;
  const persistedCounts = args.persistedMessageCountByTask;
  if (!cached || !persistedCounts) {
    return false;
  }
  return cached.tasks.some(
    (task) =>
      (persistedCounts[task.id] ?? 0) >
      (cached.messageCountByTask[task.id] ?? 0),
  );
}

/**
 * Compares a cached session with the persisted shell summary, a single small
 * read. A failed read keeps the cache: this check only adds a reload, it never
 * blocks a workspace from opening.
 */
export async function isCachedWorkspaceBehindPersistence(args: {
  workspaceId: string;
  cachedWorkspaceState?: WorkspaceSessionState;
}) {
  if (!args.cachedWorkspaceState) {
    return false;
  }
  try {
    const summary = await loadWorkspaceShellSummary({
      workspaceId: args.workspaceId,
    });
    const behind = isWorkspaceRuntimeCacheBehindPersistence({
      cachedWorkspaceState: args.cachedWorkspaceState,
      persistedMessageCountByTask: summary?.messageCountByTask,
    });
    if (behind) {
      console.warn("[workspace] cached session is behind persistence; reloading", {
        workspaceId: args.workspaceId,
      });
    }
    return behind;
  } catch {
    return false;
  }
}

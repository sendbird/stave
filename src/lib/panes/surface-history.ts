/**
 * Back/forward history of the surfaces the user activated: a workspace plus
 * the task, editor or Lens tab in it. Visiting a new place after going back
 * drops the forward entries, the way a browser does.
 */

export const SURFACE_HISTORY_LIMIT = 50;

export type SurfaceHistoryTarget =
  | { kind: "task"; taskId: string }
  | { kind: "editor"; editorTabId: string }
  | { kind: "lens"; lensSessionId: string };

export interface SurfaceHistoryLocation {
  repositoryPath: string;
  workspaceId: string;
  surface: SurfaceHistoryTarget;
}

export interface SurfaceHistory {
  entries: readonly SurfaceHistoryLocation[];
  /** Index of the current entry; -1 while empty. */
  index: number;
}

export type SurfaceHistoryDirection = "back" | "forward";

export const EMPTY_SURFACE_HISTORY: SurfaceHistory = { entries: [], index: -1 };

function targetEntityId(target: SurfaceHistoryTarget) {
  switch (target.kind) {
    case "task":
      return target.taskId;
    case "editor":
      return target.editorTabId;
    case "lens":
      return target.lensSessionId;
  }
}

export function surfaceLocationEquals(
  left: SurfaceHistoryLocation | undefined,
  right: SurfaceHistoryLocation | undefined,
) {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.repositoryPath === right.repositoryPath &&
    left.workspaceId === right.workspaceId &&
    left.surface.kind === right.surface.kind &&
    targetEntityId(left.surface) === targetEntityId(right.surface)
  );
}

/**
 * Record a visit. Visiting the current entry again changes nothing; anything
 * else drops the forward entries, appends, and trims the oldest past `limit`.
 */
export function recordSurfaceVisit(
  history: SurfaceHistory,
  location: SurfaceHistoryLocation,
  limit = SURFACE_HISTORY_LIMIT,
): SurfaceHistory {
  if (surfaceLocationEquals(history.entries[history.index], location)) {
    return history;
  }
  const kept = history.entries.slice(0, history.index + 1);
  const entries = [...kept, location];
  const overflow = Math.max(0, entries.length - limit);
  return {
    entries: overflow > 0 ? entries.slice(overflow) : entries,
    index: entries.length - 1 - overflow,
  };
}

/**
 * The nearest entry in `direction` that is still reachable, skipping entries
 * whose workspace or tab is gone. Returns null at either end.
 */
export function findSurfaceHistoryStep(
  history: SurfaceHistory,
  direction: SurfaceHistoryDirection,
  isReachable: (location: SurfaceHistoryLocation) => boolean,
): { index: number; location: SurfaceHistoryLocation } | null {
  const step = direction === "back" ? -1 : 1;
  const current = history.entries[history.index];
  for (
    let index = history.index + step;
    index >= 0 && index < history.entries.length;
    index += step
  ) {
    const location = history.entries[index]!;
    if (surfaceLocationEquals(location, current)) {
      continue;
    }
    if (isReachable(location)) {
      return { index, location };
    }
  }
  return null;
}

export function moveSurfaceHistory(
  history: SurfaceHistory,
  index: number,
): SurfaceHistory {
  if (index < 0 || index >= history.entries.length || index === history.index) {
    return history;
  }
  return { entries: history.entries, index };
}

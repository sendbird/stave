import { paneHost } from "@/components/panes/pane-host-controller";
import {
  EMPTY_SURFACE_HISTORY,
  findSurfaceHistoryStep,
  moveSurfaceHistory,
  recordSurfaceVisit,
  type SurfaceHistory,
  type SurfaceHistoryDirection,
  type SurfaceHistoryLocation,
  type SurfaceHistoryTarget,
} from "@/lib/panes/surface-history";
import { isTaskArchived } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";

/**
 * Back/forward through the surfaces the user activated (Cmd/Ctrl+[ and ]).
 * A store subscription records every activated task, editor or Lens tab with
 * its workspace; navigating replays one entry and is not recorded itself.
 */
let history: SurfaceHistory = EMPTY_SURFACE_HISTORY;
let navigating = false;

type TrackedState = Pick<
  AppState,
  "activeAppSurface" | "activeSurface" | "activeWorkspaceId" | "repositoryPath"
>;

function toHistoryTarget(
  surface: AppState["activeSurface"],
): SurfaceHistoryTarget | null {
  switch (surface.kind) {
    case "task":
      return surface.taskId ? surface : null;
    case "editor":
      return surface.editorTabId ? surface : null;
    case "lens":
      return surface.lensSessionId ? surface : null;
    default:
      return null;
  }
}

export function resolveSurfaceHistoryLocation(
  state: TrackedState,
): SurfaceHistoryLocation | null {
  if (state.activeAppSurface.kind !== "workspace" || !state.activeWorkspaceId) {
    return null;
  }
  const surface = toHistoryTarget(state.activeSurface);
  if (!surface) {
    return null;
  }
  return {
    repositoryPath: state.repositoryPath ?? "",
    workspaceId: state.activeWorkspaceId,
    surface,
  };
}

function surfaceExists(state: AppState, target: SurfaceHistoryTarget) {
  switch (target.kind) {
    case "task": {
      const task = state.tasks.find((item) => item.id === target.taskId);
      return Boolean(task) && !isTaskArchived(task!);
    }
    case "editor":
      return state.editorTabs.some((tab) => tab.id === target.editorTabId);
    case "lens":
      return state.lensTabs.some((tab) => tab.id === target.lensSessionId);
  }
}

/**
 * Whether an entry can still be visited. Inside the active workspace the tab
 * itself must exist; elsewhere in this repository the workspace must; another
 * repository is checked once it is open.
 */
function isReachable(location: SurfaceHistoryLocation) {
  const state = useAppStore.getState();
  if ((state.repositoryPath ?? "") !== location.repositoryPath) {
    return Boolean(location.repositoryPath);
  }
  if (location.workspaceId === state.activeWorkspaceId) {
    return surfaceExists(state, location.surface);
  }
  return state.workspaces.some(
    (workspace) => workspace.id === location.workspaceId,
  );
}

function record(state: TrackedState) {
  if (navigating) {
    return;
  }
  const location = resolveSurfaceHistoryLocation(state);
  if (location) {
    history = recordSurfaceVisit(history, location);
  }
}

/** Start recording activated surfaces; returns the unsubscribe function. */
export function startSurfaceHistoryTracking(): () => void {
  record(useAppStore.getState());
  return useAppStore.subscribe((state, previous) => {
    if (
      state.activeSurface === previous.activeSurface &&
      state.activeWorkspaceId === previous.activeWorkspaceId &&
      state.activeAppSurface === previous.activeAppSurface &&
      state.repositoryPath === previous.repositoryPath
    ) {
      return;
    }
    record(state);
  });
}

async function visit(location: SurfaceHistoryLocation) {
  const store = useAppStore.getState();
  if (
    location.repositoryPath &&
    (store.repositoryPath ?? "") !== location.repositoryPath
  ) {
    await store.openRepository({ repositoryPath: location.repositoryPath });
  }
  let state = useAppStore.getState();
  if (
    state.activeWorkspaceId !== location.workspaceId ||
    state.activeAppSurface.kind !== "workspace"
  ) {
    await state.switchWorkspace({ workspaceId: location.workspaceId });
  }
  state = useAppStore.getState();
  if (
    state.activeWorkspaceId !== location.workspaceId ||
    !surfaceExists(state, location.surface)
  ) {
    return;
  }
  paneHost.openSurface(location.surface);
}

/**
 * Go one step back or forward. Returns false at either end of the history,
 * so the key press is left alone.
 */
export async function navigateSurfaceHistory(
  direction: SurfaceHistoryDirection,
): Promise<boolean> {
  if (navigating) {
    return true;
  }
  const step = findSurfaceHistoryStep(history, direction, isReachable);
  if (!step) {
    return false;
  }
  history = moveSurfaceHistory(history, step.index);
  navigating = true;
  try {
    await visit(step.location);
  } finally {
    navigating = false;
  }
  return true;
}

/** Whether a step in `direction` exists right now. */
export function canNavigateSurfaceHistory(direction: SurfaceHistoryDirection) {
  return findSurfaceHistoryStep(history, direction, isReachable) !== null;
}

/** Test seam. */
export function resetSurfaceHistory() {
  history = EMPTY_SURFACE_HISTORY;
  navigating = false;
}

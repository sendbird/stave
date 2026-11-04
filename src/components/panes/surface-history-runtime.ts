import { create } from "zustand";
import { paneHost } from "@/components/panes/pane-host-controller";
import {
  EMPTY_SURFACE_HISTORY,
  findSurfaceHistoryStep,
  getBackAppSurfaceKind,
  isAppSurfaceLocation,
  moveSurfaceHistory,
  recordSurfaceVisit,
  type SurfaceHistory,
  type SurfaceHistoryAppSurface,
  type SurfaceHistoryDirection,
  type SurfaceHistoryLocation,
  type SurfaceHistoryTarget,
  type SurfaceHistoryWorkspaceLocation,
} from "@/lib/panes/surface-history";
import {
  isSurfaceTransitionActive,
  onSurfaceTransitionSettled,
} from "@/lib/panes/surface-transition";
import { isTaskArchived } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import {
  setAppSurfaceBackNavigator,
  type AppOverlaySurfaceKind,
} from "@/store/app-surface";

/**
 * Back/forward through the places the user visited (Cmd/Ctrl+[ and ]). A
 * store subscription records every activated task, editor or Lens tab with
 * its workspace, and every global view; navigating replays one entry and is
 * not recorded itself. Closing a global view goes back one entry, so it
 * returns to wherever the user opened it from.
 */
const useSurfaceHistoryStore = create<{ history: SurfaceHistory }>(() => ({
  history: EMPTY_SURFACE_HISTORY,
}));
let navigating = false;

function readHistory() {
  return useSurfaceHistoryStore.getState().history;
}

function writeHistory(history: SurfaceHistory) {
  if (history !== readHistory()) {
    useSurfaceHistoryStore.setState({ history });
  }
}

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
  if (state.activeAppSurface.kind !== "workspace") {
    return { appSurface: state.activeAppSurface };
  }
  if (!state.activeWorkspaceId) {
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
 * Whether an entry can still be visited. A global view always can. Inside
 * the active workspace the tab itself must exist; elsewhere in this
 * repository the workspace must; another repository is checked once it is
 * open.
 */
function isReachable(location: SurfaceHistoryLocation) {
  if (isAppSurfaceLocation(location)) {
    return true;
  }
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
  if (navigating || isSurfaceTransitionActive()) {
    return;
  }
  const location = resolveSurfaceHistoryLocation(state);
  if (location) {
    writeHistory(recordSurfaceVisit(readHistory(), location));
  }
}

function openAppSurface(surface: SurfaceHistoryAppSurface) {
  const state = useAppStore.getState();
  switch (surface.kind) {
    case "fleet-view":
      state.openFleetView();
      return;
    case "automation-center":
      state.openAutomationCenter();
      return;
    case "issues":
      state.openIssues();
      return;
    case "agents":
      state.openAgents();
      return;
    case "usage":
      state.openUsage(
        surface.providerId
          ? {
              providerId: surface.providerId,
              ...(surface.accountProfileId
                ? { accountProfileId: surface.accountProfileId }
                : {}),
            }
          : undefined,
      );
      return;
  }
}

/**
 * Closing the open global view goes back one step when there is somewhere to
 * go; otherwise the store falls back to the workspace.
 */
function closeAppSurfaceBack(kind: AppOverlaySurfaceKind) {
  if (navigating || useAppStore.getState().activeAppSurface.kind !== kind) {
    return false;
  }
  if (!canNavigateSurfaceHistory("back")) {
    return false;
  }
  void navigateSurfaceHistory("back");
  return true;
}

/** Start recording visited places; returns the stop function. */
export function startSurfaceHistoryTracking(): () => void {
  record(useAppStore.getState());
  const unsubscribe = useAppStore.subscribe((state, previous) => {
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
  const stopSettled = onSurfaceTransitionSettled(() =>
    record(useAppStore.getState()),
  );
  const stopBack = setAppSurfaceBackNavigator(closeAppSurfaceBack);
  return () => {
    unsubscribe();
    stopSettled();
    stopBack();
  };
}

async function visitWorkspace(location: SurfaceHistoryWorkspaceLocation) {
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
  const step = findSurfaceHistoryStep(readHistory(), direction, isReachable);
  if (!step) {
    return false;
  }
  writeHistory(moveSurfaceHistory(readHistory(), step.index));
  navigating = true;
  try {
    // A global view opens synchronously, so `navigating` is clear again
    // before the next key press or close can ask for another step.
    if (isAppSurfaceLocation(step.location)) {
      openAppSurface(step.location.appSurface);
    } else {
      await visitWorkspace(step.location);
    }
  } finally {
    navigating = false;
  }
  return true;
}

/** Whether a step in `direction` exists right now. */
export function canNavigateSurfaceHistory(direction: SurfaceHistoryDirection) {
  return findSurfaceHistoryStep(readHistory(), direction, isReachable) !== null;
}

/**
 * The global view one step back from the current place, e.g. `fleet-view`
 * while showing a task opened from Fleet. A string, so it is selector-stable.
 */
export function useBackAppSurfaceKind() {
  return useSurfaceHistoryStore((state) => getBackAppSurfaceKind(state.history));
}

/** Test seam. */
export function resetSurfaceHistory() {
  writeHistory(EMPTY_SURFACE_HISTORY);
  navigating = false;
}

/** Test seam: the recorded entries and the current index. */
export function readSurfaceHistory(): SurfaceHistory {
  return readHistory();
}

/**
 * App-level surfaces swap out the main content column while the sidebar, top
 * bar, and right rail stay mounted. Fleet View, the Automation Center, and
 * Tasks are peers here: exactly one of them can own the column at a time.
 */
export type AppActiveSurface =
  | { kind: "workspace" }
  | { kind: "fleet-view" }
  | { kind: "automation-center" }
  | { kind: "tasks" };

export type AppOverlaySurfaceKind = Exclude<
  AppActiveSurface["kind"],
  "workspace"
>;

// Frozen singletons keep `activeAppSurface` referentially stable so a repeated
// open/close never invalidates selectors that compare by identity.
export const WORKSPACE_APP_SURFACE = {
  kind: "workspace",
} satisfies AppActiveSurface;
export const FLEET_VIEW_APP_SURFACE = {
  kind: "fleet-view",
} satisfies AppActiveSurface;
export const AUTOMATION_CENTER_APP_SURFACE = {
  kind: "automation-center",
} satisfies AppActiveSurface;
export const TASKS_APP_SURFACE = {
  kind: "tasks",
} satisfies AppActiveSurface;

const APP_SURFACE_BY_KIND: Record<AppOverlaySurfaceKind, AppActiveSurface> = {
  "fleet-view": FLEET_VIEW_APP_SURFACE,
  "automation-center": AUTOMATION_CENTER_APP_SURFACE,
  tasks: TASKS_APP_SURFACE,
};

export function normalizeAppActiveSurface(value: unknown): AppActiveSurface {
  if (value && typeof value === "object" && "kind" in value) {
    const surface =
      APP_SURFACE_BY_KIND[value.kind as AppOverlaySurfaceKind] ?? null;
    if (surface) {
      return surface;
    }
  }
  return WORKSPACE_APP_SURFACE;
}

export interface AppSurfaceActions {
  openFleetView: () => void;
  closeFleetView: () => void;
  toggleFleetView: () => void;
  openAutomationCenter: () => void;
  closeAutomationCenter: () => void;
  toggleAutomationCenter: () => void;
  openTasks: () => void;
  closeTasks: () => void;
  toggleTasks: () => void;
}

type AppSurfaceState = { activeAppSurface: AppActiveSurface };

/**
 * Returning the untouched state object is load-bearing: zustand skips the
 * notify pass when the updater returns the same reference.
 */
type AppSurfaceSet<TState extends AppSurfaceState> = (
  updater: (state: TState) => TState | AppSurfaceState,
) => void;

export function createAppSurfaceActions<TState extends AppSurfaceState>(
  set: AppSurfaceSet<TState>,
): AppSurfaceActions {
  const open = (kind: AppOverlaySurfaceKind) => () => {
    set((state) =>
      state.activeAppSurface.kind === kind
        ? state
        : { activeAppSurface: APP_SURFACE_BY_KIND[kind] },
    );
  };
  const close = (kind: AppOverlaySurfaceKind) => () => {
    set((state) =>
      state.activeAppSurface.kind === kind
        ? { activeAppSurface: WORKSPACE_APP_SURFACE }
        : state,
    );
  };
  const toggle = (kind: AppOverlaySurfaceKind) => () => {
    set((state) => ({
      activeAppSurface:
        state.activeAppSurface.kind === kind
          ? WORKSPACE_APP_SURFACE
          : APP_SURFACE_BY_KIND[kind],
    }));
  };

  return {
    openFleetView: open("fleet-view"),
    closeFleetView: close("fleet-view"),
    toggleFleetView: toggle("fleet-view"),
    openAutomationCenter: open("automation-center"),
    closeAutomationCenter: close("automation-center"),
    toggleAutomationCenter: toggle("automation-center"),
    openTasks: open("tasks"),
    closeTasks: close("tasks"),
    toggleTasks: toggle("tasks"),
  };
}

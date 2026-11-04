import type { ProviderId } from "@/lib/providers/provider.types";
import { useAgentsViewStore } from "@/store/agents-view-store";

/**
 * App-level surfaces swap out the main content column while the sidebar, top
 * bar, and right rail stay mounted. Fleet View, Automations, Issues, Agents
 * and AI usage are peers here: exactly one of them can own the column at a time.
 *
 * Agent performance is the Agents surface's Performance tab, not a surface of
 * its own: every entry point that opens it opens Agents on that tab.
 *
 * The retired Projects surface (`{ kind: "projects" }`) may still be persisted;
 * it has no entry below, so it normalizes to the workspace surface.
 */
export type AppActiveSurface =
  | { kind: "workspace" }
  | { kind: "fleet-view" }
  | { kind: "automation-center" }
  | { kind: "issues" }
  | { kind: "agents" }
  | { kind: "usage"; providerId?: ProviderId; accountProfileId?: string };

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
export const ISSUES_APP_SURFACE = {
  kind: "issues",
} satisfies AppActiveSurface;
export const AGENTS_APP_SURFACE = {
  kind: "agents",
} satisfies AppActiveSurface;

export const USAGE_APP_SURFACE = { kind: "usage" } satisfies AppActiveSurface;

const APP_SURFACE_BY_KIND: Record<AppOverlaySurfaceKind, AppActiveSurface> = {
  "fleet-view": FLEET_VIEW_APP_SURFACE,
  "automation-center": AUTOMATION_CENTER_APP_SURFACE,
  issues: ISSUES_APP_SURFACE,
  agents: AGENTS_APP_SURFACE,
  usage: USAGE_APP_SURFACE,
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

/**
 * Closing a surface goes back one step, to wherever the user came from (the
 * history runtime registers this). It returns false when it did not act — no
 * earlier place to return to, or `kind` is not the open surface — and the
 * close then falls back to the workspace.
 */
export type AppSurfaceBackNavigator = (kind: AppOverlaySurfaceKind) => boolean;

let appSurfaceBackNavigator: AppSurfaceBackNavigator | null = null;

/** Registers how closing goes back; returns the unregister function. */
export function setAppSurfaceBackNavigator(
  navigator: AppSurfaceBackNavigator,
): () => void {
  appSurfaceBackNavigator = navigator;
  return () => {
    if (appSurfaceBackNavigator === navigator) {
      appSurfaceBackNavigator = null;
    }
  };
}

export interface AppSurfaceActions {
  openFleetView: () => void;
  closeFleetView: () => void;
  toggleFleetView: () => void;
  openAutomationCenter: () => void;
  closeAutomationCenter: () => void;
  toggleAutomationCenter: () => void;
  openIssues: () => void;
  closeIssues: () => void;
  toggleIssues: () => void;
  openAgents: () => void;
  closeAgents: () => void;
  toggleAgents: () => void;
  /** Opens the Agents surface on its Performance tab. */
  openAgentPerformance: () => void;
  openUsage: (scope?: { providerId: ProviderId; accountProfileId?: string }) => void;
  closeUsage: () => void;
  /**
   * Leaves `kind` for the workspace without going back: for actions that
   * finish by showing something in the workspace (a task, a panel), where a
   * close would return to an unrelated earlier place instead.
   */
  exitToWorkspace: (kind: AppOverlaySurfaceKind) => void;
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
  const exitToWorkspace = (kind: AppOverlaySurfaceKind) => {
    set((state) =>
      state.activeAppSurface.kind === kind
        ? { activeAppSurface: WORKSPACE_APP_SURFACE }
        : state,
    );
  };
  const close = (kind: AppOverlaySurfaceKind) => () => {
    if (appSurfaceBackNavigator?.(kind)) {
      return;
    }
    exitToWorkspace(kind);
  };
  const toggle = (kind: AppOverlaySurfaceKind) => () => {
    if (appSurfaceBackNavigator?.(kind)) {
      return;
    }
    set((state) => ({
      activeAppSurface:
        state.activeAppSurface.kind === kind
          ? WORKSPACE_APP_SURFACE
          : APP_SURFACE_BY_KIND[kind],
    }));
  };
  const openAgents = open("agents");

  return {
    openFleetView: open("fleet-view"),
    closeFleetView: close("fleet-view"),
    toggleFleetView: toggle("fleet-view"),
    openAutomationCenter: open("automation-center"),
    closeAutomationCenter: close("automation-center"),
    toggleAutomationCenter: toggle("automation-center"),
    openIssues: open("issues"),
    closeIssues: close("issues"),
    toggleIssues: toggle("issues"),
    openAgents,
    closeAgents: close("agents"),
    toggleAgents: toggle("agents"),
    openAgentPerformance: () => {
      // The tab first, so the surface mounts on Performance rather than
      // flashing whichever tab Agents showed last.
      useAgentsViewStore.getState().setActiveTab("performance");
      openAgents();
    },
    openUsage: (scope) => {
      set((state) => {
        const previous = state.activeAppSurface;
        if (previous.kind === "usage" && previous.providerId === scope?.providerId && previous.accountProfileId === scope?.accountProfileId) return state;
        return { activeAppSurface: scope ? { kind: "usage", ...scope } : USAGE_APP_SURFACE };
      });
    },
    closeUsage: close("usage"),
    exitToWorkspace,
  };
}

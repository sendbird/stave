import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import type { LensSessionPresentationRequestPayload } from "@/lib/lens/lens.types";
import {
  presentLensSessionInWorkspace,
  type LensSessionPresentationOptions,
} from "@/lib/lens/lens-session-presentation";
import {
  gitGraphTabId,
  resolveOpenableGitGraphWorkspaceId,
} from "@/store/app-store-editor-actions";
import { useAppStore } from "@/store/app.store";

/**
 * Imperative bridge into the mounted `WorkspacePaneHost`.
 *
 * Non-pane UI (right rail, sidebar, shortcuts, store side-effects) talks to
 * the Dockview instance through this controller instead of importing the
 * host component. Calls made while no host is mounted are queued (open) or
 * dropped (focus/close) — the host drains the queue on mount.
 */
export type PaneSplitDirection =
  "left" | "right" | "above" | "below" | "within";

export interface OpenSurfaceOptions {
  /** Activate (focus) the panel after opening. Defaults to true. */
  activate?: boolean;
  /**
   * Open relative to an existing panel or group; defaults to the active group.
   */
  position?: {
    referencePanelId?: string;
    referenceGroupId?: string;
    direction?: PaneSplitDirection;
  };
}

export interface PaneHostController {
  /** Returns false when the surface could not be opened (no store entry / no api). */
  openSurface: (
    surface: PaneSurfaceDescriptor,
    options?: OpenSurfaceOptions,
  ) => boolean;
  closeSurface: (surface: PaneSurfaceDescriptor) => void;
  focusSurface: (surface: PaneSurfaceDescriptor) => void;
  /** Split the active group, moving the selected panel when siblings remain. */
  splitActivePanel: (direction: "right" | "below") => void;
  /** Show/create or hide the dedicated bottom terminal group. */
  toggleTerminalGroup: () => void;
}

interface QueuedOpen {
  surface: PaneSurfaceDescriptor;
  options?: OpenSurfaceOptions;
}

let activeController: PaneHostController | null = null;
let queuedOpens: QueuedOpen[] = [];

export function registerPaneHostController(controller: PaneHostController) {
  activeController = controller;
  if (queuedOpens.length > 0) {
    const pending = queuedOpens;
    queuedOpens = [];
    for (const item of pending) {
      controller.openSurface(item.surface, item.options);
    }
  }
  return () => {
    if (activeController === controller) {
      activeController = null;
    }
  };
}

export function getPaneHostController(): PaneHostController | null {
  return activeController;
}

export const paneHost = {
  /**
   * Returns true only when the surface is actually on screen. A queued open
   * (no host mounted yet) reports false so callers can retry instead of
   * assuming success — see `presentLensSessionInWorkspace`.
   */
  openSurface(
    surface: PaneSurfaceDescriptor,
    options?: OpenSurfaceOptions,
  ): boolean {
    if (activeController) {
      return activeController.openSurface(surface, options);
    }
    queuedOpens.push({ surface, options });
    return false;
  },
  closeSurface(surface: PaneSurfaceDescriptor) {
    activeController?.closeSurface(surface);
  },
  focusSurface(surface: PaneSurfaceDescriptor) {
    activeController?.focusSurface(surface);
  },
  splitActivePanel(direction: "right" | "below") {
    activeController?.splitActivePanel(direction);
  },
  toggleTerminalGroup() {
    activeController?.toggleTerminalGroup();
  },
};

/** Open a newly created surface from a specific pane-group header. */
export function openPaneTabInGroup(args: {
  surface: PaneSurfaceDescriptor;
  groupId: string;
}): boolean {
  return paneHost.openSurface(args.surface, {
    position: {
      referenceGroupId: args.groupId,
      direction: "within",
    },
  });
}

/**
 * Let store-driven reconciliation handle opens that have no explicit
 * placement.
 */
export function shouldDeferSurfaceOpenToStore(
  surface: PaneSurfaceDescriptor,
  options?: OpenSurfaceOptions,
): boolean {
  return (
    options?.position === undefined &&
    (surface.kind === "task" || surface.kind === "compare-run")
  );
}

/** Focus the current/recent Lens pane, creating one when none exists. */
export function focusOrCreateLensSurface(): string | null {
  const store = useAppStore.getState();
  const lensSessionId =
    (store.activeSurface.kind === "lens"
      ? store.activeSurface.lensSessionId
      : null) ??
    store.lensTabs.at(-1)?.id ??
    store.createLensTab();
  if (!lensSessionId) {
    return null;
  }
  paneHost.openSurface({ kind: "lens", lensSessionId });
  return lensSessionId;
}

/**
 * Focus the per-workspace commit graph pane, creating its editor tab when none
 * exists yet. Mirrors `focusOrCreateLensSurface`: the store action alone only
 * updates `activeEditorTabId`, which does not reveal the Dockview panel when
 * another surface (task/terminal/lens) is currently active, so this always
 * follows up with an explicit `paneHost.openSurface` call.
 */
export function focusOrCreateGitGraphSurface(): void {
  const store = useAppStore.getState();
  const workspaceId = resolveOpenableGitGraphWorkspaceId({
    activeWorkspaceId: store.activeWorkspaceId,
    projectPath: store.projectPath,
    workspaces: store.workspaces,
    workspacePathById: store.workspacePathById,
  });
  if (!workspaceId) {
    return;
  }
  store.openGitGraph();
  paneHost.openSurface({
    kind: "editor",
    editorTabId: gitGraphTabId(workspaceId),
  });
}

export async function presentLensSession(
  payload: LensSessionPresentationRequestPayload,
  options?: LensSessionPresentationOptions,
): Promise<boolean> {
  return presentLensSessionInWorkspace(
    payload,
    {
      hasWorkspace: (workspaceId) =>
        useAppStore
          .getState()
          .workspaces.some((workspace) => workspace.id === workspaceId),
      getActiveWorkspaceId: () => useAppStore.getState().activeWorkspaceId,
      switchWorkspace: (workspaceId) =>
        useAppStore.getState().switchWorkspace({ workspaceId }),
      openLensTab: (lensSessionId, openOptions) =>
        useAppStore.getState().openLensTab({
          lensSessionId,
          activate: openOptions.activate,
        }),
      openLensSurface: (lensSessionId, openOptions) =>
        paneHost.openSurface(
          { kind: "lens", lensSessionId },
          {
            activate: openOptions.activate,
            ...(openOptions.splitRight
              ? { position: { direction: "right" as const } }
              : {}),
          },
        ),
    },
    options,
  );
}

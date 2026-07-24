import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import type { LensSessionPresentationRequestPayload } from "@/lib/lens/lens.types";
import { presentLensSessionInWorkspace } from "@/lib/lens/lens-session-presentation";
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
  /** Open relative to an existing panel; defaults to the active group. */
  position?: {
    referencePanelId?: string;
    direction?: PaneSplitDirection;
  };
}

export interface PaneHostController {
  openSurface: (
    surface: PaneSurfaceDescriptor,
    options?: OpenSurfaceOptions,
  ) => void;
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
  openSurface(surface: PaneSurfaceDescriptor, options?: OpenSurfaceOptions) {
    if (activeController) {
      activeController.openSurface(surface, options);
      return;
    }
    queuedOpens.push({ surface, options });
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

export async function presentLensSession(
  payload: LensSessionPresentationRequestPayload,
): Promise<boolean> {
  return presentLensSessionInWorkspace(payload, {
    hasWorkspace: (workspaceId) =>
      useAppStore
        .getState()
        .workspaces.some((workspace) => workspace.id === workspaceId),
    getActiveWorkspaceId: () => useAppStore.getState().activeWorkspaceId,
    switchWorkspace: (workspaceId) =>
      useAppStore.getState().switchWorkspace({ workspaceId }),
    openLensTab: (lensSessionId) =>
      useAppStore.getState().openLensTab({ lensSessionId }),
    focusLensSurface: (lensSessionId) => {
      paneHost.openSurface({ kind: "lens", lensSessionId });
    },
  });
}

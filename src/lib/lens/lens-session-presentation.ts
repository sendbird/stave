import type { LensSessionPresentationRequestPayload } from "@/lib/lens/lens.types";

export type LensSessionPresentationPlacement =
  | "focus"
  | "split-right"
  | "background-tab";

export interface LensSessionPresentationOptions {
  placement?: LensSessionPresentationPlacement;
  allowWorkspaceSwitch?: boolean;
}

export interface LensSessionPresentationHost {
  hasWorkspace: (workspaceId: string) => boolean;
  getActiveWorkspaceId: () => string | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  openLensTab: (
    lensSessionId: string,
    options: { activate: boolean },
  ) => string | null;
  /** Returns false when the pane could not actually be opened. */
  openLensSurface: (
    lensSessionId: string,
    options: {
      activate: boolean;
      splitRight: boolean;
    },
  ) => boolean;
}

/**
 * Promote an existing hidden Lens session into the renderer without changing
 * its identity, URL, cookies, or navigation history.
 */
export async function presentLensSessionInWorkspace(
  payload: LensSessionPresentationRequestPayload,
  host: LensSessionPresentationHost,
  options: LensSessionPresentationOptions = {},
): Promise<boolean> {
  if (!host.hasWorkspace(payload.workspaceId)) {
    return false;
  }

  if (host.getActiveWorkspaceId() !== payload.workspaceId) {
    if (options.allowWorkspaceSwitch === false) {
      return false;
    }
    await host.switchWorkspace(payload.workspaceId);
  }
  if (host.getActiveWorkspaceId() !== payload.workspaceId) {
    return false;
  }

  const placement = options.placement ?? "focus";
  const activate = placement === "focus";
  const lensSessionId = host.openLensTab(payload.lensSessionId, {
    activate,
  });
  if (!lensSessionId) {
    return false;
  }
  // Report the pane host's real outcome. Returning true unconditionally made
  // callers drop their pending request even when the open was queued or
  // dropped, so the session was never revealed and never retried.
  return host.openLensSurface(lensSessionId, {
    activate,
    splitRight: placement === "split-right",
  });
}

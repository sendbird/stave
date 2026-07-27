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
  openLensSurface: (
    lensSessionId: string,
    options: {
      activate: boolean;
      splitRight: boolean;
    },
  ) => void;
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
  host.openLensSurface(lensSessionId, {
    activate,
    splitRight: placement === "split-right",
  });
  return true;
}

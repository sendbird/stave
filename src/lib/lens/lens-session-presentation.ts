import type { LensSessionPresentationRequestPayload } from "@/lib/lens/lens.types";

export interface LensSessionPresentationHost {
  hasWorkspace: (workspaceId: string) => boolean;
  getActiveWorkspaceId: () => string | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  openLensTab: (lensSessionId: string) => string | null;
  focusLensSurface: (lensSessionId: string) => void;
}

/**
 * Promote an existing hidden Lens session into the renderer without changing
 * its identity, URL, cookies, or navigation history.
 */
export async function presentLensSessionInWorkspace(
  payload: LensSessionPresentationRequestPayload,
  host: LensSessionPresentationHost,
): Promise<boolean> {
  if (!host.hasWorkspace(payload.workspaceId)) {
    return false;
  }

  if (host.getActiveWorkspaceId() !== payload.workspaceId) {
    await host.switchWorkspace(payload.workspaceId);
  }
  if (host.getActiveWorkspaceId() !== payload.workspaceId) {
    return false;
  }

  const lensSessionId = host.openLensTab(payload.lensSessionId);
  if (!lensSessionId) {
    return false;
  }
  host.focusLensSurface(lensSessionId);
  return true;
}

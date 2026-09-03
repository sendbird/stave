import { useEffect, useState } from "react";
import { resolveLensPanelOwnerWorkspaceId } from "@/lib/lens/lens-panel-owner";

/**
 * Pin a Lens panel to the workspace it was mounted for.
 *
 * `activeWorkspaceId` changes on every workspace switch while the outgoing
 * panels are still mounted; the value returned here does not. See
 * `resolveLensPanelOwnerWorkspaceId` for the one case in which it moves.
 */
export function useLensPanelOwnerWorkspaceId(activeWorkspaceId: string): string {
  const [ownerWorkspaceId, setOwnerWorkspaceId] = useState(activeWorkspaceId);
  const resolved = resolveLensPanelOwnerWorkspaceId({
    ownerWorkspaceId,
    activeWorkspaceId,
  });
  useEffect(() => {
    if (resolved !== ownerWorkspaceId) {
      setOwnerWorkspaceId(resolved);
    }
  }, [ownerWorkspaceId, resolved]);
  return resolved;
}

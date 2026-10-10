import { webContents } from "electron";
import { getSessionIdentityForWebContentsId } from "./browser-manager";
import { assertCdpAllowed } from "./browser-security";

export async function assertCdpAllowedForWebContentsId(
  webContentsId: number,
  reason: string,
): Promise<void> {
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error(`WebContents ${webContentsId} not found or destroyed`);
  }

  const identity = getSessionIdentityForWebContentsId(webContentsId);
  if (!identity) {
    throw new Error("No Lens browser session found for CDP access.");
  }
  const requestedUrl = wc.getURL();

  await assertCdpAllowed({
    workspaceId: identity.workspaceId,
    lensSessionId: identity.lensSessionId,
    url: requestedUrl,
    reason,
  });

  const currentWebContents = webContents.fromId(webContentsId);
  const currentIdentity = getSessionIdentityForWebContentsId(webContentsId);
  if (
    currentWebContents !== wc ||
    !currentWebContents ||
    currentWebContents.isDestroyed() ||
    !currentIdentity ||
    currentIdentity.workspaceId !== identity.workspaceId ||
    currentIdentity.lensSessionId !== identity.lensSessionId
  ) {
    throw new Error(
      "Lens browser session closed while CDP access was pending.",
    );
  }
  if (currentWebContents.getURL() !== requestedUrl) {
    throw new Error(
      "Lens page changed while CDP access was pending; retry the action.",
    );
  }
}

export interface BrowserSessionIdentity {
  closing: boolean;
  webContentsId: number;
}

/**
 * Reject callbacks from a closing or replaced WebContents. Lens session keys
 * can be reused immediately, so key lookup alone is not a stable identity.
 */
export function isLiveBrowserSessionForWebContents<
  T extends BrowserSessionIdentity,
>(session: T | undefined, webContentsId: number): session is T {
  return Boolean(
    session && !session.closing && session.webContentsId === webContentsId,
  );
}

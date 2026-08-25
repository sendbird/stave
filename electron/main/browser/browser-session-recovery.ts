import { assertNavigationAllowed } from "./browser-security";

/**
 * Where each Lens session's page was, kept so a session that has to be rebuilt
 * can come back to it instead of to `about:blank`.
 *
 * This exists because of the rendering-model cutover. A Lens guest is now a
 * renderer-owned `<webview>`, so the page dies with the renderer: a reload, a
 * renderer crash, or a dev-time hot restart takes every guest with it. Main
 * survives all three and recreates the session on the next open — and the
 * navigation state it recreates lives on the `BrowserSessionState` object that
 * just died, so without a record kept *outside* that object the user comes back
 * to a blank page. Under `WebContentsView` the page outlived the renderer and
 * the question never arose.
 *
 * Two limits are deliberate, not omissions:
 *
 * - **One app run.** This is in-memory. Coming back to a page after quitting
 *   and relaunching is session restore, a different feature with a different
 *   contract (persisted per tab, user-visible, clearable).
 * - **A deliberate close forgets.** `destroyBrowserSession` drops the entry, so
 *   a closed tab can never resurrect its page. That matters because session ids
 *   are reused: the first Lens tab in every workspace is `default`, so without
 *   this a fresh tab would open on the page the last one happened to be on.
 */

/**
 * How many sessions are remembered at once.
 *
 * Entries are only dropped by eviction when a session dies without ever being
 * closed — the leak this bounds is unbounded workspace churn, not normal use,
 * where a close removes the entry. Refreshed on write, so the cap evicts the
 * least recently navigated session rather than the oldest tab.
 */
const MAX_REMEMBERED_SESSIONS = 64;

/** sessionKey → last URL the session's page was on. */
const rememberedUrls = new Map<string, string>();

/**
 * Keyed exactly like `browser-manager`'s session registry, and with the same
 * expectation: callers pass an already-normalized `lensSessionId`. Every call
 * site resolves one first (through `resolveBrowserSessionReservation` or off a
 * live `BrowserSessionState`), so normalizing again here would only hide a
 * caller that had not.
 */
function recoveryKey(workspaceId: string, lensSessionId: string): string {
  return `${workspaceId}\u0000${lensSessionId}`;
}

/**
 * Whether a URL is worth coming back to.
 *
 * Only real web pages: `about:blank` is the state being recovered *from*, and
 * every other scheme a guest can end up displaying (`data:`, `file:`,
 * `chrome-error:`) is either refused by `normalizeLensUrl` on the way in or is
 * an artifact of a failed load rather than a place the user was.
 */
export function isRestorableLensUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Record where a session's page is now. Non-page URLs are ignored, not stored. */
export function rememberLensSessionUrl(
  workspaceId: string,
  lensSessionId: string,
  url: unknown,
): void {
  if (!isRestorableLensUrl(url)) {
    return;
  }

  const key = recoveryKey(workspaceId, lensSessionId);
  // Delete before set so the insertion order Map iteration follows is
  // recency, which is what the eviction below wants.
  rememberedUrls.delete(key);
  rememberedUrls.set(key, url);

  while (rememberedUrls.size > MAX_REMEMBERED_SESSIONS) {
    const oldest = rememberedUrls.keys().next();
    if (oldest.done) {
      return;
    }
    rememberedUrls.delete(oldest.value);
  }
}

/** The page a rebuilt session should return to, if there is one. */
export function getLensSessionRecoveryUrl(
  workspaceId: string,
  lensSessionId: string,
): string | null {
  return rememberedUrls.get(recoveryKey(workspaceId, lensSessionId)) ?? null;
}

/**
 * Drop a session's record.
 *
 * Called when a session is deliberately closed. Not called when its page merely
 * died — that is the case the record is for.
 */
export function forgetLensSessionUrl(
  workspaceId: string,
  lensSessionId: string,
): void {
  rememberedUrls.delete(recoveryKey(workspaceId, lensSessionId));
}

/** Drop every record. Used by tests and by whole-registry teardown. */
export function forgetAllLensSessionUrls(): void {
  rememberedUrls.clear();
}

/**
 * The slice of `WebContents` a restore needs. Structural so the decision can be
 * tested without an Electron guest.
 */
export type LensRestoreTarget = {
  isDestroyed(): boolean;
  loadURL(url: string): Promise<unknown>;
};

/**
 * Send a freshly rebuilt guest back to the page its session was on.
 *
 * Returns the URL it started loading, or `null` if there was nothing to restore
 * — which the caller can ignore either way: a restore is a navigation like any
 * other, and its progress and failures already reach the renderer through the
 * session's navigation events.
 *
 * Not awaited on purpose. Opening a session must not block on a page load: the
 * panel attaches its guest as soon as the open resolves, and a slow or hanging
 * page would otherwise hold an empty panel open for as long as it took.
 *
 * Re-checked against site access rather than trusted because it was allowed
 * once. The policy can change between the two moments — a host added to the
 * blocklist in Settings, or an allowlist introduced — and a remembered URL that
 * replayed past it would be a way around the setting. A refusal is silent: the
 * session still opens, on a blank page, which is what it would have done before
 * this existed.
 */
export function restoreLensSessionUrl(args: {
  workspaceId: string;
  lensSessionId: string;
  webContents: LensRestoreTarget;
}): string | null {
  const url = getLensSessionRecoveryUrl(args.workspaceId, args.lensSessionId);
  if (!url || args.webContents.isDestroyed()) {
    return null;
  }

  try {
    assertNavigationAllowed(url);
  } catch {
    return null;
  }

  void Promise.resolve(args.webContents.loadURL(url)).catch(() => undefined);
  return url;
}

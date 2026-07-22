// ---------------------------------------------------------------------------
// Browser session manager – singleton per Electron main process
// Manages WebContentsViews keyed by (workspaceId, lensSessionId) so a
// workspace can host multiple lens tabs. Callers that omit lensSessionId
// transparently target the "default" session, preserving the historical
// one-view-per-workspace behavior. The views are native Electron objects
// positioned over the renderer via IPC-driven bounds synchronization
// (ResizeObserver → setBounds).
// ---------------------------------------------------------------------------

import {
  BrowserWindow,
  WebContentsView,
  session as electronSession,
} from "electron";
import { attachPartitionDownloadHandler } from "./browser-downloads";
import { isDevToolsShortcut } from "../keyboard-shortcuts";
import { getMainWindow, toggleMainWindowDevTools } from "../window";
import { openExternalWithFallback } from "../utils/external-url";
import { assertNavigationAllowed } from "./browser-security";
import { fillLensCredentialForWebContents } from "./lens-credential-service";
import {
  resolveLensSessionProfile,
  type ResolvedLensSessionProfile,
} from "./browser-session-profile";
import {
  DEFAULT_LENS_SESSION_ID,
  type BrowserConsoleEventPayload,
  type BrowserConsoleEntry,
  type LensDownloadEntry,
  type LensAnnotation,
  type BrowserNavigationState,
  type BrowserNetworkEntry,
  type BrowserNetworkEventPayload,
  type LensBounds,
  type LensSessionDescriptor,
  type LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";

export { DEFAULT_LENS_SESSION_ID };

function isVisualCommentShortcutCandidate(input: Electron.Input) {
  if (input.type !== "keyDown" || input.isComposing) {
    return false;
  }
  const hasMod = input.control || input.meta;
  if (!hasMod) {
    return false;
  }
  return input.key === "." || input.code === "Period";
}

// ---------------------------------------------------------------------------
// Ring buffer – bounded array with FIFO eviction
// ---------------------------------------------------------------------------

export class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}

  push(item: T) {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    this.items.push(item);
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface BrowserSessionState {
  workspaceId: string;
  /** Session id within the workspace ("default" for legacy callers). */
  lensSessionId: string;
  sessionProfile: ResolvedLensSessionProfile;
  view: WebContentsView;
  /** webContents id of the view, captured at creation (survives destroy). */
  webContentsId: number;
  authPopups: Set<BrowserWindow>;
  debuggerAttached: boolean;
  consoleLog: RingBuffer<BrowserConsoleEntry>;
  networkLog: RingBuffer<BrowserNetworkEntry>;
  downloadLog: RingBuffer<LensDownloadEntry>;
  annotationOverlayActive: boolean;
  annotationNonce: string | null;
  annotationExtractDebugSource: boolean;
  annotations: LensAnnotation[];
  /** True when the box-model inspect overlay is active for this session. */
  boxInspectActive: boolean;
  /** True when the session was opened only for MCP/headless inspection. */
  managedByMcp: boolean;
  navigationState: BrowserNavigationState;
  /** Last CSS-pixel bounds sent from renderer (for zoom-change re-apply). */
  lastCssBounds: LensBounds | null;
  /** Last device-pixel bounds applied to the native view. */
  lastAppliedBounds: LensBounds | null;
}

const CONSOLE_BUFFER_SIZE = 200;
const NETWORK_BUFFER_SIZE = 200;
const DOWNLOAD_BUFFER_SIZE = 200;

/** Registry keyed by sessionKey(workspaceId, lensSessionId). */
const sessions = new Map<string, BrowserSessionState>();

/**
 * webContents id → owning session, covering both the lens view itself and
 * any auth popups it spawned. Used to route shared-partition traffic
 * (network log, downloads) to the correct session.
 */
const webContentsSessionIndex = new Map<number, BrowserSessionState>();

/** Partition name → will-download listener cleanup (attached once per partition). */
const partitionDownloadCleanups = new Map<string, () => void>();

function sessionKey(workspaceId: string, lensSessionId: string): string {
  return `${workspaceId}\u0000${lensSessionId}`;
}

function normalizeLensSessionId(lensSessionId?: string | null): string {
  const trimmed = lensSessionId?.trim();
  return trimmed ? trimmed : DEFAULT_LENS_SESSION_ID;
}

function getSessionForWebContentsId(
  webContentsId: number,
): BrowserSessionState | undefined {
  return webContentsSessionIndex.get(webContentsId);
}

function findFirstSessionForPartition(
  partition: string,
): BrowserSessionState | undefined {
  for (const session of sessions.values()) {
    if (session.sessionProfile.partition === partition) {
      return session;
    }
  }
  return undefined;
}

/**
 * Resolve the session that should receive partition-scoped traffic for the
 * given webContents id, falling back to the first live session on the
 * partition (matches the legacy single-session behavior for traffic that
 * carries no webContents attribution, e.g. service workers).
 */
function resolvePartitionTrafficTarget(
  partition: string,
  webContentsId: number | undefined,
): BrowserSessionState | undefined {
  if (webContentsId !== undefined && webContentsId >= 0) {
    const owner = getSessionForWebContentsId(webContentsId);
    if (owner) {
      return owner;
    }
  }
  return findFirstSessionForPartition(partition);
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractMimeType(
  responseHeaders: Record<string, string | string[]> | undefined,
): string | undefined {
  if (!responseHeaders) {
    return undefined;
  }

  for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
    if (headerName.toLowerCase() !== "content-type") {
      continue;
    }
    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return rawValue?.split(";")[0]?.trim();
  }

  return undefined;
}

function extractResponseSize(
  responseHeaders: Record<string, string | string[]> | undefined,
): number | undefined {
  if (!responseHeaders) {
    return undefined;
  }

  for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
    if (headerName.toLowerCase() !== "content-length") {
      continue;
    }
    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  return undefined;
}

function openLensAuthPopup(args: {
  parent: BrowserWindow;
  session: Electron.Session;
  url: string;
  workspaceId: string;
  lensSessionId: string;
}): void {
  if (!isHttpOrHttpsUrl(args.url)) {
    void openExternalWithFallback({ url: args.url });
    return;
  }

  try {
    assertNavigationAllowed(args.url);
  } catch (err) {
    pushConsoleEntry(
      args.workspaceId,
      {
        level: "warn",
        text: `Lens popup blocked: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
        source: args.url,
      },
      args.lensSessionId,
    );
    return;
  }

  const popup = new BrowserWindow({
    parent: args.parent,
    modal: false,
    width: 520,
    height: 720,
    title: "Lens Sign-in",
    autoHideMenuBar: true,
    webPreferences: {
      session: args.session,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const session = sessions.get(sessionKey(args.workspaceId, args.lensSessionId));
  const popupWebContentsId = popup.webContents.id;
  if (session) {
    session.authPopups.add(popup);
    webContentsSessionIndex.set(popupWebContentsId, session);
  }
  popup.on("closed", () => {
    session?.authPopups.delete(popup);
    if (webContentsSessionIndex.get(popupWebContentsId) === session) {
      webContentsSessionIndex.delete(popupWebContentsId);
    }
  });

  popup.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isHttpOrHttpsUrl(targetUrl)) {
      event.preventDefault();
      void openExternalWithFallback({ url: targetUrl });
      return;
    }

    try {
      assertNavigationAllowed(targetUrl);
    } catch (err) {
      event.preventDefault();
      pushConsoleEntry(
        args.workspaceId,
        {
          level: "warn",
          text: `Lens popup navigation blocked: ${
            err instanceof Error ? err.message : String(err)
          }`,
          timestamp: new Date().toISOString(),
          source: targetUrl,
        },
        args.lensSessionId,
      );
    }
  });

  popup.webContents.on("did-stop-loading", () => {
    setTimeout(() => {
      if (popup.isDestroyed()) {
        return;
      }
      void fillLensCredentialForWebContents(popup.webContents, {
        autoFillOnly: true,
      }).catch((error) => {
        pushConsoleEntry(args.workspaceId, {
          level: "warn",
          text: `Saved Lens account fill failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          timestamp: new Date().toISOString(),
          source: popup.webContents.getURL(),
        });
      });
    }, 300);
  });

  popup.webContents.setWindowOpenHandler(({ url }) => {
    if (!isHttpOrHttpsUrl(url)) {
      void openExternalWithFallback({ url });
      return { action: "deny" };
    }

    try {
      assertNavigationAllowed(url);
    } catch (err) {
      pushConsoleEntry(
        args.workspaceId,
        {
          level: "warn",
          text: `Lens popup blocked: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toISOString(),
          source: url,
        },
        args.lensSessionId,
      );
      return { action: "deny" };
    }

    void popup.webContents.loadURL(url);
    return { action: "deny" };
  });

  void popup.webContents.loadURL(args.url).catch((err) => {
    pushConsoleEntry(
      args.workspaceId,
      {
        level: "error",
        text: `Lens popup failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
        source: args.url,
      },
      args.lensSessionId,
    );
    if (!popup.isDestroyed()) {
      popup.close();
    }
  });
}

// ---------------------------------------------------------------------------
// Partition-scoped handlers (shared by all sessions on one partition)
// ---------------------------------------------------------------------------

/**
 * (Re-)register the webRequest listeners for a partition. Electron keeps a
 * single webRequest listener per session, so registration is idempotent —
 * the listener routes each event to the owning lens session dynamically.
 */
function registerPartitionNetworkDispatch(
  ses: Electron.Session,
  partition: string,
): void {
  ses.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    const target = resolvePartitionTrafficTarget(
      partition,
      details.webContentsId,
    );
    if (!target) {
      return;
    }
    pushNetworkEntry(
      target.workspaceId,
      {
        requestId: String(details.id),
        url: details.url,
        method: details.method,
        status: details.statusCode,
        mimeType: extractMimeType(details.responseHeaders),
        responseSize: extractResponseSize(details.responseHeaders),
        timestamp: new Date().toISOString(),
      },
      target.lensSessionId,
    );
  });

  ses.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
    const target = resolvePartitionTrafficTarget(
      partition,
      details.webContentsId,
    );
    if (!target) {
      return;
    }
    pushNetworkEntry(
      target.workspaceId,
      {
        requestId: String(details.id),
        url: details.url,
        method: details.method,
        status: 0,
        timestamp: new Date().toISOString(),
      },
      target.lensSessionId,
    );
  });
}

function ensurePartitionDownloadDispatch(
  ses: Electron.Session,
  partition: string,
): void {
  if (partitionDownloadCleanups.has(partition)) {
    return;
  }
  const cleanup = attachPartitionDownloadHandler(ses, (webContentsId) => {
    const target = resolvePartitionTrafficTarget(partition, webContentsId);
    if (!target) {
      return undefined;
    }
    return {
      workspaceId: target.workspaceId,
      lensSessionId: target.lensSessionId,
      onEntry: (entry) => {
        target.downloadLog.push(entry);
      },
    };
  });
  partitionDownloadCleanups.set(partition, cleanup);
}

function releasePartitionHandlersIfUnused(partition: string): void {
  if (findFirstSessionForPartition(partition)) {
    return;
  }
  const cleanup = partitionDownloadCleanups.get(partition);
  if (cleanup) {
    try {
      cleanup();
    } catch {
      // Session object may already be gone.
    }
    partitionDownloadCleanups.delete(partition);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createBrowserSession(
  workspaceId: string,
  options?: Omit<LensSessionProfileArgs, "workspaceId"> & {
    lensSessionId?: string;
  },
): BrowserSessionState {
  const lensSessionId = normalizeLensSessionId(options?.lensSessionId);

  // Clean up any existing session with the same identity
  destroyBrowserSession(workspaceId, lensSessionId);

  const win = getMainWindow();
  if (!win) {
    throw new Error("No main window available to attach WebContentsView");
  }

  const sessionProfile = resolveLensSessionProfile({
    workspaceId,
    sessionScope: options?.sessionScope,
    projectKey: options?.projectKey,
  });
  const ses = electronSession.fromPartition(sessionProfile.partition);

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Start hidden (0-size) until the renderer sends bounds
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  // Keep app DevTools shortcuts working while the native browser view holds focus.
  view.webContents.on("before-input-event", (event, input) => {
    if (isVisualCommentShortcutCandidate(input)) {
      const renderer = getMainWindow()?.webContents;
      if (renderer && !renderer.isDestroyed()) {
        event.preventDefault();
        renderer.send("lens:visual-comment-shortcut", {
          workspaceId,
          lensSessionId,
          key: input.key,
          code: input.code,
          shiftKey: input.shift,
          altKey: input.alt,
          ctrlKey: input.control,
          metaKey: input.meta,
          isComposing: input.isComposing,
        });
      }
      return;
    }
    if (!isDevToolsShortcut(input)) {
      return;
    }
    event.preventDefault();
    toggleMainWindowDevTools();
  });

  // Add to the main window's content view
  win.contentView.addChildView(view);

  // Mute audio from browsed pages
  view.webContents.setAudioMuted(true);

  // Throttle background rendering when the view is not visible to reduce CPU
  // usage when the Lens panel is closed or another panel is active.
  view.webContents.setBackgroundThrottling(true);

  // Deny all permission requests from the browsed page
  ses.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // Partition-level dispatchers route traffic back to the owning session.
  registerPartitionNetworkDispatch(ses, sessionProfile.partition);
  ensurePartitionDownloadDispatch(ses, sessionProfile.partition);

  // Open external links in system browser instead of navigating
  view.webContents.setWindowOpenHandler(({ url }) => {
    openLensAuthPopup({
      parent: win,
      session: ses,
      url,
      workspaceId,
      lensSessionId,
    });
    return { action: "deny" as const };
  });

  const session: BrowserSessionState = {
    workspaceId,
    lensSessionId,
    sessionProfile,
    view,
    webContentsId: view.webContents.id,
    authPopups: new Set(),
    debuggerAttached: false,
    consoleLog: new RingBuffer<BrowserConsoleEntry>(CONSOLE_BUFFER_SIZE),
    networkLog: new RingBuffer<BrowserNetworkEntry>(NETWORK_BUFFER_SIZE),
    downloadLog: new RingBuffer<LensDownloadEntry>(DOWNLOAD_BUFFER_SIZE),
    annotationOverlayActive: false,
    annotationNonce: null,
    annotationExtractDebugSource: false,
    annotations: [],
    boxInspectActive: false,
    managedByMcp: false,
    navigationState: {
      url: "about:blank",
      title: "",
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
    },
    lastCssBounds: null,
    lastAppliedBounds: null,
  };

  sessions.set(sessionKey(workspaceId, lensSessionId), session);
  webContentsSessionIndex.set(session.webContentsId, session);
  return session;
}

export async function clearBrowserSessionData(
  args: LensSessionProfileArgs,
): Promise<ResolvedLensSessionProfile> {
  const sessionProfile = resolveLensSessionProfile(args);
  const matchingSessions = [...sessions.values()].filter(
    (session) => session.sessionProfile.partition === sessionProfile.partition,
  );

  const ses = electronSession.fromPartition(sessionProfile.partition);
  await ses.clearStorageData();
  await ses.clearCache();

  for (const session of matchingSessions) {
    session.consoleLog.clear();
    session.networkLog.clear();
    session.downloadLog.clear();
    const wc = session.view.webContents;
    if (!wc.isDestroyed() && wc.getURL() !== "about:blank") {
      wc.reloadIgnoringCache();
    }
  }

  return sessionProfile;
}

export function browserSessionUsesProfile(
  workspaceId: string,
  options?: Omit<LensSessionProfileArgs, "workspaceId">,
  lensSessionId?: string,
): boolean {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    return false;
  }

  const nextProfile = resolveLensSessionProfile({
    workspaceId,
    sessionScope: options?.sessionScope,
    projectKey: options?.projectKey,
  });
  return session.sessionProfile.partition === nextProfile.partition;
}

export function getBrowserSession(
  workspaceId: string,
  lensSessionId?: string,
): BrowserSessionState | undefined {
  return sessions.get(
    sessionKey(workspaceId, normalizeLensSessionId(lensSessionId)),
  );
}

/** All live sessions belonging to one workspace. */
export function getWorkspaceBrowserSessions(
  workspaceId: string,
): BrowserSessionState[] {
  return [...sessions.values()].filter(
    (session) => session.workspaceId === workspaceId,
  );
}

/**
 * Return a summary of active sessions for discovery. Pass a workspaceId to
 * restrict the listing to that workspace's sessions.
 */
export function listBrowserSessions(
  workspaceId?: string,
): LensSessionDescriptor[] {
  return [...sessions.values()]
    .filter((s) => workspaceId === undefined || s.workspaceId === workspaceId)
    .map((s) => ({
      workspaceId: s.workspaceId,
      lensSessionId: s.lensSessionId,
      url: s.navigationState.url,
      title: s.navigationState.title,
      isLoading: s.navigationState.isLoading,
      managedByMcp: s.managedByMcp,
      sessionScope: s.sessionProfile.scope,
    }));
}

export function getWebContentsForSession(
  workspaceId: string,
  lensSessionId?: string,
): Electron.WebContents | undefined {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return undefined;
  try {
    const wc = session.view.webContents;
    return wc && !wc.isDestroyed() ? wc : undefined;
  } catch {
    return undefined;
  }
}

/** Get the webContentsId for CDP operations (backwards compat with browser-cdp). */
export function getWebContentsIdForSession(
  workspaceId: string,
  lensSessionId?: string,
): number | undefined {
  return getWebContentsForSession(workspaceId, lensSessionId)?.id;
}

export function getSessionIdentityForWebContentsId(
  webContentsId: number,
): { workspaceId: string; lensSessionId: string } | undefined {
  for (const session of sessions.values()) {
    if (session.webContentsId === webContentsId) {
      return {
        workspaceId: session.workspaceId,
        lensSessionId: session.lensSessionId,
      };
    }
  }
  return undefined;
}

export function destroyBrowserSession(
  workspaceId: string,
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return;

  // Detach debugger if still attached
  if (session.debuggerAttached) {
    try {
      const wc = session.view.webContents;
      if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
        wc.debugger.detach();
      }
    } catch {
      // webContents may already be destroyed
    }
  }

  for (const popup of [...session.authPopups]) {
    try {
      if (!popup.isDestroyed()) {
        webContentsSessionIndex.delete(popup.webContents.id);
        popup.close();
      }
    } catch {
      // Popup may already be closing.
    }
  }
  session.authPopups.clear();

  // Remove view from window
  try {
    const win = getMainWindow();
    if (win) {
      win.contentView.removeChildView(session.view);
    }
  } catch {
    // Window may already be destroyed
  }

  // Close the webContents
  try {
    const wc = session.view.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.close();
    }
  } catch {
    // Already destroyed
  }

  session.consoleLog.clear();
  session.networkLog.clear();
  session.downloadLog.clear();
  if (webContentsSessionIndex.get(session.webContentsId) === session) {
    webContentsSessionIndex.delete(session.webContentsId);
  }
  sessions.delete(sessionKey(session.workspaceId, session.lensSessionId));
  releasePartitionHandlersIfUnused(session.sessionProfile.partition);
}

/** Destroy every lens session belonging to a workspace (dispose path). */
export function destroyWorkspaceBrowserSessions(workspaceId: string): void {
  for (const session of getWorkspaceBrowserSessions(workspaceId)) {
    destroyBrowserSession(session.workspaceId, session.lensSessionId);
  }
}

export function destroyAllBrowserSessions(): void {
  for (const session of [...sessions.values()]) {
    destroyBrowserSession(session.workspaceId, session.lensSessionId);
  }
}

// ---------------------------------------------------------------------------
// Bounds & visibility
// ---------------------------------------------------------------------------

export function setViewBounds(
  workspaceId: string,
  bounds: LensBounds,
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return;
  if (
    session.lastAppliedBounds &&
    session.lastAppliedBounds.x === bounds.x &&
    session.lastAppliedBounds.y === bounds.y &&
    session.lastAppliedBounds.width === bounds.width &&
    session.lastAppliedBounds.height === bounds.height
  ) {
    return;
  }
  try {
    session.view.setBounds(bounds);
    session.lastAppliedBounds = bounds;
  } catch {
    // View may be destroyed
  }
}

export function setViewVisible(
  workspaceId: string,
  visible: boolean,
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return;
  try {
    session.view.setVisible(visible);
  } catch {
    // View may be destroyed
  }
}

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------

export function updateNavigationState(
  workspaceId: string,
  patch: Partial<BrowserNavigationState>,
  lensSessionId?: string,
): BrowserNavigationState | undefined {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return undefined;
  Object.assign(session.navigationState, patch);
  return { ...session.navigationState };
}

export function pushConsoleEntry(
  workspaceId: string,
  entry: BrowserConsoleEntry,
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    return;
  }

  session.consoleLog.push(entry);

  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }

  renderer.send("lens:console-entry", {
    workspaceId,
    lensSessionId: session.lensSessionId,
    entry,
  } satisfies BrowserConsoleEventPayload);
}

export function pushNetworkEntry(
  workspaceId: string,
  entry: BrowserNetworkEntry,
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    return;
  }

  session.networkLog.push(entry);

  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }

  renderer.send("lens:network-entry", {
    workspaceId,
    lensSessionId: session.lensSessionId,
    entry,
  } satisfies BrowserNetworkEventPayload);
}

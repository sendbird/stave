// ---------------------------------------------------------------------------
// Browser session manager – singleton per Electron main process
// Manages one WebContentsView per workspace, keyed by workspaceId.
// The view is a native Electron object positioned over the renderer via
// IPC-driven bounds synchronization (ResizeObserver → setBounds).
// ---------------------------------------------------------------------------

import {
  BrowserWindow,
  WebContentsView,
  session as electronSession,
} from "electron";
import { attachDownloadHandler } from "./browser-downloads";
import { isDevToolsShortcut } from "../keyboard-shortcuts";
import { getMainWindow, toggleMainWindowDevTools } from "../window";
import { openExternalWithFallback } from "../utils/external-url";
import { assertNavigationAllowed } from "./browser-security";
import {
  resolveLensSessionProfile,
  type ResolvedLensSessionProfile,
} from "./browser-session-profile";
import type {
  BrowserConsoleEventPayload,
  BrowserConsoleEntry,
  LensDownloadEntry,
  LensAnnotation,
  BrowserNavigationState,
  BrowserNetworkEntry,
  BrowserNetworkEventPayload,
  LensBounds,
  LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";

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
  sessionProfile: ResolvedLensSessionProfile;
  view: WebContentsView;
  authPopups: Set<BrowserWindow>;
  debuggerAttached: boolean;
  consoleLog: RingBuffer<BrowserConsoleEntry>;
  networkLog: RingBuffer<BrowserNetworkEntry>;
  downloadLog: RingBuffer<LensDownloadEntry>;
  downloadHandlerCleanup: (() => void) | null;
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

const sessions = new Map<string, BrowserSessionState>();

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
}): void {
  if (!isHttpOrHttpsUrl(args.url)) {
    void openExternalWithFallback({ url: args.url });
    return;
  }

  try {
    assertNavigationAllowed(args.url);
  } catch (err) {
    pushConsoleEntry(args.workspaceId, {
      level: "warn",
      text: `Lens popup blocked: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: new Date().toISOString(),
      source: args.url,
    });
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

  const session = sessions.get(args.workspaceId);
  session?.authPopups.add(popup);
  popup.on("closed", () => {
    session?.authPopups.delete(popup);
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
      pushConsoleEntry(args.workspaceId, {
        level: "warn",
        text: `Lens popup navigation blocked: ${
          err instanceof Error ? err.message : String(err)
        }`,
        timestamp: new Date().toISOString(),
        source: targetUrl,
      });
    }
  });

  popup.webContents.setWindowOpenHandler(({ url }) => {
    if (!isHttpOrHttpsUrl(url)) {
      void openExternalWithFallback({ url });
      return { action: "deny" };
    }

    try {
      assertNavigationAllowed(url);
    } catch (err) {
      pushConsoleEntry(args.workspaceId, {
        level: "warn",
        text: `Lens popup blocked: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
        source: url,
      });
      return { action: "deny" };
    }

    void popup.webContents.loadURL(url);
    return { action: "deny" };
  });

  void popup.webContents.loadURL(args.url).catch((err) => {
    pushConsoleEntry(args.workspaceId, {
      level: "error",
      text: `Lens popup failed: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: new Date().toISOString(),
      source: args.url,
    });
    if (!popup.isDestroyed()) {
      popup.close();
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createBrowserSession(
  workspaceId: string,
  options?: Omit<LensSessionProfileArgs, "workspaceId">,
): BrowserSessionState {
  // Clean up any existing session for this workspace
  destroyBrowserSession(workspaceId);

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

  ses.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    pushNetworkEntry(workspaceId, {
      requestId: String(details.id),
      url: details.url,
      method: details.method,
      status: details.statusCode,
      mimeType: extractMimeType(details.responseHeaders),
      responseSize: extractResponseSize(details.responseHeaders),
      timestamp: new Date().toISOString(),
    });
  });

  ses.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
    pushNetworkEntry(workspaceId, {
      requestId: String(details.id),
      url: details.url,
      method: details.method,
      status: 0,
      timestamp: new Date().toISOString(),
    });
  });

  // Open external links in system browser instead of navigating
  view.webContents.setWindowOpenHandler(({ url }) => {
    openLensAuthPopup({
      parent: win,
      session: ses,
      url,
      workspaceId,
    });
    return { action: "deny" as const };
  });

  const session: BrowserSessionState = {
    workspaceId,
    sessionProfile,
    view,
    authPopups: new Set(),
    debuggerAttached: false,
    consoleLog: new RingBuffer<BrowserConsoleEntry>(CONSOLE_BUFFER_SIZE),
    networkLog: new RingBuffer<BrowserNetworkEntry>(NETWORK_BUFFER_SIZE),
    downloadLog: new RingBuffer<LensDownloadEntry>(DOWNLOAD_BUFFER_SIZE),
    downloadHandlerCleanup: null,
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

  sessions.set(workspaceId, session);
  session.downloadHandlerCleanup = attachDownloadHandler(
    workspaceId,
    ses,
    (entry) => {
      session.downloadLog.push(entry);
    },
  );
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
): boolean {
  const session = sessions.get(workspaceId);
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
): BrowserSessionState | undefined {
  return sessions.get(workspaceId);
}

/** Return a summary of all active sessions for workspace discovery. */
export function listBrowserSessions(): Array<{
  workspaceId: string;
  url: string;
  title: string;
  isLoading: boolean;
  managedByMcp: boolean;
  sessionScope: LensSessionProfileArgs["sessionScope"];
}> {
  return [...sessions.values()].map((s) => ({
    workspaceId: s.workspaceId,
    url: s.navigationState.url,
    title: s.navigationState.title,
    isLoading: s.navigationState.isLoading,
    managedByMcp: s.managedByMcp,
    sessionScope: s.sessionProfile.scope,
  }));
}

export function getWebContentsForSession(
  workspaceId: string,
): Electron.WebContents | undefined {
  const session = sessions.get(workspaceId);
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
): number | undefined {
  return getWebContentsForSession(workspaceId)?.id;
}

export function getWorkspaceIdForWebContentsId(
  webContentsId: number,
): string | undefined {
  for (const session of sessions.values()) {
    if (session.view.webContents.id === webContentsId) {
      return session.workspaceId;
    }
  }
  return undefined;
}

export function destroyBrowserSession(workspaceId: string): void {
  const session = sessions.get(workspaceId);
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

  session.downloadHandlerCleanup?.();
  session.downloadHandlerCleanup = null;

  for (const popup of [...session.authPopups]) {
    try {
      if (!popup.isDestroyed()) {
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
  sessions.delete(workspaceId);
}

export function destroyAllBrowserSessions(): void {
  for (const workspaceId of [...sessions.keys()]) {
    destroyBrowserSession(workspaceId);
  }
}

// ---------------------------------------------------------------------------
// Bounds & visibility
// ---------------------------------------------------------------------------

export function setViewBounds(
  workspaceId: string,
  bounds: LensBounds,
): void {
  const session = sessions.get(workspaceId);
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
): void {
  const session = sessions.get(workspaceId);
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
): BrowserNavigationState | undefined {
  const session = sessions.get(workspaceId);
  if (!session) return undefined;
  Object.assign(session.navigationState, patch);
  return { ...session.navigationState };
}

export function pushConsoleEntry(
  workspaceId: string,
  entry: BrowserConsoleEntry,
): void {
  const session = sessions.get(workspaceId);
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
    entry,
  } satisfies BrowserConsoleEventPayload);
}

export function pushNetworkEntry(
  workspaceId: string,
  entry: BrowserNetworkEntry,
): void {
  const session = sessions.get(workspaceId);
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
    entry,
  } satisfies BrowserNetworkEventPayload);
}

// ---------------------------------------------------------------------------
// Browser session manager – singleton per Electron main process
// Manages one WebContentsView per workspace, keyed by workspaceId.
// The view is a native Electron object positioned over the renderer via
// IPC-driven bounds synchronization (ResizeObserver → setBounds).
// ---------------------------------------------------------------------------

import { WebContentsView, session as electronSession } from "electron";
import { isDevToolsShortcut } from "../keyboard-shortcuts";
import { getMainWindow, toggleMainWindowDevTools } from "../window";
import { openExternalWithFallback } from "../utils/external-url";
import type {
  BrowserConsoleEventPayload,
  BrowserConsoleEntry,
  BrowserNavigationState,
  BrowserNetworkEntry,
  LensBounds,
} from "../../../src/lib/lens/lens.types";

// ---------------------------------------------------------------------------
// Ring buffer – bounded array with FIFO eviction
// ---------------------------------------------------------------------------

class RingBuffer<T> {
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
  view: WebContentsView;
  debuggerAttached: boolean;
  consoleLog: RingBuffer<BrowserConsoleEntry>;
  networkLog: RingBuffer<BrowserNetworkEntry>;
  navigationState: BrowserNavigationState;
  /** Last CSS-pixel bounds sent from renderer (for zoom-change re-apply). */
  lastCssBounds: LensBounds | null;
  /** Last device-pixel bounds applied to the native view. */
  lastAppliedBounds: LensBounds | null;
}

const CONSOLE_BUFFER_SIZE = 200;
const NETWORK_BUFFER_SIZE = 200;

const sessions = new Map<string, BrowserSessionState>();

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createBrowserSession(
  workspaceId: string,
): BrowserSessionState {
  // Clean up any existing session for this workspace
  destroyBrowserSession(workspaceId);

  const win = getMainWindow();
  if (!win) {
    throw new Error("No main window available to attach WebContentsView");
  }

  const partition = `persist:lens-${workspaceId}`;
  const ses = electronSession.fromPartition(partition);

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
    void openExternalWithFallback({ url });
    return { action: "deny" as const };
  });

  const session: BrowserSessionState = {
    workspaceId,
    view,
    debuggerAttached: false,
    consoleLog: new RingBuffer<BrowserConsoleEntry>(CONSOLE_BUFFER_SIZE),
    networkLog: new RingBuffer<BrowserNetworkEntry>(NETWORK_BUFFER_SIZE),
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
  return session;
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
}> {
  return [...sessions.values()].map((s) => ({
    workspaceId: s.workspaceId,
    url: s.navigationState.url,
    title: s.navigationState.title,
    isLoading: s.navigationState.isLoading,
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
  sessions.get(workspaceId)?.networkLog.push(entry);
}

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
import { randomUUID } from "node:crypto";
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
import { selectPreferredLensSession } from "../../../src/lib/lens/lens-session-selection";
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
  type LensSessionClosedPayload,
  type LensSessionDescriptor,
  type LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";
import {
  sanitizeLensNetworkHeaders,
  sanitizeLensNetworkUrl,
} from "../../../src/lib/lens/lens-network";
import {
  LensConsoleRateLimiter,
  truncateLensConsoleEntry,
} from "../../../src/lib/lens/lens-console";
import {
  clearLensCdpDiagnostics,
  disposeLensCdpDiagnostics,
  getLensCdpDiagnosticsState,
} from "./browser-cdp-diagnostics";
import {
  closeRetainedBrowserView,
  retainBrowserViewUntilDestroyed,
} from "./browser-closing-view";
import { isLiveBrowserSessionForWebContents } from "./browser-session-identity";

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

  upsert(predicate: (item: T) => boolean, item: T) {
    const index = this.items.findIndex(predicate);
    if (index >= 0) {
      this.items[index] = item;
      return;
    }
    this.push(item);
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
  consoleLog: RingBuffer<BrowserConsoleEntry>;
  consoleRateLimiter: LensConsoleRateLimiter;
  networkLog: RingBuffer<BrowserNetworkEntry>;
  downloadLog: RingBuffer<LensDownloadEntry>;
  annotationOverlayActive: boolean;
  annotationNonce: string | null;
  annotationExtractDebugSource: boolean;
  /** Rotated for every top-level document navigation. */
  documentId: string;
  annotations: LensAnnotation[];
  /** True when the box-model inspect overlay is active for this session. */
  boxInspectActive: boolean;
  /** True when the session was opened only for MCP/headless inspection. */
  managedByMcp: boolean;
  /** Whether the native view is currently presented in a renderer Lens tab. */
  visible: boolean;
  /** Prevents new work from entering while native teardown is in progress. */
  closing: boolean;
  /** Stops guest events before closing the WebContents. */
  detachEventListeners: (() => void) | null;
  /** Monotonic activation order used to prefer the most recently shown tab. */
  lastVisibleAt: number;
  navigationState: BrowserNavigationState;
  /** Last CSS-pixel bounds sent from renderer (for zoom-change re-apply). */
  lastCssBounds: LensBounds | null;
  /** Last device-pixel bounds applied to the native view. */
  lastAppliedBounds: LensBounds | null;
}

const CONSOLE_BUFFER_SIZE = 200;
const NETWORK_BUFFER_SIZE = 200;
const DOWNLOAD_BUFFER_SIZE = 200;
const MAX_LENS_AUTH_POPUPS = 3;
let lensVisibilitySequence = 0;

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
const networkRequestMetadata = new Map<
  string,
  {
    startedAt: string;
    startedAtMs: number;
    requestHeaders?: ReturnType<typeof sanitizeLensNetworkHeaders>;
  }
>();
const MAX_NETWORK_REQUEST_METADATA = NETWORK_BUFFER_SIZE * 5;
const NETWORK_IPC_BATCH_INTERVAL_MS = 50;
const NETWORK_IPC_BATCH_SIZE = 64;
const networkIpcBatchBySessionKey = new Map<
  string,
  {
    workspaceId: string;
    lensSessionId: string;
    entries: Map<string, BrowserNetworkEntry>;
    latestEntry: BrowserNetworkEntry;
    timer: ReturnType<typeof setTimeout> | null;
  }
>();

function sessionKey(workspaceId: string, lensSessionId: string): string {
  return `${workspaceId}\u0000${lensSessionId}`;
}

function flushNetworkIpcBatch(key: string) {
  const batch = networkIpcBatchBySessionKey.get(key);
  if (!batch) {
    return;
  }
  if (batch.timer) {
    clearTimeout(batch.timer);
  }
  networkIpcBatchBySessionKey.delete(key);
  const entries = [...batch.entries.values()];
  const entry = batch.latestEntry;
  const renderer = getMainWindow()?.webContents;
  if (!entry || !renderer || renderer.isDestroyed()) {
    return;
  }
  renderer.send("lens:network-entry", {
    workspaceId: batch.workspaceId,
    lensSessionId: batch.lensSessionId,
    entries,
    entry,
  } satisfies BrowserNetworkEventPayload);
}

function clearNetworkIpcBatch(workspaceId: string, lensSessionId: string) {
  const key = sessionKey(workspaceId, lensSessionId);
  const batch = networkIpcBatchBySessionKey.get(key);
  if (batch?.timer) {
    clearTimeout(batch.timer);
  }
  networkIpcBatchBySessionKey.delete(key);
}

function queueNetworkIpcEntry(args: {
  workspaceId: string;
  lensSessionId: string;
  entry: BrowserNetworkEntry;
}) {
  const key = sessionKey(args.workspaceId, args.lensSessionId);
  let batch = networkIpcBatchBySessionKey.get(key);
  if (!batch) {
    batch = {
      workspaceId: args.workspaceId,
      lensSessionId: args.lensSessionId,
      entries: new Map(),
      latestEntry: args.entry,
      timer: null,
    };
    networkIpcBatchBySessionKey.set(key, batch);
  }
  batch.entries.set(args.entry.entryId, args.entry);
  batch.latestEntry = args.entry;
  if (batch.entries.size >= NETWORK_IPC_BATCH_SIZE) {
    flushNetworkIpcBatch(key);
    return;
  }
  if (!batch.timer) {
    batch.timer = setTimeout(
      () => flushNetworkIpcBatch(key),
      NETWORK_IPC_BATCH_INTERVAL_MS,
    );
    batch.timer.unref?.();
  }
}

function normalizeLensSessionId(lensSessionId?: string | null): string {
  const trimmed = lensSessionId?.trim();
  return trimmed ? trimmed : DEFAULT_LENS_SESSION_ID;
}

function isCurrentBrowserSession(session: BrowserSessionState): boolean {
  return (
    sessions.get(sessionKey(session.workspaceId, session.lensSessionId)) ===
      session &&
    isLiveBrowserSessionForWebContents(session, session.webContentsId)
  );
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
 * given webContents id. Only unattributed traffic may fall back to the first
 * live session on the partition (for example, service workers); attributed
 * traffic from a destroyed view must never be reassigned to a replacement.
 */
function resolvePartitionTrafficTarget(
  partition: string,
  webContentsId: number | undefined,
): BrowserSessionState | undefined {
  if (webContentsId !== undefined && webContentsId >= 0) {
    const owner = getSessionForWebContentsId(webContentsId);
    return owner && isCurrentBrowserSession(owner) ? owner : undefined;
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

function networkRequestKey(partition: string, requestId: number) {
  return `${partition}:${requestId}`;
}

function formatNetworkTimestamp(timestamp: number) {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function rememberNetworkRequest(
  key: string,
  metadata: {
    startedAt: string;
    startedAtMs: number;
    requestHeaders?: ReturnType<typeof sanitizeLensNetworkHeaders>;
  },
) {
  if (networkRequestMetadata.size >= MAX_NETWORK_REQUEST_METADATA) {
    const oldestKey = networkRequestMetadata.keys().next().value;
    if (oldestKey) {
      networkRequestMetadata.delete(oldestKey);
    }
  }
  networkRequestMetadata.set(key, metadata);
}

function takeNetworkRequest(partition: string, requestId: number) {
  const key = networkRequestKey(partition, requestId);
  const metadata = networkRequestMetadata.get(key);
  networkRequestMetadata.delete(key);
  return metadata;
}

function getNetworkDurationMs(
  startedAtMs: number | undefined,
  completedAtMs: number,
) {
  if (
    startedAtMs === undefined ||
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(completedAtMs)
  ) {
    return undefined;
  }
  return Math.max(0, Math.round((completedAtMs - startedAtMs) * 100) / 100);
}

function openLensAuthPopup(args: {
  parent: BrowserWindow;
  session: Electron.Session;
  url: string;
  workspaceId: string;
  lensSessionId: string;
  ownerWebContentsId: number;
}): void {
  const ownerSession = sessions.get(
    sessionKey(args.workspaceId, args.lensSessionId),
  );
  if (
    !ownerSession ||
    ownerSession.webContentsId !== args.ownerWebContentsId ||
    !isCurrentBrowserSession(ownerSession)
  ) {
    return;
  }
  if (ownerSession.authPopups.size >= MAX_LENS_AUTH_POPUPS) {
    pushGuestConsoleEntry(
      args.workspaceId,
      {
        level: "warn",
        text: "Lens blocked an excessive page popup request.",
        timestamp: new Date().toISOString(),
        source: args.url,
      },
      args.lensSessionId,
    );
    return;
  }

  if (!isHttpOrHttpsUrl(args.url)) {
    void openExternalWithFallback({ url: args.url });
    return;
  }

  try {
    assertNavigationAllowed(args.url);
  } catch (err) {
    pushGuestConsoleEntry(
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

  const session = ownerSession;
  if (!isCurrentBrowserSession(session)) {
    popup.destroy();
    return;
  }
  const popupWebContentsId = popup.webContents.id;
  session.authPopups.add(popup);
  webContentsSessionIndex.set(popupWebContentsId, session);
  popup.on("closed", () => {
    session.authPopups.delete(popup);
    if (webContentsSessionIndex.get(popupWebContentsId) === session) {
      webContentsSessionIndex.delete(popupWebContentsId);
    }
  });

  popup.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isCurrentBrowserSession(session)) {
      event.preventDefault();
      return;
    }
    if (!isHttpOrHttpsUrl(targetUrl)) {
      event.preventDefault();
      void openExternalWithFallback({ url: targetUrl });
      return;
    }

    try {
      assertNavigationAllowed(targetUrl);
    } catch (err) {
      event.preventDefault();
      pushGuestConsoleEntry(
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
      if (popup.isDestroyed() || !isCurrentBrowserSession(session)) {
        return;
      }
      void fillLensCredentialForWebContents(popup.webContents, {
        autoFillOnly: true,
      }).catch((error) => {
        if (popup.isDestroyed() || !isCurrentBrowserSession(session)) {
          return;
        }
        pushConsoleEntry(
          args.workspaceId,
          {
            level: "warn",
            text: `Saved Lens account fill failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            timestamp: new Date().toISOString(),
            source: popup.webContents.getURL(),
          },
          args.lensSessionId,
        );
      });
    }, 300);
  });

  popup.webContents.setWindowOpenHandler(({ url }) => {
    if (!isCurrentBrowserSession(session)) {
      return { action: "deny" };
    }
    if (!isHttpOrHttpsUrl(url)) {
      void openExternalWithFallback({ url });
      return { action: "deny" };
    }

    try {
      assertNavigationAllowed(url);
    } catch (err) {
      pushGuestConsoleEntry(
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

    void popup.webContents.loadURL(url).catch(() => undefined);
    return { action: "deny" };
  });

  void popup.webContents.loadURL(args.url).catch((err) => {
    if (isCurrentBrowserSession(session)) {
      pushGuestConsoleEntry(
        args.workspaceId,
        {
          level: "error",
          text: `Lens popup failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toISOString(),
          source: args.url,
        },
        args.lensSessionId,
      );
    }
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
  ses.webRequest.onBeforeSendHeaders(
    { urls: ["<all_urls>"] },
    (details, callback) => {
      const target = resolvePartitionTrafficTarget(
        partition,
        details.webContentsId,
      );
      if (target) {
        if (getLensCdpDiagnosticsState(target.webContentsId).enabled) {
          callback({ requestHeaders: details.requestHeaders });
          return;
        }
        rememberNetworkRequest(networkRequestKey(partition, details.id), {
          startedAt: formatNetworkTimestamp(details.timestamp),
          startedAtMs: details.timestamp,
          requestHeaders: sanitizeLensNetworkHeaders(details.requestHeaders),
        });
      }
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  ses.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    const requestMetadata = takeNetworkRequest(partition, details.id);
    const target = resolvePartitionTrafficTarget(
      partition,
      details.webContentsId,
    );
    if (!target) {
      return;
    }
    if (getLensCdpDiagnosticsState(target.webContentsId).enabled) {
      return;
    }
    pushNetworkEntry(
      target.workspaceId,
      {
        requestId: String(details.id),
        url: sanitizeLensNetworkUrl(details.url),
        method: details.method,
        status: details.statusCode,
        statusText: details.statusLine,
        resourceType: details.resourceType,
        mimeType: extractMimeType(details.responseHeaders),
        responseSize: extractResponseSize(details.responseHeaders),
        referrer: details.referrer || undefined,
        startedAt: requestMetadata?.startedAt,
        durationMs: getNetworkDurationMs(
          requestMetadata?.startedAtMs,
          details.timestamp,
        ),
        fromCache: details.fromCache,
        error:
          details.error && details.error !== "net::OK"
            ? details.error
            : undefined,
        requestHeaders: requestMetadata?.requestHeaders,
        responseHeaders: sanitizeLensNetworkHeaders(details.responseHeaders),
        timestamp: formatNetworkTimestamp(details.timestamp),
      },
      target.lensSessionId,
    );
  });

  ses.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
    const requestMetadata = takeNetworkRequest(partition, details.id);
    const target = resolvePartitionTrafficTarget(
      partition,
      details.webContentsId,
    );
    if (!target) {
      return;
    }
    if (getLensCdpDiagnosticsState(target.webContentsId).enabled) {
      return;
    }
    pushNetworkEntry(
      target.workspaceId,
      {
        requestId: String(details.id),
        url: sanitizeLensNetworkUrl(details.url),
        method: details.method,
        status: 0,
        resourceType: details.resourceType,
        referrer: details.referrer || undefined,
        startedAt: requestMetadata?.startedAt,
        durationMs: getNetworkDurationMs(
          requestMetadata?.startedAtMs,
          details.timestamp,
        ),
        fromCache: details.fromCache,
        error: details.error,
        requestHeaders: requestMetadata?.requestHeaders,
        timestamp: formatNetworkTimestamp(details.timestamp),
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
        if (isCurrentBrowserSession(target)) {
          target.downloadLog.push(entry);
        }
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
    const owner = getSessionForWebContentsId(view.webContents.id);
    if (!owner || !isCurrentBrowserSession(owner)) {
      return;
    }
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
      ownerWebContentsId: view.webContents.id,
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
    consoleLog: new RingBuffer<BrowserConsoleEntry>(CONSOLE_BUFFER_SIZE),
    consoleRateLimiter: new LensConsoleRateLimiter(),
    networkLog: new RingBuffer<BrowserNetworkEntry>(NETWORK_BUFFER_SIZE),
    downloadLog: new RingBuffer<LensDownloadEntry>(DOWNLOAD_BUFFER_SIZE),
    annotationOverlayActive: false,
    annotationNonce: null,
    annotationExtractDebugSource: false,
    documentId: randomUUID(),
    annotations: [],
    boxInspectActive: false,
    managedByMcp: false,
    visible: false,
    closing: false,
    detachEventListeners: null,
    lastVisibleAt: 0,
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
    clearNetworkIpcBatch(session.workspaceId, session.lensSessionId);
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

export type BrowserSessionLogKind = "console" | "network";

/**
 * Clear one diagnostic log without disturbing the page, downloads, or the
 * sibling log. Returns false when the requested session no longer exists.
 */
export function clearBrowserSessionLog(
  workspaceId: string,
  kind: BrowserSessionLogKind,
  lensSessionId?: string,
): boolean {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    return false;
  }

  if (kind === "console") {
    session.consoleLog.clear();
  } else {
    session.networkLog.clear();
    clearNetworkIpcBatch(session.workspaceId, session.lensSessionId);
  }
  clearLensCdpDiagnostics(session.webContentsId, kind);
  return true;
}

/** All live sessions belonging to one workspace. */
export function getWorkspaceBrowserSessions(
  workspaceId: string,
): BrowserSessionState[] {
  return [...sessions.values()].filter(
    (session) => session.workspaceId === workspaceId,
  );
}

export function resolvePreferredBrowserSession(
  workspaceId: string,
  lensSessionId?: string,
): BrowserSessionState | undefined {
  return selectPreferredLensSession(
    getWorkspaceBrowserSessions(workspaceId),
    lensSessionId,
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
  if (!session || session.closing) return;

  session.closing = true;

  // Keep the JS wrapper alive until native destruction has completed. Some
  // Electron versions can otherwise collect WebContents from a V8 second-pass
  // weak callback while its observer notification is still on the stack.
  try {
    retainBrowserViewUntilDestroyed(session.view);
  } catch {
    // The helper retains before observing destruction, so continuing is safer
    // than abandoning the rest of teardown if WebContents is already invalid.
  }

  // Tombstone routing before any teardown work so late console/network events
  // cannot enqueue more renderer IPC while the view is closing.
  sessions.delete(sessionKey(session.workspaceId, session.lensSessionId));
  clearNetworkIpcBatch(session.workspaceId, session.lensSessionId);
  if (webContentsSessionIndex.get(session.webContentsId) === session) {
    webContentsSessionIndex.delete(session.webContentsId);
  }
  session.detachEventListeners?.();
  session.detachEventListeners = null;

  session.visible = false;
  session.lastAppliedBounds = { x: 0, y: 0, width: 0, height: 0 };
  closeRetainedBrowserView({
    view: session.view,
    removeFromParent: () => {
      const win = getMainWindow();
      if (win) {
        win.contentView.removeChildView(session.view);
      }
    },
    beforeClose: () => {
      // The target owns its remote objects, so dispose local CDP state without
      // issuing cleanup commands that would race with WebContents.close().
      try {
        disposeLensCdpDiagnostics(session.webContentsId);
      } catch {
        // Continue with popup teardown even if debugger state is already stale.
      }

      for (const popup of [...session.authPopups]) {
        try {
          if (!popup.isDestroyed()) {
            webContentsSessionIndex.delete(popup.webContents.id);
            popup.destroy();
          }
        } catch {
          // Popup may already be closing.
        }
      }
      session.authPopups.clear();
    },
  });

  session.consoleLog.clear();
  session.networkLog.clear();
  session.downloadLog.clear();
  releasePartitionHandlersIfUnused(session.sessionProfile.partition);

  // Tell the renderer the view is gone so it can drop the matching tab/panel.
  // Emitted last so no renderer reaction can observe a half-torn-down session.
  try {
    const renderer = getMainWindow()?.webContents;
    if (renderer && !renderer.isDestroyed()) {
      renderer.send("lens:session-closed", {
        workspaceId: session.workspaceId,
        lensSessionId: session.lensSessionId,
      } satisfies LensSessionClosedPayload);
    }
  } catch {
    // A closing window must not block session teardown.
  }
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

/**
 * Hide every live Lens view without destroying it.
 *
 * Used when the renderer reloads. Native views stay children of the window with
 * their last non-zero bounds, so they keep painting over the freshly mounted UI
 * until a `LensSurfacePanel` for that exact session remounts and re-issues
 * `setVisible`/`setBounds` — which looks like a Lens overlay that "won't go
 * away". Hiding rather than detaching is deliberate: `setViewVisible` does not
 * re-`addChildView`, so a detached view could never be shown again, and keeping
 * the view attached preserves webContents, cookies, and scroll position. The
 * panel's normal mount path restores visibility in whichever workspace needs it.
 */
export function hideAllBrowserSessions(): void {
  for (const session of [...sessions.values()]) {
    if (session.closing) continue;
    setViewVisible(session.workspaceId, false, session.lensSessionId);
    setViewBounds(
      session.workspaceId,
      { x: 0, y: 0, width: 0, height: 0 },
      session.lensSessionId,
    );
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
    session.visible = visible;
    if (visible) {
      session.lastVisibleAt = ++lensVisibilitySequence;
    }
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
  entry: Omit<BrowserConsoleEntry, "id"> & { id?: string },
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    return;
  }

  const normalizedEntry = truncateLensConsoleEntry({
    ...entry,
    id: entry.id ?? randomUUID(),
    captureSource: entry.captureSource ?? "electron",
  });
  session.consoleLog.push(normalizedEntry);

  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }

  renderer.send("lens:console-entry", {
    workspaceId,
    lensSessionId: session.lensSessionId,
    entry: normalizedEntry,
  } satisfies BrowserConsoleEventPayload);
}

/**
 * Route untrusted guest-page logs through per-session backpressure before
 * retaining or cloning them across IPC. Internal Lens diagnostics use
 * pushConsoleEntry directly so a noisy page cannot suppress lifecycle errors.
 */
export function pushGuestConsoleEntry(
  workspaceId: string,
  entry: Omit<BrowserConsoleEntry, "id"> & { id?: string },
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session || session.closing) {
    return;
  }

  const decision = session.consoleRateLimiter.accept();
  if (!decision.accepted) {
    return;
  }

  if (decision.droppedCount > 0) {
    pushConsoleEntry(
      workspaceId,
      {
        level: "warn",
        text: `Lens console dropped ${decision.droppedCount} excessive page log entries.`,
        timestamp: new Date().toISOString(),
        source: "lens",
      },
      session.lensSessionId,
    );
  }

  pushConsoleEntry(workspaceId, entry, session.lensSessionId);
}

export function pushNetworkEntry(
  workspaceId: string,
  entry: Omit<BrowserNetworkEntry, "entryId" | "state"> & {
    entryId?: string;
    state?: BrowserNetworkEntry["state"];
  },
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) {
    return;
  }

  const state =
    entry.state ??
    (entry.error
      ? "failed"
      : entry.status !== undefined
        ? "complete"
        : "pending");
  const normalizedEntry: BrowserNetworkEntry = {
    ...entry,
    entryId:
      entry.entryId ??
      `${entry.captureSource ?? "webRequest"}:${entry.requestId}:${entry.startedAt ?? entry.timestamp}`,
    state,
    captureSource: entry.captureSource ?? "webRequest",
    completedAt:
      entry.completedAt ?? (state === "pending" ? undefined : entry.timestamp),
  };
  session.networkLog.upsert(
    (candidate) => candidate.entryId === normalizedEntry.entryId,
    normalizedEntry,
  );

  queueNetworkIpcEntry({
    workspaceId,
    lensSessionId: session.lensSessionId,
    entry: normalizedEntry,
  });
}

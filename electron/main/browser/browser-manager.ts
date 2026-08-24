// ---------------------------------------------------------------------------
// Browser session manager – singleton per Electron main process
// Tracks Lens sessions keyed by (workspaceId, lensSessionId) so a workspace can
// host multiple lens tabs. Callers that omit lensSessionId transparently target
// the "default" session, preserving the historical one-session-per-workspace
// behavior. Each session wraps a `<webview>` guest the renderer created and
// bound by WebContents id; the guest's geometry and visibility are CSS in the
// renderer, so main holds no positioning state.
// ---------------------------------------------------------------------------

import {
  BrowserWindow,
  session as electronSession,
  webContents,
} from "electron";
import { randomUUID } from "node:crypto";
import { attachPartitionDownloadHandler } from "./browser-downloads";
import { isDevToolsShortcut } from "../keyboard-shortcuts";
import { getMainWindow, toggleMainWindowDevTools } from "../window";
import { openExternalWithFallback } from "../utils/external-url";
import { assertNavigationAllowed } from "./browser-security";
import { decideLensGuestBind } from "./browser-guest-bind";
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
  type LensSessionClosedPayload,
  type LensSessionDescriptor,
  type LensSessionProfileArgs,
  type LensSessionScope,
} from "../../../src/lib/lens/lens.types";
import {
  LensNetworkRateLimiter,
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
import { getCdpControllerResourceMetrics } from "./browser-cdp-controller";
import { isLiveBrowserSessionForWebContents } from "./browser-session-identity";
import { appendRuntimeDiagnostic } from "../runtime-diagnostic-log";
import { resolveLensGuestPreloadScriptPath } from "../window-paths";
import {
  enableLensPageAudioOutput,
  installLensAudioPermissionHandlers,
} from "./browser-media-permissions";

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
  /**
   * The guest page itself, which is what every feature actually talks to:
   * navigation, CDP, console/network capture, downloads, annotations.
   *
   * Held directly because every feature reads it and none cares that the guest
   * is a renderer-owned `<webview>`. It stays inspectable via `isDestroyed()`
   * even after the guest is gone.
   */
  webContents: Electron.WebContents;
  /** webContents id of the guest, captured at creation (survives destroy). */
  webContentsId: number;
  authPopups: Set<BrowserWindow>;
  consoleLog: RingBuffer<BrowserConsoleEntry>;
  consoleRateLimiter: LensConsoleRateLimiter;
  networkRateLimiter: LensNetworkRateLimiter;
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
  /** Whether a renderer Lens tab is currently presenting this session. */
  visible: boolean;
  /** Prevents new work from entering while the session is being torn down. */
  closing: boolean;
  /** Stops guest events before closing the WebContents. */
  detachEventListeners: (() => void) | null;
  /** Monotonic activation order used to prefer the most recently shown tab. */
  lastVisibleAt: number;
  navigationState: BrowserNavigationState;
}

const CONSOLE_BUFFER_SIZE = 200;
const NETWORK_BUFFER_SIZE = 200;
const DOWNLOAD_BUFFER_SIZE = 200;
const MAX_LENS_AUTH_POPUPS = 3;
const lensGuestPreloadPath = resolveLensGuestPreloadScriptPath(
  import.meta.dirname,
);
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
    capture: boolean;
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

export function normalizeLensSessionId(lensSessionId?: string | null): string {
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
    capture: boolean;
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
      preload: lensGuestPreloadPath,
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
        const decision = target.networkRateLimiter.accept();
        if (decision.droppedCount > 0) {
          pushConsoleEntry(
            target.workspaceId,
            {
              level: "warn",
              text: `Lens network dropped ${decision.droppedCount} excessive requests.`,
              timestamp: new Date().toISOString(),
              source: "lens",
            },
            target.lensSessionId,
          );
        }
        rememberNetworkRequest(networkRequestKey(partition, details.id), {
          capture: decision.accepted,
          startedAt: formatNetworkTimestamp(details.timestamp),
          startedAtMs: details.timestamp,
          requestHeaders: decision.accepted
            ? sanitizeLensNetworkHeaders(details.requestHeaders)
            : undefined,
        });
      }
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  ses.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    const requestMetadata = takeNetworkRequest(partition, details.id);
    if (!requestMetadata?.capture) {
      return;
    }
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
    if (!requestMetadata?.capture) {
      return;
    }
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

/**
 * Identity and storage profile for a Lens session, resolved without creating
 * anything.
 *
 * This is the first half of opening a session on the DOM-guest surface: the
 * renderer needs the partition before it can mount a `<webview>`, and main
 * needs to have resolved that partition itself rather than accept one the
 * renderer chose. The guest arrives afterwards, through
 * `bindBrowserSessionGuest`.
 */
export function resolveBrowserSessionReservation(
  workspaceId: string,
  options?: Omit<LensSessionProfileArgs, "workspaceId"> & {
    lensSessionId?: string;
  },
): { lensSessionId: string; sessionProfile: ResolvedLensSessionProfile } {
  return {
    lensSessionId: normalizeLensSessionId(options?.lensSessionId),
    sessionProfile: resolveLensSessionProfile({
      workspaceId,
      sessionScope: options?.sessionScope,
      projectKey: options?.projectKey,
    }),
  };
}

/**
 * Everything a Lens session is, given the `<webview>` guest page the renderer
 * created for it.
 *
 * The permissions, the popup policy, the partition-level traffic dispatch, and
 * the shortcut relay are properties of *a Lens page*, independent of which
 * panel (if any) is showing it.
 */
function wireBrowserSession(args: {
  workspaceId: string;
  lensSessionId: string;
  sessionProfile: ResolvedLensSessionProfile;
  webContents: Electron.WebContents;
}): BrowserSessionState {
  const { workspaceId, lensSessionId, sessionProfile, webContents } = args;
  const ses = webContents.session;

  // Keep app DevTools shortcuts working while the guest page holds focus.
  //
  // A `<webview>` guest is a separate frame tree with its own focus, so keys
  // pressed in the page are delivered to the guest and never reach the host
  // document's listeners — the relay is what carries app shortcuts back.
  webContents.on("before-input-event", (event, input) => {
    const owner = getSessionForWebContentsId(webContents.id);
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

  // Lens is a browser surface, so pages must be able to play through the
  // selected system output device.
  enableLensPageAudioOutput(webContents);

  // Throttle background rendering when the page is not visible to reduce CPU
  // usage when the Lens panel is closed or another panel is active.
  webContents.setBackgroundThrottling(true);

  // Grant only microphone and audio-output selection to a live Lens page.
  // Auth popups, stale views, camera, display capture, and every unrelated
  // permission continue to fail closed.
  installLensAudioPermissionHandlers(ses, (permissionWebContents) => {
    if (!permissionWebContents) {
      return false;
    }
    const owner = getSessionForWebContentsId(permissionWebContents.id);
    return (
      owner?.webContentsId === permissionWebContents.id &&
      isCurrentBrowserSession(owner)
    );
  });

  // Partition-level dispatchers route traffic back to the owning session.
  registerPartitionNetworkDispatch(ses, sessionProfile.partition);
  ensurePartitionDownloadDispatch(ses, sessionProfile.partition);

  // Open external links in system browser instead of navigating.
  webContents.setWindowOpenHandler(({ url }) => {
    const win = getMainWindow();
    if (win) {
      openLensAuthPopup({
        parent: win,
        session: ses,
        url,
        workspaceId,
        lensSessionId,
        ownerWebContentsId: webContents.id,
      });
    }
    return { action: "deny" as const };
  });

  const session: BrowserSessionState = {
    workspaceId,
    lensSessionId,
    sessionProfile,
    webContents,
    webContentsId: webContents.id,
    authPopups: new Set(),
    consoleLog: new RingBuffer<BrowserConsoleEntry>(CONSOLE_BUFFER_SIZE),
    consoleRateLimiter: new LensConsoleRateLimiter(),
    networkRateLimiter: new LensNetworkRateLimiter(),
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
  };

  sessions.set(sessionKey(workspaceId, lensSessionId), session);
  webContentsSessionIndex.set(session.webContentsId, session);
  return session;
}

/**
 * Forget a session whose guest is already gone, without announcing a close.
 *
 * Used only when a dead guest is being replaced by a fresh one for the same
 * session id. `destroyBrowserSession` is the wrong tool there: it tells the
 * renderer the session closed, which would drop the very tab that is in the
 * middle of restoring itself.
 */
function forgetDeadSessionState(session: BrowserSessionState): void {
  sessions.delete(sessionKey(session.workspaceId, session.lensSessionId));
  clearNetworkIpcBatch(session.workspaceId, session.lensSessionId);
  if (webContentsSessionIndex.get(session.webContentsId) === session) {
    webContentsSessionIndex.delete(session.webContentsId);
  }
  try {
    session.detachEventListeners?.();
  } catch {
    // The listeners are attached to a WebContents that is already gone.
  }
  session.detachEventListeners = null;
  session.consoleLog.clear();
  session.networkLog.clear();
  session.downloadLog.clear();
}

export type BindBrowserSessionGuestResult =
  | { ok: true; session: BrowserSessionState; created: boolean }
  | { ok: false; message: string };

/**
 * Adopt a `<webview>` guest the renderer created as the page behind a session.
 *
 * This is the inverted half of session creation. Main still decides the
 * session's identity and storage profile — `resolveBrowserSessionReservation`
 * ran before the renderer mounted anything — and everything the renderer
 * contributes is checked before it can matter: `decideLensGuestBind` establishes
 * that the nominated WebContents is a webview guest, embedded by the Lens host
 * window, running in the Session object main resolved for this partition.
 */
export function bindBrowserSessionGuest(args: {
  workspaceId: string;
  lensSessionId?: string;
  guestWebContentsId: number;
  sessionScope?: LensSessionScope;
  projectKey?: string | null;
}): BindBrowserSessionGuestResult {
  const { lensSessionId, sessionProfile } = resolveBrowserSessionReservation(
    args.workspaceId,
    {
      lensSessionId: args.lensSessionId,
      sessionScope: args.sessionScope,
      projectKey: args.projectKey,
    },
  );

  const host = getMainWindow()?.webContents;
  if (!host || host.isDestroyed()) {
    return { ok: false, message: "No main window available to host a guest" };
  }

  const guest = webContents.fromId(args.guestWebContentsId);
  if (!guest) {
    return {
      ok: false,
      message: `No WebContents with id ${args.guestWebContentsId}`,
    };
  }

  // Refuse a guest that already backs a different live session. Sessions share
  // partitions, so `decideLensGuestBind`'s partition check cannot catch this;
  // without it a renderer could point a second session at a live guest, and the
  // last writer to `webContentsSessionIndex` would silently steal its event
  // routing and traffic dispatch from the first.
  const currentOwner = getSessionForWebContentsId(args.guestWebContentsId);
  if (
    currentOwner &&
    !currentOwner.webContents.isDestroyed() &&
    !(
      currentOwner.workspaceId === args.workspaceId &&
      currentOwner.lensSessionId === lensSessionId
    )
  ) {
    return {
      ok: false,
      message: `Refused Lens guest: webContents ${args.guestWebContentsId} already backs session ${currentOwner.lensSessionId}`,
    };
  }

  const existing = getBrowserSession(args.workspaceId, lensSessionId);
  const decision = decideLensGuestBind({
    candidate: {
      type: guest.getType(),
      hostWebContentsId: guest.hostWebContents?.id ?? null,
      isExpectedPartition:
        guest.session === electronSession.fromPartition(sessionProfile.partition),
      isDestroyed: guest.isDestroyed(),
    },
    candidateWebContentsId: args.guestWebContentsId,
    hostWebContentsId: host.id,
    incumbent: existing
      ? {
          webContentsId: existing.webContentsId,
          isDestroyed: existing.webContents.isDestroyed(),
        }
      : null,
  });

  if (!decision.ok) {
    return { ok: false, message: `Refused Lens guest: ${decision.reason}` };
  }

  if (existing && !decision.replacesIncumbent) {
    return { ok: true, session: existing, created: false };
  }

  if (existing) {
    forgetDeadSessionState(existing);
  }

  return {
    ok: true,
    session: wireBrowserSession({
      workspaceId: args.workspaceId,
      lensSessionId,
      sessionProfile,
      webContents: guest,
    }),
    created: true,
  };
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
    const wc = session.webContents;
    if (!wc.isDestroyed() && wc.getURL() !== "about:blank") {
      wc.reloadIgnoringCache();
    }
  }

  return sessionProfile;
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

export interface BrowserResourceMetrics {
  sessions: number;
  visibleSessions: number;
  managedByMcpSessions: number;
  diagnosticsSessions: number;
  authPopups: number;
  consoleEntries: number;
  networkEntries: number;
  downloadEntries: number;
  cdpControllers: number;
  cdpClosingControllers: number;
  cdpInFlightCommands: number;
  cdpCloseDrainTimeouts: number;
}

/** Bounded lifecycle/log cardinalities used by the in-app resource monitor. */
export function getBrowserResourceMetrics(): BrowserResourceMetrics {
  const liveSessions = [...sessions.values()].filter(
    (session) => !session.closing,
  );
  const cdp = getCdpControllerResourceMetrics();
  return {
    sessions: liveSessions.length,
    visibleSessions: liveSessions.filter((session) => session.visible).length,
    managedByMcpSessions: liveSessions.filter((session) => session.managedByMcp)
      .length,
    diagnosticsSessions: liveSessions.filter(
      (session) => getLensCdpDiagnosticsState(session.webContentsId).enabled,
    ).length,
    authPopups: liveSessions.reduce(
      (total, session) => total + session.authPopups.size,
      0,
    ),
    consoleEntries: liveSessions.reduce(
      (total, session) => total + session.consoleLog.length,
      0,
    ),
    networkEntries: liveSessions.reduce(
      (total, session) => total + session.networkLog.length,
      0,
    ),
    downloadEntries: liveSessions.reduce(
      (total, session) => total + session.downloadLog.length,
      0,
    ),
    cdpControllers: cdp.controllers,
    cdpClosingControllers: cdp.closingControllers,
    cdpInFlightCommands: cdp.inFlightCommands,
    cdpCloseDrainTimeouts: cdp.closeDrainTimeouts,
  };
}

export function getWebContentsForSession(
  workspaceId: string,
  lensSessionId?: string,
): Electron.WebContents | undefined {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return undefined;
  try {
    const wc = session.webContents;
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
): Promise<void> {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session || session.closing) return Promise.resolve();

  session.closing = true;

  // Tombstone routing before any teardown work so late console/network events
  // cannot enqueue more renderer IPC while the page is closing.
  const key = sessionKey(session.workspaceId, session.lensSessionId);
  sessions.delete(key);
  clearNetworkIpcBatch(session.workspaceId, session.lensSessionId);
  if (webContentsSessionIndex.get(session.webContentsId) === session) {
    webContentsSessionIndex.delete(session.webContentsId);
  }
  session.detachEventListeners?.();
  session.detachEventListeners = null;

  session.visible = false;

  /*
   * Closing the page.
   *
   * A `<webview>` guest is owned by its element in the renderer, so main holds
   * no wrapper to close: draining the CDP side-channels and then emitting
   * `lens:session-closed` — which tells the renderer to remove the element,
   * and removing the element is what destroys the page — is the whole of it.
   * Calling `webContents.close()` here as well would only race that removal.
   */
  const closePromise = (async () => {
    // The target owns its remote objects, so dispose local CDP state without
    // issuing cleanup commands that would race with the guest's destruction.
    try {
      const drainResult = await disposeLensCdpDiagnostics(
        session.webContentsId,
      );
      if (drainResult === "timed-out") {
        await appendRuntimeDiagnostic({
          scope: "lens",
          context: "cdp-close-drain",
          message: "Closing Lens with native CDP commands still in flight",
          metadata: {
            webContentsId: String(session.webContentsId),
          },
        }).catch(() => undefined);
      }
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
  })();

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
  return closePromise;
}

export async function destroyAllBrowserSessions(): Promise<void> {
  await Promise.allSettled(
    [...sessions.values()].map((session) =>
      destroyBrowserSession(session.workspaceId, session.lensSessionId),
    ),
  );
}

/**
 * Record whether a renderer panel is currently showing this session's page.
 *
 * Purely a report, not a command: on the DOM-guest surface the renderer has
 * already shown or hidden the element by the time this arrives, and main cannot
 * override it. What main needs the answer for is session *choice* — an agent
 * call with no explicit session id targets the Lens tab the user is looking at,
 * falling back to the most recently shown one
 * (`resolvePreferredBrowserSession`). Without this signal every such call would
 * have to guess.
 */
export function setSessionPresented(
  workspaceId: string,
  presented: boolean,
  lensSessionId?: string,
): void {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return;
  session.visible = presented;
  if (presented) {
    session.lastVisibleAt = ++lensVisibilitySequence;
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

import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import {
  DEFAULT_LENS_SESSION_ID,
  type BrowserConsoleEntry,
  type LensAnnotation,
  type LensAnnotationEventPayload,
  type LensSessionProfileArgs,
  type LensStateChangedPayload,
} from "../../../src/lib/lens/lens.types";
import {
  bindBrowserSessionGuest,
  getBrowserSession,
  pushConsoleEntry,
  pushGuestConsoleEntry,
  updateNavigationState,
  type BindBrowserSessionGuestResult,
  type BrowserSessionState,
} from "./browser-manager";
import { notifyLensGuestBound } from "./browser-guest-broker";
import { getAnnotationOverlayScript } from "./browser-annotation-overlay";
import { getBoxInspectScript } from "./browser-box-inspect";
import { fillLensCredentialForWebContents } from "./lens-credential-service";
import { getMainWindow } from "../window";
import {
  getLensCdpDiagnosticsState,
  handleLensCdpDiagnosticsNavigation,
  handleLensCdpDiagnosticsNavigationStart,
} from "./browser-cdp-diagnostics";
import {
  LENS_ANNOTATION_BEACON_MARKER,
  normalizeStoredAnnotationsForSession,
  readLensAnnotationConsoleMessage,
  readNormalizedPageAnnotations,
} from "./browser-annotation-ingestion";
import {
  applyLensAnnotationEvent,
  invalidateLensAnnotationDocument,
} from "./browser-annotation-state";
import { executeInLensAnnotationWorld } from "./browser-annotation-world";
import { isLiveBrowserSessionForWebContents } from "./browser-session-identity";

function toIso(): string {
  return new Date().toISOString();
}

function getLiveWebContentsUrl(wc: Electron.WebContents): string | undefined {
  try {
    return wc.isDestroyed() ? undefined : wc.getURL();
  } catch {
    return undefined;
  }
}

function getLiveBrowserSession(
  workspaceId: string,
  lensSessionId: string | undefined,
  wc: Electron.WebContents,
): BrowserSessionState | undefined {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!isLiveBrowserSessionForWebContents(session, wc.id)) {
    return undefined;
  }
  try {
    return wc.isDestroyed() ? undefined : session;
  } catch {
    return undefined;
  }
}

export function sendNavigationEvent(args: {
  workspaceId: string;
  lensSessionId?: string;
  state: ReturnType<typeof updateNavigationState>;
}) {
  if (!args.state) {
    return;
  }

  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }

  const lensSessionId = args.lensSessionId ?? DEFAULT_LENS_SESSION_ID;

  renderer.send("lens:navigation-event", {
    workspaceId: args.workspaceId,
    lensSessionId,
    state: args.state,
  });

  renderer.send("lens:state-changed", {
    workspaceId: args.workspaceId,
    lensSessionId,
    url: args.state.url,
    title: args.state.title,
    canGoBack: args.state.canGoBack,
    canGoForward: args.state.canGoForward,
    loading: args.state.isLoading,
    faviconUrl: args.state.faviconUrl,
  } satisfies LensStateChangedPayload);
}

export function sendAnnotationEvent(payload: LensAnnotationEventPayload) {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }
  renderer.send("lens:annotation-event", payload);
}

export async function injectAnnotationOverlay(
  workspaceId: string,
  wc: Electron.WebContents,
  lensSessionId?: string,
): Promise<void> {
  const session = getLiveBrowserSession(workspaceId, lensSessionId, wc);
  if (!session?.annotationOverlayActive || !session.annotationNonce) {
    return;
  }
  let initialAnnotations: LensAnnotation[] = [];
  try {
    initialAnnotations = await readNormalizedPageAnnotations(session);
  } catch {
    initialAnnotations = [];
  }
  if (initialAnnotations.length === 0) {
    initialAnnotations = normalizeStoredAnnotationsForSession(
      session,
      session.annotations,
    );
  }
  if (getLiveBrowserSession(workspaceId, lensSessionId, wc) !== session) {
    return;
  }
  session.annotations = initialAnnotations;
  await executeInLensAnnotationWorld(
    wc,
    getAnnotationOverlayScript({
      documentId: session.documentId,
      extractDebugSource: session.annotationExtractDebugSource,
      initialAnnotations,
      nonce: session.annotationNonce,
    }),
  );
}

export async function injectBoxInspectOverlay(
  workspaceId: string,
  wc: Electron.WebContents,
  lensSessionId?: string,
): Promise<void> {
  const session = getLiveBrowserSession(workspaceId, lensSessionId, wc);
  if (!session?.boxInspectActive) {
    return;
  }
  await wc.executeJavaScript(getBoxInspectScript());
}

export function attachBrowserSessionEventListeners(
  workspaceId: string,
  wc: Electron.WebContents,
  lensSessionId: string = DEFAULT_LENS_SESSION_ID,
): () => void {
  const eventEmitter = wc as unknown as EventEmitter;
  const eventNames = [
    "will-navigate",
    "did-start-navigation",
    "did-navigate",
    "did-navigate-in-page",
    "did-start-loading",
    "did-stop-loading",
    "did-fail-load",
    "page-title-updated",
    "page-favicon-updated",
    "console-message",
  ] as const;
  const preexistingListeners = new Map(
    eventNames.map((eventName) => [
      eventName,
      new Set(eventEmitter.listeners(eventName)),
    ]),
  );

  const sendNavUpdate = () => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    const state = updateNavigationState(
      workspaceId,
      {
        url: wc.getURL(),
        title: wc.getTitle(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
        isLoading: wc.isLoading(),
      },
      lensSessionId,
    );
    sendNavigationEvent({ workspaceId, lensSessionId, state });
  };

  wc.on("will-navigate", (_event, url) => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    handleLensCdpDiagnosticsNavigationStart(wc.id, url);
  });
  wc.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    if (isMainFrame) {
      handleLensCdpDiagnosticsNavigationStart(wc.id, url);
      if (!isInPlace) {
        const session = getBrowserSession(workspaceId, lensSessionId);
        if (
          session &&
          invalidateLensAnnotationDocument(session, {
            documentId: randomUUID(),
            annotationNonce: randomUUID(),
          })
        ) {
          sendAnnotationEvent({
            workspaceId,
            lensSessionId,
            documentId: session.documentId,
            type: "clear",
          });
        }
      }
    }
  });
  wc.on("did-navigate", (_event, url) => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    handleLensCdpDiagnosticsNavigation(wc.id, url);
    // New document: drop the previous page's favicon until the new page
    // reports one via page-favicon-updated.
    updateNavigationState(
      workspaceId,
      { faviconUrl: undefined },
      lensSessionId,
    );
    sendNavUpdate();
  });
  wc.on("did-navigate-in-page", () => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    sendNavUpdate();
    setTimeout(() => {
      if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
        return;
      }
      void executeInLensAnnotationWorld(
        wc,
        "window.__staveReconcileAnnotations?.() ?? []",
      ).catch(() => {
        // The overlay may be absent when the session has no annotations.
      });
    }, 50);
  });
  wc.on("did-start-loading", () => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    updateNavigationState(workspaceId, { isLoading: true }, lensSessionId);
    sendNavUpdate();
  });
  wc.on("did-stop-loading", () => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    updateNavigationState(workspaceId, { isLoading: false }, lensSessionId);
    sendNavUpdate();
    void injectAnnotationOverlay(workspaceId, wc, lensSessionId).catch(
      (error) => {
        if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
          return;
        }
        pushGuestConsoleEntry(
          workspaceId,
          {
            level: "warn",
            text: `Annotation overlay reinjection failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            timestamp: toIso(),
            source: getLiveWebContentsUrl(wc),
          },
          lensSessionId,
        );
      },
    );
    void injectBoxInspectOverlay(workspaceId, wc, lensSessionId).catch(
      (error) => {
        if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
          return;
        }
        pushGuestConsoleEntry(
          workspaceId,
          {
            level: "warn",
            text: `Box inspect overlay reinjection failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            timestamp: toIso(),
            source: getLiveWebContentsUrl(wc),
          },
          lensSessionId,
        );
      },
    );
    setTimeout(() => {
      if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
        return;
      }
      void fillLensCredentialForWebContents(wc, {
        autoFillOnly: true,
      })
        .then((result) => {
          if (
            !result.ok ||
            !getLiveBrowserSession(workspaceId, lensSessionId, wc)
          ) {
            return;
          }
          pushConsoleEntry(
            workspaceId,
            {
              level: "info",
              text: `Filled the saved Lens account for ${result.host}.`,
              timestamp: toIso(),
              source: getLiveWebContentsUrl(wc),
            },
            lensSessionId,
          );
        })
        .catch((error) => {
          if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
            return;
          }
          pushConsoleEntry(
            workspaceId,
            {
              level: "warn",
              text: `Saved Lens account fill failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
              timestamp: toIso(),
              source: getLiveWebContentsUrl(wc),
            },
            lensSessionId,
          );
        });
    }, 300);
  });
  wc.on(
    "did-fail-load",
    (_event, _errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
        return;
      }
      pushGuestConsoleEntry(
        workspaceId,
        {
          level: "error",
          text: `Navigation failed: ${errorDescription}`,
          timestamp: toIso(),
          source: validatedUrl,
        },
        lensSessionId,
      );
      updateNavigationState(workspaceId, { isLoading: false }, lensSessionId);
      sendNavUpdate();
    },
  );
  wc.on("page-title-updated", (_event, title) => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    updateNavigationState(workspaceId, { title }, lensSessionId);
    sendNavUpdate();
  });
  wc.on("page-favicon-updated", (_event, favicons) => {
    if (!getLiveBrowserSession(workspaceId, lensSessionId, wc)) {
      return;
    }
    const faviconUrl = favicons.find((candidate) =>
      /^https?:/i.test(candidate),
    );
    updateNavigationState(workspaceId, { faviconUrl }, lensSessionId);
    sendNavUpdate();
  });

  const handleConsoleMessage = (
    _event: Electron.Event,
    level: number,
    message: string,
    lineNumber: number,
    sourceId: string,
  ) => {
    const session = getLiveBrowserSession(workspaceId, lensSessionId, wc);
    if (!session) {
      return;
    }
    if (message.startsWith(LENS_ANNOTATION_BEACON_MARKER)) {
      try {
        const result = readLensAnnotationConsoleMessage(session, message);
        if (result.event && applyLensAnnotationEvent(session, result.event)) {
          sendAnnotationEvent({
            workspaceId,
            ...result.event,
            lensSessionId,
          } satisfies LensAnnotationEventPayload);
        }
      } catch {
        pushGuestConsoleEntry(
          workspaceId,
          {
            level: "warn",
            text: "Ignored malformed Lens annotation event.",
            timestamp: toIso(),
            source: "lens",
          },
          lensSessionId,
        );
      }
      return;
    }

    // Runtime/Log events retain object arguments, stack traces, and execution
    // contexts. Avoid duplicating their summary through Electron's flattened
    // console-message event while full diagnostics are active.
    if (getLensCdpDiagnosticsState(wc.id).enabled) {
      return;
    }

    const levelMap: Record<number, BrowserConsoleEntry["level"]> = {
      0: "debug",
      1: "log",
      2: "warn",
      3: "error",
    };
    pushGuestConsoleEntry(
      workspaceId,
      {
        level: levelMap[level] ?? "log",
        text: message,
        timestamp: toIso(),
        source: sourceId,
        lineNumber,
      },
      lensSessionId,
    );
  };
  wc.on("console-message", handleConsoleMessage);

  const attachedListeners = eventNames.flatMap((eventName) => {
    const preexisting = preexistingListeners.get(eventName);
    return eventEmitter
      .listeners(eventName)
      .filter((listener) => !preexisting?.has(listener))
      .map((listener) => ({ eventName, listener }));
  });

  return () => {
    for (const { eventName, listener } of attachedListeners) {
      try {
        eventEmitter.off(eventName, listener as (...args: unknown[]) => void);
      } catch {
        // The WebContents may already be destroyed while its session is reaped.
      }
    }
  };
}

/**
 * Adopt a renderer-created `<webview>` guest and start listening to its page.
 *
 * The events half is why this lives here rather than in the manager:
 * navigation, console, network, annotation, and credential listeners are what
 * make a bound WebContents an observable Lens session, and a guest bound
 * without them would look alive and report nothing.
 */
export function bindBrowserSessionGuestWithEvents(args: {
  workspaceId: string;
  lensSessionId?: string;
  guestWebContentsId: number;
  managedByMcp?: boolean;
} & Omit<LensSessionProfileArgs, "workspaceId">): BindBrowserSessionGuestResult {
  const result = bindBrowserSessionGuest({
    workspaceId: args.workspaceId,
    lensSessionId: args.lensSessionId,
    guestWebContentsId: args.guestWebContentsId,
    sessionScope: args.sessionScope,
    projectKey: args.projectKey,
  });

  if (!result.ok || !result.created) {
    return result;
  }

  result.session.managedByMcp = args.managedByMcp === true;
  result.session.detachEventListeners = attachBrowserSessionEventListeners(
    args.workspaceId,
    result.session.webContents,
    result.session.lensSessionId,
  );

  // Only after the listeners are attached: a main-initiated caller resumes the
  // moment this resolves, and the first thing it does is navigate.
  notifyLensGuestBound(result.session);
  return result;
}

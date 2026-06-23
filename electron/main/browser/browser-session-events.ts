import type {
  BrowserConsoleEntry,
  LensAnnotationEventPayload,
} from "../../../src/lib/lens/lens.types";
import {
  createBrowserSession,
  getBrowserSession,
  pushConsoleEntry,
  updateNavigationState,
  type BrowserSessionState,
} from "./browser-manager";
import { getAnnotationOverlayScript } from "./browser-annotation-overlay";
import { getMainWindow } from "../window";

function toIso(): string {
  return new Date().toISOString();
}

export function sendNavigationEvent(args: {
  workspaceId: string;
  state: ReturnType<typeof updateNavigationState>;
}) {
  if (!args.state) {
    return;
  }

  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }

  renderer.send("lens:navigation-event", {
    workspaceId: args.workspaceId,
    state: args.state,
  });
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
): Promise<void> {
  const session = getBrowserSession(workspaceId);
  if (!session?.annotationOverlayActive || !session.annotationNonce) {
    return;
  }
  await wc.executeJavaScript(
    getAnnotationOverlayScript({
      extractDebugSource: session.annotationExtractDebugSource,
      nonce: session.annotationNonce,
    }),
  );
}

export function attachBrowserSessionEventListeners(
  workspaceId: string,
  wc: Electron.WebContents,
) {
  const sendNavUpdate = () => {
    const state = updateNavigationState(workspaceId, {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isLoading: wc.isLoading(),
    });
    sendNavigationEvent({ workspaceId, state });
  };

  wc.on("did-navigate", sendNavUpdate);
  wc.on("did-navigate", () => {
    sendAnnotationEvent({ workspaceId, type: "clear" });
  });
  wc.on("did-navigate-in-page", sendNavUpdate);
  wc.on("did-start-loading", () => {
    updateNavigationState(workspaceId, { isLoading: true });
    sendNavUpdate();
  });
  wc.on("did-stop-loading", () => {
    updateNavigationState(workspaceId, { isLoading: false });
    sendNavUpdate();
    void injectAnnotationOverlay(workspaceId, wc).catch((error) => {
      pushConsoleEntry(workspaceId, {
        level: "warn",
        text: `Annotation overlay reinjection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: toIso(),
        source: wc.getURL(),
      });
    });
  });
  wc.on(
    "did-fail-load",
    (_event, _errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      pushConsoleEntry(workspaceId, {
        level: "error",
        text: `Navigation failed: ${errorDescription}`,
        timestamp: toIso(),
        source: validatedUrl,
      });
      updateNavigationState(workspaceId, { isLoading: false });
      sendNavUpdate();
    },
  );
  wc.on("page-title-updated", (_event, title) => {
    updateNavigationState(workspaceId, { title });
    sendNavUpdate();
  });

  wc.on("console-message", (_event, level, message, _line, sourceId) => {
    const session = getBrowserSession(workspaceId);
    const annotationPrefix = session?.annotationNonce
      ? `__STAVE_ANN__${session.annotationNonce}`
      : null;
    if (annotationPrefix && message.startsWith(annotationPrefix)) {
      try {
        const payload = JSON.parse(message.slice(annotationPrefix.length)) as
          | Omit<LensAnnotationEventPayload, "workspaceId">
          | null;
        if (payload?.type) {
          sendAnnotationEvent({
            workspaceId,
            ...payload,
          } as LensAnnotationEventPayload);
        }
      } catch {
        sendAnnotationEvent({ workspaceId, type: "clear" });
      }
      return;
    }

    const levelMap: Record<number, BrowserConsoleEntry["level"]> = {
      0: "debug",
      1: "log",
      2: "warn",
      3: "error",
    };
    pushConsoleEntry(workspaceId, {
      level: levelMap[level] ?? "log",
      text: message,
      timestamp: toIso(),
      source: sourceId,
    });
  });
}

export function ensureBrowserSessionWithEvents(
  workspaceId: string,
  options?: { managedByMcp?: boolean },
): {
  session: BrowserSessionState;
  created: boolean;
} {
  const existing = getBrowserSession(workspaceId);
  if (existing) {
    return { session: existing, created: false };
  }

  const session = createBrowserSession(workspaceId);
  session.managedByMcp = options?.managedByMcp === true;
  attachBrowserSessionEventListeners(workspaceId, session.view.webContents);
  return { session, created: true };
}

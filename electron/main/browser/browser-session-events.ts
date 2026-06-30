import type {
  BrowserConsoleEntry,
  LensAnnotation,
  LensAnnotationEventPayload,
  LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";
import {
  browserSessionUsesProfile,
  createBrowserSession,
  getBrowserSession,
  pushConsoleEntry,
  updateNavigationState,
  type BrowserSessionState,
} from "./browser-manager";
import { getAnnotationOverlayScript } from "./browser-annotation-overlay";
import { getBoxInspectScript } from "./browser-box-inspect";
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
  let initialAnnotations: LensAnnotation[] = [];
  try {
    initialAnnotations = await wc.executeJavaScript(
      "window.__staveGetAnnotations?.() ?? []",
    );
  } catch {
    initialAnnotations = [];
  }
  if (initialAnnotations.length === 0) {
    initialAnnotations = session.annotations;
  }
  await wc.executeJavaScript(
    getAnnotationOverlayScript({
      extractDebugSource: session.annotationExtractDebugSource,
      initialAnnotations,
      nonce: session.annotationNonce,
    }),
  );
}

export async function injectBoxInspectOverlay(
  workspaceId: string,
  wc: Electron.WebContents,
): Promise<void> {
  const session = getBrowserSession(workspaceId);
  if (!session?.boxInspectActive) {
    return;
  }
  await wc.executeJavaScript(getBoxInspectScript());
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
    void injectBoxInspectOverlay(workspaceId, wc).catch((error) => {
      pushConsoleEntry(workspaceId, {
        level: "warn",
        text: `Box inspect overlay reinjection failed: ${
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

  wc.on("console-message", (_event, level, message, lineNumber, sourceId) => {
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
          if (
            (payload.type === "add" || payload.type === "update") &&
            payload.annotation
          ) {
            session.annotations = [
              ...session.annotations.filter(
                (annotation) => annotation.id !== payload.annotation?.id,
              ),
              payload.annotation,
            ].sort((left, right) => left.pin - right.pin);
          } else if (payload.type === "remove" && payload.annotation) {
            session.annotations = session.annotations.filter(
              (annotation) => annotation.id !== payload.annotation?.id,
            );
          } else if (payload.type === "submit" && payload.annotations) {
            session.annotations = payload.annotations;
          } else if (payload.type === "clear") {
            session.annotations = [];
          }
          sendAnnotationEvent({
            workspaceId,
            ...payload,
          } as LensAnnotationEventPayload);
        }
      } catch {
        pushConsoleEntry(workspaceId, {
          level: "warn",
          text: "Ignored malformed Lens annotation event.",
          timestamp: toIso(),
          source: "lens",
        });
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
      lineNumber,
    });
  });
}

export function ensureBrowserSessionWithEvents(
  workspaceId: string,
  options?: { managedByMcp?: boolean } & Omit<
    LensSessionProfileArgs,
    "workspaceId"
  >,
): {
  session: BrowserSessionState;
  created: boolean;
} {
  const existing = getBrowserSession(workspaceId);
  if (
    existing &&
    browserSessionUsesProfile(workspaceId, {
      sessionScope: options?.sessionScope,
      projectKey: options?.projectKey,
    })
  ) {
    return { session: existing, created: false };
  }

  const session = createBrowserSession(workspaceId, {
    sessionScope: options?.sessionScope,
    projectKey: options?.projectKey,
  });
  session.managedByMcp = options?.managedByMcp === true;
  attachBrowserSessionEventListeners(workspaceId, session.view.webContents);
  return { session, created: true };
}

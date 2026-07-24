import {
  DEFAULT_LENS_SESSION_ID,
  type BrowserConsoleEntry,
  type LensAnnotation,
  type LensAnnotationEventPayload,
  type LensSessionProfileArgs,
  type LensStateChangedPayload,
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
import { fillLensCredentialForWebContents } from "./lens-credential-service";
import { getMainWindow } from "../window";

function toIso(): string {
  return new Date().toISOString();
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
  const session = getBrowserSession(workspaceId, lensSessionId);
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
  lensSessionId?: string,
): Promise<void> {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session?.boxInspectActive) {
    return;
  }
  await wc.executeJavaScript(getBoxInspectScript());
}

export function attachBrowserSessionEventListeners(
  workspaceId: string,
  wc: Electron.WebContents,
  lensSessionId: string = DEFAULT_LENS_SESSION_ID,
) {
  const sendNavUpdate = () => {
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

  wc.on("did-navigate", () => {
    // New document: drop the previous page's favicon until the new page
    // reports one via page-favicon-updated.
    updateNavigationState(
      workspaceId,
      { faviconUrl: undefined },
      lensSessionId,
    );
    sendNavUpdate();
  });
  wc.on("did-navigate-in-page", sendNavUpdate);
  wc.on("did-start-loading", () => {
    updateNavigationState(workspaceId, { isLoading: true }, lensSessionId);
    sendNavUpdate();
  });
  wc.on("did-stop-loading", () => {
    updateNavigationState(workspaceId, { isLoading: false }, lensSessionId);
    sendNavUpdate();
    void injectAnnotationOverlay(workspaceId, wc, lensSessionId).catch(
      (error) => {
        pushConsoleEntry(
          workspaceId,
          {
            level: "warn",
            text: `Annotation overlay reinjection failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            timestamp: toIso(),
            source: wc.getURL(),
          },
          lensSessionId,
        );
      },
    );
    void injectBoxInspectOverlay(workspaceId, wc, lensSessionId).catch(
      (error) => {
        pushConsoleEntry(
          workspaceId,
          {
            level: "warn",
            text: `Box inspect overlay reinjection failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            timestamp: toIso(),
            source: wc.getURL(),
          },
          lensSessionId,
        );
      },
    );
    setTimeout(() => {
      if (wc.isDestroyed()) {
        return;
      }
      void fillLensCredentialForWebContents(wc, {
        autoFillOnly: true,
      })
        .then((result) => {
          if (!result.ok) {
            return;
          }
          pushConsoleEntry(
            workspaceId,
            {
              level: "info",
              text: `Filled the saved Lens account for ${result.host}.`,
              timestamp: toIso(),
              source: wc.getURL(),
            },
            lensSessionId,
          );
        })
        .catch((error) => {
          pushConsoleEntry(
            workspaceId,
            {
              level: "warn",
              text: `Saved Lens account fill failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
              timestamp: toIso(),
              source: wc.getURL(),
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
      pushConsoleEntry(
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
    updateNavigationState(workspaceId, { title }, lensSessionId);
    sendNavUpdate();
  });
  wc.on("page-favicon-updated", (_event, favicons) => {
    const faviconUrl = favicons.find((candidate) =>
      /^https?:/i.test(candidate),
    );
    updateNavigationState(workspaceId, { faviconUrl }, lensSessionId);
    sendNavUpdate();
  });

  wc.on("console-message", (_event, level, message, lineNumber, sourceId) => {
    const session = getBrowserSession(workspaceId, lensSessionId);
    const annotationPrefix = session?.annotationNonce
      ? `__STAVE_ANN__${session.annotationNonce}`
      : null;
    if (session && annotationPrefix && message.startsWith(annotationPrefix)) {
      try {
        const payload = JSON.parse(
          message.slice(annotationPrefix.length),
        ) as Omit<LensAnnotationEventPayload, "workspaceId"> | null;
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
            lensSessionId,
          } as LensAnnotationEventPayload);
        }
      } catch {
        pushConsoleEntry(
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

    const levelMap: Record<number, BrowserConsoleEntry["level"]> = {
      0: "debug",
      1: "log",
      2: "warn",
      3: "error",
    };
    pushConsoleEntry(
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
  });
}

export function ensureBrowserSessionWithEvents(
  workspaceId: string,
  options?: {
    managedByMcp?: boolean;
    lensSessionId?: string;
    /** Keep a live session intact while a renderer tab adopts it. */
    reuseExisting?: boolean;
  } & Omit<LensSessionProfileArgs, "workspaceId">,
): {
  session: BrowserSessionState;
  created: boolean;
} {
  const lensSessionId = options?.lensSessionId ?? DEFAULT_LENS_SESSION_ID;
  const existing = getBrowserSession(workspaceId, lensSessionId);
  if (
    existing &&
    (options?.reuseExisting === true ||
      browserSessionUsesProfile(
        workspaceId,
        {
          sessionScope: options?.sessionScope,
          projectKey: options?.projectKey,
        },
        lensSessionId,
      ))
  ) {
    return { session: existing, created: false };
  }

  const session = createBrowserSession(workspaceId, {
    sessionScope: options?.sessionScope,
    projectKey: options?.projectKey,
    lensSessionId,
  });
  session.managedByMcp = options?.managedByMcp === true;
  attachBrowserSessionEventListeners(
    workspaceId,
    session.view.webContents,
    session.lensSessionId,
  );
  return { session, created: true };
}

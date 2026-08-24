import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { toast } from "@/components/ui";
import { matchesSession } from "@/lib/lens/lens-log-format";
import {
  type BrowserNavigationEventPayload,
  type BrowserNavigationState,
  type LensAnnotation,
  type LensSessionScope,
} from "@/lib/lens/lens.types";
import type { LensSurfaceHostHandle } from "@/components/panes/surfaces/lens/useLensSurfaceHost";
import { useAppStore } from "@/store/app.store";

export const DEFAULT_LENS_NAVIGATION_STATE: BrowserNavigationState = {
  url: "about:blank",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

/** Everything main reports about a session that other features have to adopt. */
export type LensRestoredSessionState = {
  annotationModeActive: boolean;
  boxInspectModeActive: boolean;
};

export type LensSessionHandle = {
  url: string;
  inputUrl: string;
  setInputUrl: (value: string) => void;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  onSubmit: (event: FormEvent) => void;
  onUrlKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  urlInputRef: RefObject<HTMLInputElement | null>;
  isUrlInputFocused: RefObject<boolean>;
  /** Last navigation failure, cleared whenever a load starts. */
  lastLoadError: string | null;
  setLastLoadError: Dispatch<SetStateAction<string | null>>;
};

/**
 * Session identity for one Lens tab: opening it, closing it, and the address
 * it is on.
 *
 * Split out from the surface host on purpose. The two used to be one effect,
 * which meant the panel had to know both that a session had opened *and* what
 * presenting it involved — so the host handle carried presentation steps for
 * the panel to sequence by hand. Here the effect states the dependency it
 * actually has: a guest now exists, so attach it. What attaching costs is the
 * host's business.
 *
 * Opening is idempotent (`openSession` reuses a live session, so re-showing a
 * hidden tab or remounting the panel restores the same page). Teardown
 * detaches unconditionally but destroys the session only when its tab is gone
 * from the same workspace: hidden is not closed, and Lens tabs survive
 * workspace switches and layout churn.
 */
export function useLensSession(args: {
  workspaceId: string;
  lensSessionId: string;
  hasLensApi: boolean;
  /** False once the tab has left the store, including via Dockview-side paths. */
  isTabOpen: boolean;
  lensSessionScope: LensSessionScope;
  projectPath: string | null;
  surface: LensSurfaceHostHandle;
  /**
   * Clear every per-generation feature state. Must be synchronous: it runs
   * before any IPC is issued and is what guarantees a stale generation's async
   * replies cannot be mistaken for the new one's.
   */
  onSessionReset: () => void;
  /** Adopt the overlay-mode flags main reports for an already-live session. */
  onSessionRestored: (state: LensRestoredSessionState) => void;
  /** Adopt annotations main already holds for the page being restored. */
  onAnnotationsRestored: (annotations: LensAnnotation[]) => void;
}): LensSessionHandle {
  const {
    workspaceId,
    lensSessionId,
    hasLensApi,
    isTabOpen,
    lensSessionScope,
    projectPath,
    surface,
    onSessionReset,
    onSessionRestored,
    onAnnotationsRestored,
  } = args;

  const urlInputRef = useRef<HTMLInputElement>(null);
  // Track whether the URL address bar is focused so navigation events don't
  // clobber text the user is actively editing.
  const isUrlInputFocused = useRef(false);

  const [url, setUrl] = useState(DEFAULT_LENS_NAVIGATION_STATE.url);
  const [inputUrl, setInputUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);

  const applyNavigationState = useCallback((state: BrowserNavigationState) => {
    setUrl(state.url);
    // Only sync the input field when the user is not actively typing in it.
    // Without this guard, in-progress SPA redirects would erase partially typed URLs.
    if (!isUrlInputFocused.current) {
      setInputUrl(state.url === "about:blank" ? "" : state.url);
    }
    setIsLoading(state.isLoading);
    if (state.isLoading) {
      setLastLoadError(null);
    }
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }, []);

  // The reset callbacks are read through a ref so a caller may pass inline
  // closures without re-running the lifecycle effect, which would tear a live
  // session down and reopen it on every render.
  const callbacksRef = useRef({
    onSessionReset,
    onSessionRestored,
    onAnnotationsRestored,
  });
  callbacksRef.current = {
    onSessionReset,
    onSessionRestored,
    onAnnotationsRestored,
  };

  const { attachGuest, detachGuest } = surface;

  useEffect(() => {
    callbacksRef.current.onSessionReset();
    // Not covered by `applyNavigationState`: a load that is not in progress is
    // not the same as a load that never failed.
    setLastLoadError(null);
    applyNavigationState(DEFAULT_LENS_NAVIGATION_STATE);

    if (!workspaceId || !isTabOpen || !hasLensApi) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const lensApi = window.api?.lens;
      const openResult = lensApi?.openSession
        ? await lensApi.openSession({
            workspaceId,
            lensSessionId,
            sessionScope: lensSessionScope,
            projectKey: projectPath,
          })
        : await lensApi?.createView?.({
            workspaceId,
            lensSessionId,
            sessionScope: lensSessionScope,
            projectKey: projectPath,
          });
      if (cancelled || !openResult?.ok) {
        if (!cancelled && openResult && !openResult.ok) {
          toast.error("Lens failed to start", {
            description:
              openResult.message ??
              "Could not create the embedded browser view.",
          });
        }
        return;
      }

      await attachGuest();

      const stateResult = await lensApi?.getState?.({
        workspaceId,
        lensSessionId,
      });
      if (!cancelled && stateResult?.ok && stateResult.state) {
        applyNavigationState(stateResult.state);
        callbacksRef.current.onSessionRestored({
          annotationModeActive: Boolean(stateResult.annotationModeActive),
          boxInspectModeActive: Boolean(stateResult.boxInspectModeActive),
        });
      }

      const annotationsResult = await lensApi?.getAnnotations?.({
        workspaceId,
        lensSessionId,
      });
      if (!cancelled && annotationsResult?.ok) {
        callbacksRef.current.onAnnotationsRestored(
          annotationsResult.annotations ?? [],
        );
      }
    })();

    return () => {
      cancelled = true;
      detachGuest();
      // Hidden ≠ closed: the session survives unmounts (workspace switches,
      // layout churn). Destroy it only when its tab is gone from the SAME
      // workspace — this also covers close paths that bypassed
      // `closePaneSurface` (Dockview-initiated removal, ⌘W in AppShell).
      const store = useAppStore.getState();
      if (
        store.activeWorkspaceId === workspaceId &&
        !store.lensTabs.some((tab) => tab.id === lensSessionId)
      ) {
        void window.api?.lens
          ?.closeSession?.({ workspaceId, lensSessionId })
          .catch(() => {
            // Best-effort teardown; the main process reaps on workspace dispose.
          });
      }
    };
  }, [
    applyNavigationState,
    attachGuest,
    detachGuest,
    hasLensApi,
    isTabOpen,
    lensSessionId,
    lensSessionScope,
    projectPath,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeNavigationEvents?.(
      (payload: BrowserNavigationEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        applyNavigationState(payload.state);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [applyNavigationState, hasLensApi, lensSessionId, workspaceId]);

  const navigate = useCallback(
    async (targetUrl: string) => {
      if (!workspaceId || !targetUrl.trim()) {
        return;
      }
      if (!hasLensApi) {
        toast.error("Lens is unavailable", {
          description:
            "The embedded browser only works in the Electron desktop runtime.",
        });
        return;
      }

      const result = await window.api?.lens?.navigate?.({
        workspaceId,
        lensSessionId,
        url: targetUrl.trim(),
      });

      if (result && !result.ok) {
        toast.error("Navigation failed", {
          description: result.message ?? "Lens could not load that address.",
        });
      }
    },
    [hasLensApi, lensSessionId, workspaceId],
  );

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void navigate(inputUrl);
      urlInputRef.current?.blur();
    },
    [inputUrl, navigate],
  );

  const onUrlKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setInputUrl(url === "about:blank" ? "" : url);
        urlInputRef.current?.blur();
      }
    },
    [url],
  );

  const goBack = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goBack?.({ workspaceId, lensSessionId });
    }
  }, [lensSessionId, workspaceId]);

  const goForward = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.goForward?.({ workspaceId, lensSessionId });
    }
  }, [lensSessionId, workspaceId]);

  const reload = useCallback(() => {
    if (workspaceId) {
      void window.api?.lens?.reload?.({ workspaceId, lensSessionId });
    }
  }, [lensSessionId, workspaceId]);

  return {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    inputUrl,
    isLoading,
    isUrlInputFocused,
    lastLoadError,
    onSubmit,
    onUrlKeyDown,
    reload,
    setInputUrl,
    setLastLoadError,
    url,
    urlInputRef,
  };
}

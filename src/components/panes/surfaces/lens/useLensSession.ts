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
import type { LensSurfaceHostHandle } from "@/components/panes/surfaces/lens/lens-surface-host";
import { useAppStore } from "@/store/app.store";

/** Most automatic rebuilds a session may draw before it stops trying. */
const MAX_REBUILD_ATTEMPTS = 4;
/** How long a session must stay open before its rebuild budget resets. */
const STABLE_MS = 4_000;

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
  /*
   * Bumped when this session has to be rebuilt from scratch.
   *
   * A Lens session can end without its tab ending: a guest page crashing, an
   * agent force-closing it, or teardown from a panel generation that raced a
   * remount. The tab and its pane survive all three, and before this the panel
   * simply sat there — mounted, sessionless, with no path back short of closing
   * and reopening the tab by hand.
   */
  const [sessionGeneration, setSessionGeneration] = useState(0);

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

  // The panel's own truth about whether its tab still exists, read from the
  // latest render. Recovery keys on this rather than a store snapshot: during
  // workspace hydration `lensTabs` is replaced in a separate commit from
  // `activeWorkspaceId`, so a store read taken on a timer can momentarily see
  // this tab missing when it is not.
  const isTabOpenRef = useRef(isTabOpen);
  isTabOpenRef.current = isTabOpen;

  /*
   * One bounded budget for *every* automatic rebuild of this session, whether
   * the trigger was a failed open or a session that opened and then died.
   *
   * Both need a circuit breaker and they must share one, because the dangerous
   * case is a page that loads and immediately crashes: each crash emits
   * `lens:session-closed`, recovery rebuilds, the rebuild opens fine, and the
   * page crashes again — an unbounded open/destroy loop if success alone reset
   * the count. So the count is reset not on success but after the session has
   * stayed open a while (`STABLE_MS`); a session that never survives that long
   * exhausts the budget and stops with a toast instead of churning forever.
   */
  const rebuildAttemptsRef = useRef(0);
  /** Pending rebuild/stability timers, cleared when the effect re-runs. */
  const rebuildTimersRef = useRef(new Set<number>());
  const stableResetTimerRef = useRef<number | null>(null);

  const scheduleRebuild = useCallback((delayMs: number): boolean => {
    if (
      !isTabOpenRef.current ||
      rebuildAttemptsRef.current >= MAX_REBUILD_ATTEMPTS
    ) {
      return false;
    }
    rebuildAttemptsRef.current += 1;
    const timer = window.setTimeout(() => {
      rebuildTimersRef.current.delete(timer);
      if (isTabOpenRef.current) {
        setSessionGeneration((generation) => generation + 1);
      }
    }, delayMs);
    rebuildTimersRef.current.add(timer);
    return true;
  }, []);

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
      // No fallback path. `openSession` resolves only once main has a live
      // guest bound for this session, which is the dependency the attach below
      // states; anything that opened a session some other way would be opening
      // a different kind of surface.
      const openResult = await lensApi?.openSession?.({
        workspaceId,
        lensSessionId,
        sessionScope: lensSessionScope,
        projectKey: projectPath,
      });
      if (cancelled) {
        return;
      }
      if (!openResult?.ok) {
        // Back off a little more each attempt; the budget is shared with the
        // crash-recovery path below.
        if (scheduleRebuild(150 * (rebuildAttemptsRef.current + 1))) {
          return;
        }
        toast.error("Lens failed to start", {
          description:
            openResult?.message ??
            "Could not create the embedded browser view.",
        });
        return;
      }

      // Do not reset the budget yet: a session that opens and dies immediately
      // must keep drawing it down. Reset only once it has stayed open.
      if (stableResetTimerRef.current !== null) {
        window.clearTimeout(stableResetTimerRef.current);
      }
      stableResetTimerRef.current = window.setTimeout(() => {
        stableResetTimerRef.current = null;
        rebuildAttemptsRef.current = 0;
      }, STABLE_MS);

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

      // Drop any rebuild timers queued for this generation; the fresh effect
      // run (or the unmount) supersedes them. The stability-reset timer goes
      // too — a stale reset must not zero the budget mid-churn.
      for (const timer of rebuildTimersRef.current) {
        window.clearTimeout(timer);
      }
      rebuildTimersRef.current.clear();
      if (stableResetTimerRef.current !== null) {
        window.clearTimeout(stableResetTimerRef.current);
        stableResetTimerRef.current = null;
      }

      /*
       * Hidden is not closed: the session survives unmounts — workspace
       * switches, layout churn, a Dockview group being rebuilt. It is destroyed
       * only when its tab is really gone from this workspace, which also covers
       * the close paths that bypass `closePaneSurface` (Dockview-initiated
       * removal, ⌘W in AppShell).
       *
       * Asked on the next macrotask rather than here, because "gone" and
       * "briefly absent" look identical at unmount time. Workspace hydration
       * replaces `lensTabs` and `activeWorkspaceId` in separate commits, so a
       * panel unmounting inside that window sees its own tab missing from a
       * store that is about to have it back — and closes a session another
       * panel is at that moment opening. The next tick is after the store has
       * settled, and by then the two cases are distinguishable.
       */
      window.setTimeout(() => {
        const store = useAppStore.getState();
        if (
          store.activeWorkspaceId !== workspaceId ||
          store.lensTabs.some((tab) => tab.id === lensSessionId)
        ) {
          return;
        }
        void window.api?.lens
          ?.closeSession?.({ workspaceId, lensSessionId })
          .catch(() => {
            // Best-effort teardown; the main process reaps on workspace dispose.
          });
      }, 0);
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
    scheduleRebuild,
    sessionGeneration,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi || !isTabOpen) {
      return;
    }

    const unsubscribe = window.api?.lens?.subscribeSessionClosed?.((payload) => {
      if (!matchesSession(payload, workspaceId, lensSessionId)) {
        return;
      }
      /*
       * A session ended under a tab that is still open — a crashed guest, an
       * agent force-close, or a teardown from a panel generation that raced
       * this one's remount. Rebuild it, through the shared bounded budget: the
       * panel is still here, so leaving it sessionless would strand it, but a
       * page that dies on every load must not loop forever.
       *
       * Deferred one macrotask so a genuine tab close (which fires this event
       * too, just before the tab leaves) settles first: by the next tick this
       * panel has either unmounted or confirmed, through its own prop, that its
       * tab is still open. A `setTimeout(0)` inside `scheduleRebuild` provides
       * that same settle.
       */
      if (!scheduleRebuild(0) && isTabOpenRef.current) {
        toast.error("Lens keeps closing", {
          description:
            "The page ended repeatedly right after opening. Reload the tab to try again.",
        });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [hasLensApi, isTabOpen, lensSessionId, scheduleRebuild, workspaceId]);

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

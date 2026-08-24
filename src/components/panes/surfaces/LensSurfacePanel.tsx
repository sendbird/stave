import type { IDockviewPanelProps } from "dockview-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { Loader2, ScanSearch } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  TooltipProvider,
  toast,
} from "@/components/ui";
import {
  type BrowserNavigationEventPayload,
  type BrowserNavigationState,
  type LensDownloadEntry,
  type LensDownloadEventPayload,
  type LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  matchesSession,
  mergeDownloadEntry,
  type LensPanelTab,
} from "@/lib/lens/lens-log-format";
import { LensChrome } from "@/components/panes/surfaces/lens/LensChrome";
import { LensConsoleWorkbench } from "@/components/panes/surfaces/lens/LensConsoleWorkbench";
import { LensNetworkWorkbench } from "@/components/panes/surfaces/lens/LensNetworkWorkbench";
import { useLensAnnotationSync } from "@/components/panes/surfaces/lens/useLensAnnotationSync";
import { useLensDiagnosticsLog } from "@/components/panes/surfaces/lens/useLensDiagnosticsLog";
import { useLensOverlayModes } from "@/components/panes/surfaces/lens/useLensOverlayModes";
import { useLensSurfaceHost } from "@/components/panes/surfaces/lens/useLensSurfaceHost";
import { parsePanePanelId } from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";

const DEFAULT_NAVIGATION_STATE: BrowserNavigationState = {
  url: "about:blank",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

/**
 * Dockview panel wrapper for one lens (embedded browser) session. The panel
 * id encodes the lensSessionId; every `window.api.lens.*` call below is
 * scoped to that session so multiple lens tabs can coexist (and even be
 * visible simultaneously in separate groups).
 */
export function LensSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "lens") {
    return null;
  }
  return (
    <LensSessionSurface
      key={surface.lensSessionId}
      lensSessionId={surface.lensSessionId}
      panelApi={props.api}
    />
  );
}

function LensSessionSurface(args: {
  lensSessionId: string;
  panelApi: IDockviewPanelProps["api"];
}) {
  const { lensSessionId, panelApi } = args;
  // Keep the store subscription primitive-only. Returning a nested object here
  // causes a fresh selector snapshot on every render, which can trigger React
  // 19 ref/update loops on tooltip-heavy surfaces like Lens.
  const [
    workspaceId,
    projectPath,
    activeTaskId,
    lensSourceMappingHeuristic,
    lensSourceMappingReactDebugSource,
    lensSessionScope,
    visualCommentShortcut,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.projectPath,
          state.activeTaskId,
          state.settings.lensSourceMappingHeuristic,
          state.settings.lensSourceMappingReactDebugSource,
          state.settings.lensSessionScope,
          state.settings.visualCommentShortcut,
        ] as const,
    ),
  );
  // Whether this session's tab still exists in the store. It flips to false
  // when the tab is closed (possibly via a path that bypassed
  // `closePaneSurface`), which is the cue to tear down the backing session.
  const isTabOpen = useAppStore(
    useCallback(
      (state) => state.lensTabs.some((tab) => tab.id === lensSessionId),
      [lensSessionId],
    ),
  );

  const sourceMappingConfig = useMemo(
    () =>
      ({
        heuristic: lensSourceMappingHeuristic,
        reactDebugSource: lensSourceMappingReactDebugSource,
      }) satisfies LensSourceMappingConfig,
    [lensSourceMappingHeuristic, lensSourceMappingReactDebugSource],
  );

  const hasLensApi = Boolean(window.api?.lens);

  const urlInputRef = useRef<HTMLInputElement>(null);
  // Track whether the URL address bar is focused so navigation events don't
  // clobber text the user is actively editing.
  const isUrlInputFocused = useRef(false);

  const [url, setUrl] = useState(DEFAULT_NAVIGATION_STATE.url);
  const [inputUrl, setInputUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [downloads, setDownloads] = useState<LensDownloadEntry[]>([]);
  const [lensPanelTab, setLensPanelTab] = useState<LensPanelTab>("preview");
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);

  const applyNavigationState = useCallback((state: BrowserNavigationState) => {
    setUrl(state.url);
    // Only sync the input field when the user is not actively typing in it.
    // Without this guard, in-progress SPA redirects would erase partially typed URLs.
    if (!isUrlInputFocused.current) {
      setInputUrl(state.url === "about:blank" ? "" : state.url);
    }
    setTitle(state.title);
    setIsLoading(state.isLoading);
    if (state.isLoading) {
      setLastLoadError(null);
    }
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }, []);

  // Annotation data and in-page overlay driving. Both must stay above the
  // session-lifecycle effect below, which resets their state for each session
  // generation and therefore needs their setters. Their effects consequently
  // register before the lifecycle, bounds, and subscription effects — safe for
  // the same reason the diagnostics ordering is: every reset is a synchronous
  // setState while every load these hooks perform is async IPC.
  const { annotations, setAnnotations } = useLensAnnotationSync({
    activeTaskId,
    hasLensApi,
    lensSessionId,
    sourceMappingConfig,
    workspaceId,
  });
  const overlayModes = useLensOverlayModes({
    activeTaskId,
    hasLensApi,
    lensSessionId,
    sourceMappingConfig,
    url,
    visualCommentShortcut,
    workspaceId,
  });
  const {
    isAnnotationModeActive,
    setIsAnnotationModeActive,
    setIsBoxInspectActive,
    toggleAnnotationMode,
  } = overlayModes;

  // Must stay above the session-lifecycle effect below, which resets the
  // diagnostics state and pause buffers and therefore needs this hook's
  // setters. The diagnostics effects consequently run before the surface-host
  // bounds and visibility effects and before the subscription effects below.
  // That is safe because the lifecycle reset is synchronous while every
  // diagnostics load is async IPC: the reset always commits before a load
  // resolves, so both orderings converge on the same final state. Preserve
  // this invariant.
  const diagnostics = useLensDiagnosticsLog({
    hasLensApi,
    lensPanelTab,
    lensSessionId,
    setLastLoadError,
    url,
    workspaceId,
  });
  const {
    consoleBufferedCount,
    consoleEntries,
    consolePausedBufferRef,
    consolePausedRef,
    networkBufferedCount,
    networkEntries,
    networkPausedBufferRef,
    networkPausedRef,
    setConsoleBufferedCount,
    setConsoleDetailsOpen,
    setConsoleEntries,
    setConsolePaused,
    setNetworkBufferedCount,
    setNetworkDetailsOpen,
    setNetworkEntries,
    setNetworkPaused,
    setSelectedConsoleEntryId,
    setSelectedNetworkEntryId,
  } = diagnostics;

  // Native-surface placement: bounds mirroring, visibility suppression, and the
  // key round-trip that only exist because the guest composites above the whole
  // renderer. `useLensSurfaceHost` is the intended swap point for that.
  const {
    collapseSurface,
    getIsSuppressed,
    markSurfaceReady,
    placeholderRef,
    releaseSurface,
    requestBoundsSync,
    resetSurfaceTracking,
    setFloatingSurfaceOpen,
  } = useLensSurfaceHost({
    annotationCount: annotations.length,
    hasLensApi,
    isAnnotationModeActive,
    lensPanelTab,
    lensSessionId,
    onVisualCommentShortcut: toggleAnnotationMode,
    panelApi,
    visualCommentShortcut,
    workspaceId,
  });

  // Session lifecycle. Opening is idempotent (`openSession` reuses a live
  // session, so re-showing a hidden tab or remounting the panel restores the
  // same page). The cleanup only hides the native view; the session itself is
  // destroyed exclusively when its tab has been removed from the store.
  useEffect(() => {
    resetSurfaceTracking();
    setAnnotations([]);
    setIsAnnotationModeActive(false);
    setIsBoxInspectActive(false);
    setConsoleEntries([]);
    setNetworkEntries([]);
    setSelectedConsoleEntryId(null);
    setSelectedNetworkEntryId(null);
    setConsoleDetailsOpen(false);
    setNetworkDetailsOpen(false);
    consolePausedRef.current = false;
    networkPausedRef.current = false;
    consolePausedBufferRef.current = [];
    networkPausedBufferRef.current = [];
    setConsolePaused(false);
    setNetworkPaused(false);
    setConsoleBufferedCount(0);
    setNetworkBufferedCount(0);
    setLastLoadError(null);
    setLensPanelTab("preview");

    applyNavigationState(DEFAULT_NAVIGATION_STATE);

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

      markSurfaceReady();
      await lensApi?.setVisible?.({
        workspaceId,
        lensSessionId,
        visible: !getIsSuppressed(),
      });

      const stateResult = await lensApi?.getState?.({
        workspaceId,
        lensSessionId,
      });
      if (!cancelled && stateResult?.ok && stateResult.state) {
        applyNavigationState(stateResult.state);
        setIsAnnotationModeActive(Boolean(stateResult.annotationModeActive));
        setIsBoxInspectActive(Boolean(stateResult.boxInspectModeActive));
      }

      const annotationsResult = await lensApi?.getAnnotations?.({
        workspaceId,
        lensSessionId,
      });
      if (!cancelled && annotationsResult?.ok) {
        setAnnotations(annotationsResult.annotations ?? []);
      }

      if (getIsSuppressed()) {
        await collapseSurface();
        return;
      }

      requestBoundsSync();
    })();

    return () => {
      cancelled = true;
      releaseSurface();
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
    collapseSurface,
    getIsSuppressed,
    hasLensApi,
    isTabOpen,
    lensSessionId,
    lensSessionScope,
    markSurfaceReady,
    projectPath,
    releaseSurface,
    requestBoundsSync,
    resetSurfaceTracking,
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

  useEffect(() => {
    setDownloads([]);
    if (!workspaceId || !hasLensApi) {
      return;
    }

    let cancelled = false;
    void window.api?.lens
      ?.listDownloads?.({ workspaceId, lensSessionId })
      .then((result) => {
        if (!cancelled && result?.ok && result.entries) {
          setDownloads(result.entries.slice(-20));
        }
      });

    const unsubscribe = window.api?.lens?.subscribeDownloadEvents?.(
      (payload: LensDownloadEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }
        setDownloads((current) => mergeDownloadEntry(current, payload.entry));
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hasLensApi, lensSessionId, workspaceId]);

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

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void navigate(inputUrl);
      urlInputRef.current?.blur();
    },
    [inputUrl, navigate],
  );

  const handleUrlKeyDown = useCallback(
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

  const saveScreenshot = useCallback(
    async (fullPage: boolean) => {
      if (!workspaceId || !hasLensApi) {
        return;
      }

      const result = await window.api?.lens?.saveScreenshot?.({
        workspaceId,
        lensSessionId,
        options: { fullPage },
      });

      if (!result?.ok) {
        toast.error("Screenshot failed", {
          description: result?.message ?? "Lens could not save the screenshot.",
        });
        return;
      }

      toast.success("Screenshot saved", {
        description: result.path,
      });
    },
    [hasLensApi, lensSessionId, workspaceId],
  );

  const downloadPageAssets = useCallback(async () => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const result = await window.api?.lens?.downloadPageAssets?.({
      workspaceId,
      lensSessionId,
    });

    if (!result?.ok) {
      toast.error("Download failed", {
        description: result?.message ?? "Lens could not download page assets.",
      });
      return;
    }

    const count = result.entries?.length ?? 0;
    const failed = result.errors?.length ?? 0;
    toast.success("Page assets downloaded", {
      description:
        failed > 0
          ? `${count} saved, ${failed} skipped.`
          : `${count} asset${count === 1 ? "" : "s"} saved.`,
    });
  }, [hasLensApi, lensSessionId, workspaceId]);

  const openDownloadInFinder = useCallback((savePath: string) => {
    void window.api?.shell?.showInFinder?.({ path: savePath });
  }, []);

  const lensPageActionDisabled = !hasLensApi || url === "about:blank";

  return (
    <TooltipProvider delay={120}>
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar/20"
        data-testid="lens-surface-panel"
        data-lens-session-id={lensSessionId}
      >
        <LensChrome
          capture={{
            downloadPageAssets,
            downloads,
            openDownloadInFinder,
            saveScreenshot,
          }}
          consoleEntryCount={consoleEntries.length + consoleBufferedCount}
          hasLensApi={hasLensApi}
          lensPageActionDisabled={lensPageActionDisabled}
          navigation={{
            canGoBack,
            canGoForward,
            goBack,
            goForward,
            inputUrl,
            isLoading,
            isUrlInputFocused,
            onSubmit: handleSubmit,
            onUrlKeyDown: handleUrlKeyDown,
            reload,
            setInputUrl,
            url,
            urlInputRef,
          }}
          networkEntryCount={networkEntries.length + networkBufferedCount}
          onFloatingSurfaceOpenChange={setFloatingSurfaceOpen}
          onPanelTabChange={setLensPanelTab}
          overlayModes={overlayModes}
          panelTab={lensPanelTab}
        />

        {/*
          Carries the page background so the split gutters reserved around the
          native view read as part of the page rather than as a seam.
        */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          {lensPanelTab === "preview" ? (
            <>
              {/*
                Measured rectangle for the native browser view. Its inset is
                shrunk by `data-lens-split-gutters` (see `src/globals.css`) so
                the native surface never covers Dockview's split separator or
                resize sash.
              */}
              <div
                ref={placeholderRef}
                data-lens-native-view-placeholder=""
                className="absolute inset-0 min-h-0 overflow-hidden bg-background"
              />
              {hasLensApi && isLoading ? (
                <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/70 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" />
                    Loading page
                  </span>
                </div>
              ) : null}
              {hasLensApi && lastLoadError ? (
                <div className="absolute inset-x-3 bottom-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm">
                  {lastLoadError}
                </div>
              ) : null}
              {!hasLensApi ? (
                <div className="absolute inset-0 p-3">
                  <Empty className="h-full justify-center rounded-xl border-border/70 bg-background/70 p-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ScanSearch />
                      </EmptyMedia>
                      <EmptyTitle>Lens needs the desktop runtime</EmptyTitle>
                      <EmptyDescription>
                        The embedded browser is backed by Electron
                        `WebContentsView`, so it is unavailable in browser-only
                        mode.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>
                          Use `bun run dev:desktop` or a packaged desktop build
                          to inspect pages, capture screenshots, and send
                          element context to a task.
                        </p>
                      </div>
                    </EmptyContent>
                  </Empty>
                </div>
              ) : null}
            </>
          ) : lensPanelTab === "console" ? (
            <LensConsoleWorkbench
              diagnostics={diagnostics}
              lensPageActionDisabled={lensPageActionDisabled}
            />
          ) : (
            <LensNetworkWorkbench
              diagnostics={diagnostics}
              lensPageActionDisabled={lensPageActionDisabled}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

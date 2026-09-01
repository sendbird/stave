import type { IDockviewPanelProps } from "dockview-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { TooltipProvider, toast } from "@/components/ui";
import {
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
import { LensPreviewSurface } from "@/components/panes/surfaces/lens/LensPreviewSurface";
import { useLensAnnotationSync } from "@/components/panes/surfaces/lens/useLensAnnotationSync";
import { useLensDiagnosticsLog } from "@/components/panes/surfaces/lens/useLensDiagnosticsLog";
import { useLensOverlayModes } from "@/components/panes/surfaces/lens/useLensOverlayModes";
import {
  useLensSession,
  type LensRestoredSessionState,
} from "@/components/panes/surfaces/lens/useLensSession";
import { useLensDomSurfaceHost } from "@/components/panes/surfaces/lens/useLensDomSurfaceHost";
import { parsePanePanelId } from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";

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

  const [downloads, setDownloads] = useState<LensDownloadEntry[]>([]);
  const [lensPanelTab, setLensPanelTab] = useState<LensPanelTab>("preview");

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
    visualCommentShortcut,
    workspaceId,
  });
  const {
    isAnnotationModeActive,
    setIsAnnotationModeActive,
    setIsBoxInspectActive,
    toggleAnnotationMode,
  } = overlayModes;

  // How the guest page is presented. The panel never learns what presenting
  // costs; it hands this to the session below, which reports when a guest
  // exists.
  const surface = useLensDomSurfaceHost({
    hasLensApi,
    lensPanelTab,
    lensSessionId,
    onVisualCommentShortcut: toggleAnnotationMode,
    panelApi,
    visualCommentShortcut,
    workspaceId,
  });

  // Registered a render-step late, and it has to be. The diagnostics log is
  // keyed on this session's URL, so it cannot be created before
  // `useLensSession` — which means its per-generation reset does not exist yet
  // at that hook's call site. Assigning through a ref during the same render
  // keeps the reset a single synchronous fan-out that runs before any IPC,
  // which is the property the whole reset ordering rests on.
  const resetDiagnosticsRef = useRef<() => void>(() => {});

  const handleSessionReset = useCallback(() => {
    setAnnotations([]);
    setIsAnnotationModeActive(false);
    setIsBoxInspectActive(false);
    resetDiagnosticsRef.current();
    setLensPanelTab("preview");
  }, [setAnnotations, setIsAnnotationModeActive, setIsBoxInspectActive]);

  const handleSessionRestored = useCallback(
    (state: LensRestoredSessionState) => {
      setIsAnnotationModeActive(state.annotationModeActive);
      setIsBoxInspectActive(state.boxInspectModeActive);
    },
    [setIsAnnotationModeActive, setIsBoxInspectActive],
  );

  const session = useLensSession({
    hasLensApi,
    isTabOpen,
    lensSessionId,
    lensSessionScope,
    onAnnotationsRestored: setAnnotations,
    onSessionReset: handleSessionReset,
    onSessionRestored: handleSessionRestored,
    projectPath,
    surface,
    workspaceId,
  });
  const { isLoading, lastLoadError, setLastLoadError, url } = session;

  const diagnostics = useLensDiagnosticsLog({
    hasLensApi,
    lensPanelTab,
    lensSessionId,
    setLastLoadError,
    url,
    workspaceId,
  });
  resetDiagnosticsRef.current = diagnostics.resetForSession;
  const {
    consoleBufferedCount,
    consoleEntries,
    networkBufferedCount,
    networkEntries,
  } = diagnostics;

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
  const pickerDisabled = lensPageActionDisabled || !activeTaskId;
  const pickerTooltip = useMemo(() => {
    if (overlayModes.isPickerActive) {
      return "Pick mode is active. Click an element in the page or press Escape to cancel.";
    }
    if (!hasLensApi) {
      return "Lens is only available in the Electron desktop runtime.";
    }
    if (!activeTaskId) {
      return "Select a task first so Lens can append element context to its draft.";
    }
    if (url === "about:blank") {
      return "Open a page first.";
    }
    return "Pick an element and append a compact selector, style, and source summary to the active task.";
  }, [activeTaskId, hasLensApi, overlayModes.isPickerActive, url]);

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
          navigation={session}
          networkEntryCount={networkEntries.length + networkBufferedCount}
          onFloatingSurfaceOpenChange={surface.setFloatingSurfaceOpen}
          onPanelTabChange={setLensPanelTab}
          overlayModes={overlayModes}
          panelTab={lensPanelTab}
          picker={{ disabled: pickerDisabled, tooltip: pickerTooltip }}
        />

        {/*
          Carries the page background behind the guest, so the moment before a
          page paints reads as part of the page rather than as a hole.
        */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          {lensPanelTab === "preview" ? (
            <LensPreviewSurface
              chromeLayer={surface.chromeLayer}
              hasLensApi={hasLensApi}
              isLoading={isLoading}
              lastLoadError={lastLoadError}
              placeholderRef={surface.placeholderRef}
            />
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

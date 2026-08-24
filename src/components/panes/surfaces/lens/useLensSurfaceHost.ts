import type { IDockviewPanelProps } from "dockview-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  recordLensBoundsSyncLatency,
  recordLensOcclusionObservation,
  setLensSurfaceAttached,
  setLensSurfaceSuppressed,
} from "@/lib/lens/lens-instrumentation";
import { hasLensOccludingFloatingSurface } from "@/lib/lens/lens-occlusion";
import {
  areLensBoundsEqual,
  type LensPanelTab,
} from "@/lib/lens/lens-log-format";
import { type LensBounds } from "@/lib/lens/lens.types";
import { type VisualCommentShortcut } from "@/lib/visual-comment-shortcuts";
import { useLensVisualCommentShortcut } from "@/components/panes/surfaces/lens/useLensVisualCommentShortcut";
import type { LensSurfaceHostHandle } from "@/components/panes/surfaces/lens/lens-surface-host";

export type { LensSurfaceHostHandle };

/**
 * Native-surface host for one Lens session.
 *
 * Electron composites the guest view above the entire window renderer, so React
 * chrome can never paint over a Lens preview: the only way to show a dropdown,
 * dialog, tooltip or toast on top of it is to hide the guest for as long as
 * that chrome is up. None of this is Lens product behavior — every ref, effect
 * and callback below exists only to simulate stacking that the compositing
 * primitive cannot express:
 *
 * - mirroring the placeholder's CSS-pixel rectangle onto the guest's bounds,
 * - suppressing the guest while the panel is hidden, an overlapping floating
 *   surface is up, or a non-preview tab is showing,
 * - detecting those occluding floating surfaces in the renderer,
 * - and round-tripping app shortcuts the guest swallows while it holds focus.
 *
 * This module is the intended swap point. Once the guest is a DOM element the
 * whole set above is deleted rather than ported, and the panel keeps talking to
 * the same handle.
 */
export function useLensSurfaceHost(args: {
  workspaceId: string;
  lensSessionId: string;
  hasLensApi: boolean;
  panelApi: IDockviewPanelProps["api"];
  lensPanelTab: LensPanelTab;
  /** Panel state that changes the placeholder's rectangle. */
  annotationCount: number;
  isAnnotationModeActive: boolean;
  visualCommentShortcut: VisualCommentShortcut;
  onVisualCommentShortcut: () => void;
}): LensSurfaceHostHandle {
  const {
    workspaceId,
    lensSessionId,
    hasLensApi,
    panelApi,
    lensPanelTab,
    annotationCount,
    isAnnotationModeActive,
    visualCommentShortcut,
    onVisualCommentShortcut,
  } = args;

  const placeholderRef = useRef<HTMLDivElement>(null);
  const measureRafRef = useRef<number>(0);
  const flushRafRef = useRef<number>(0);
  const pendingBoundsRef = useRef<LensBounds | null>(null);
  const lastSentBoundsRef = useRef<LensBounds | null>(null);
  const boundsRequestInFlightRef = useRef(false);
  const isViewReadyRef = useRef(false);

  // Dockview panel visibility drives per-session WebContentsView visibility:
  // a hidden tab keeps its DOM (renderer "always") and its session alive but
  // must release the native view's screen real estate.
  const [isPanelVisible, setIsPanelVisible] = useState(
    () => panelApi.isVisible,
  );
  const isPanelActiveRef = useRef(panelApi.isActive);

  useEffect(() => {
    setIsPanelVisible(panelApi.isVisible);
    isPanelActiveRef.current = panelApi.isActive;
    const visibilityDisposable = panelApi.onDidVisibilityChange((event) => {
      setIsPanelVisible(event.isVisible);
    });
    const activeDisposable = panelApi.onDidActiveChange((event) => {
      isPanelActiveRef.current = event.isActive;
    });
    return () => {
      visibilityDisposable.dispose();
      activeDisposable.dispose();
    };
  }, [panelApi]);

  // Instrumentation only. A mounted panel owns exactly one guest, so this is
  // the guest count from the renderer's side of the boundary.
  useEffect(() => {
    setLensSurfaceAttached(lensSessionId, true);
    return () => {
      setLensSurfaceAttached(lensSessionId, false);
    };
  }, [lensSessionId]);

  const [isLensFloatingSurfaceOpen, setIsLensFloatingSurfaceOpen] =
    useState(false);
  const [hasExternalFloatingSurface, setHasExternalFloatingSurface] =
    useState(false);
  const isLensSuppressed =
    !isPanelVisible ||
    isLensFloatingSurfaceOpen ||
    hasExternalFloatingSurface ||
    lensPanelTab !== "preview";
  const isLensSuppressedRef = useRef(isLensSuppressed);
  isLensSuppressedRef.current = isLensSuppressed;

  useEffect(() => {
    setLensSurfaceSuppressed(lensSessionId, isLensSuppressed);
  }, [isLensSuppressed, lensSessionId]);

  useEffect(() => {
    if (!isPanelVisible || lensPanelTab !== "preview") {
      setHasExternalFloatingSurface(false);
      return;
    }
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    let frame = 0;
    // Instrumentation baseline for this observer generation. Kept out of the
    // setState updater, which React may run more than once per commit.
    let lastObservedAnswer: boolean | null = null;
    const sync = () => {
      frame = 0;
      const next = hasLensOccludingFloatingSurface(
        document,
        placeholderRef.current?.getBoundingClientRect() ?? null,
      );
      recordLensOcclusionObservation(
        lastObservedAnswer !== null && lastObservedAnswer !== next,
      );
      lastObservedAnswer = next;
      setHasExternalFloatingSurface((current) =>
        current === next ? current : next,
      );
    };
    const scheduleSync = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSync);
    const placeholder = placeholderRef.current;
    if (placeholder) {
      resizeObserver?.observe(placeholder);
    }
    window.addEventListener("resize", scheduleSync);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, [isPanelVisible, lensPanelTab, workspaceId]);

  const flushPendingBounds = useCallback(() => {
    if (!workspaceId || !hasLensApi || boundsRequestInFlightRef.current) {
      return;
    }

    const bounds = pendingBoundsRef.current;
    if (!bounds) {
      return;
    }

    if (areLensBoundsEqual(bounds, lastSentBoundsRef.current)) {
      pendingBoundsRef.current = null;
      return;
    }

    pendingBoundsRef.current = null;
    boundsRequestInFlightRef.current = true;

    const dispatchedAtMs = performance.now();
    const request = window.api?.lens?.setBounds?.({
      workspaceId,
      lensSessionId,
      bounds,
    });
    if (!request) {
      boundsRequestInFlightRef.current = false;
      return;
    }

    void request
      .then((result) => {
        if (result?.ok) {
          lastSentBoundsRef.current = bounds;
        }
      })
      .catch(() => {
        // Bounds sync is best-effort; the next layout change retries.
      })
      .finally(() => {
        // Dispatch to settle, so the sample covers the main-process work and
        // the reply hop rather than just the renderer's share of the trip.
        recordLensBoundsSyncLatency(performance.now() - dispatchedAtMs);
        boundsRequestInFlightRef.current = false;

        if (!pendingBoundsRef.current) {
          return;
        }

        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = requestAnimationFrame(() => {
          flushPendingBounds();
        });
      });
  }, [hasLensApi, lensSessionId, workspaceId]);

  const syncBounds = useCallback(
    (options?: { immediate?: boolean }) => {
      const el = placeholderRef.current;
      if (
        !workspaceId ||
        !el ||
        !hasLensApi ||
        !isViewReadyRef.current ||
        isLensSuppressedRef.current
      ) {
        return;
      }

      const measureBounds = () => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return;
        }

        // Keep the measured CSS-pixel rectangle intact. The main process
        // converts its scaled edges inward so the native view cannot overlap
        // Dockview's renderer-owned resize sash by a rounding pixel.
        pendingBoundsRef.current = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };

        cancelAnimationFrame(flushRafRef.current);
        if (options?.immediate) {
          flushPendingBounds();
          return;
        }

        flushRafRef.current = requestAnimationFrame(() => {
          flushPendingBounds();
        });
      };

      cancelAnimationFrame(measureRafRef.current);
      if (options?.immediate) {
        measureBounds();
        return;
      }

      measureRafRef.current = requestAnimationFrame(measureBounds);
    },
    [flushPendingBounds, hasLensApi, workspaceId],
  );

  useLayoutEffect(() => {
    if (!workspaceId || !hasLensApi || isLensSuppressed) {
      return;
    }

    syncBounds({ immediate: true });
  }, [
    annotationCount,
    hasLensApi,
    isAnnotationModeActive,
    isLensSuppressed,
    isPanelVisible,
    syncBounds,
    workspaceId,
  ]);

  useEffect(() => {
    const el = placeholderRef.current;
    if (!workspaceId || !el || !hasLensApi) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncBounds();
    });
    resizeObserver.observe(el);

    const handleWindowResize = () => {
      syncBounds();
    };

    window.addEventListener("resize", handleWindowResize);
    const unsubscribeZoom = window.api?.window?.subscribeZoomChanges?.(() => {
      syncBounds();
    });

    syncBounds();

    return () => {
      cancelAnimationFrame(measureRafRef.current);
      cancelAnimationFrame(flushRafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      unsubscribeZoom?.();
    };
  }, [hasLensApi, syncBounds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    if (isLensSuppressed) {
      cancelAnimationFrame(measureRafRef.current);
      cancelAnimationFrame(flushRafRef.current);
      pendingBoundsRef.current = null;
      lastSentBoundsRef.current = null;
      void window.api?.lens?.setBounds?.({
        workspaceId,
        lensSessionId,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
      void window.api?.lens?.setVisible?.({
        workspaceId,
        lensSessionId,
        visible: false,
      });
      return;
    }

    void window.api?.lens?.setVisible?.({
      workspaceId,
      lensSessionId,
      visible: true,
    });
    syncBounds();
  }, [hasLensApi, isLensSuppressed, lensSessionId, syncBounds, workspaceId]);

  useLensVisualCommentShortcut({
    enabled: Boolean(workspaceId) && hasLensApi,
    isPanelActiveRef,
    isPanelVisible,
    lensSessionId,
    onTrigger: onVisualCommentShortcut,
    visualCommentShortcut,
  });

  const resetSurfaceTracking = useCallback(() => {
    pendingBoundsRef.current = null;
    lastSentBoundsRef.current = null;
    boundsRequestInFlightRef.current = false;
    isViewReadyRef.current = false;
  }, []);

  /**
   * Presenting a freshly opened guest, in the one place that knows the
   * suppression rules.
   *
   * The `await` is kept rather than fired and forgotten: the caller continues
   * with more session IPC as soon as this resolves, and settling visibility
   * first is what keeps a guest from being read back before it is on screen.
   *
   * Suppression is read from the ref, not from a render value, because the
   * caller has already awaited an `openSession` round trip by the time it gets
   * here and the answer may have changed underneath it. If it changes again
   * afterwards, the suppression effect above re-applies — this is a starting
   * position, not the last word.
   */
  const attachGuest = useCallback(async () => {
    isViewReadyRef.current = true;
    const suppressed = isLensSuppressedRef.current;

    await window.api?.lens?.setVisible?.({
      workspaceId,
      lensSessionId,
      visible: !suppressed,
    });

    if (suppressed) {
      await window.api?.lens?.setBounds?.({
        workspaceId,
        lensSessionId,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
      return;
    }

    syncBounds();
  }, [lensSessionId, syncBounds, workspaceId]);

  const detachGuest = useCallback(() => {
    cancelAnimationFrame(measureRafRef.current);
    cancelAnimationFrame(flushRafRef.current);
    resetSurfaceTracking();
    // Reset bounds first so the view doesn't occlude other panels while hidden.
    void window.api?.lens?.setBounds?.({
      workspaceId,
      lensSessionId,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
    void window.api?.lens?.setVisible?.({
      workspaceId,
      lensSessionId,
      visible: false,
    });
  }, [lensSessionId, resetSurfaceTracking, workspaceId]);

  return {
    attachGuest,
    detachGuest,
    placeholderRef,
    setFloatingSurfaceOpen: setIsLensFloatingSurfaceOpen,
  };
}

import type { IDockviewPanelProps } from "dockview-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
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
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  isVisualCommentShortcut,
  type VisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import { useAppStore } from "@/store/app.store";

/**
 * Lens sessions whose surface panel is currently visible. Workspace-level
 * events that carry no lensSessionId (visual-comment shortcut relayed while
 * the page has focus) are fielded by exactly one mounted panel picked
 * deterministically from this registry / the store.
 */
const visibleLensSessionIds = new Set<string>();

/**
 * Handle a Lens surface panel uses to place its guest page. Deliberately says
 * nothing about how the guest is hosted: a DOM-element implementation can
 * satisfy this shape with `isSuppressed` permanently `false`, bounds syncing a
 * no-op, and the lifecycle calls reduced to bookkeeping.
 */
export type LensSurfaceHostHandle = {
  /** Rectangle the panel renders for the guest page to occupy. */
  placeholderRef: RefObject<HTMLDivElement | null>;
  isPanelVisible: boolean;
  isSuppressed: boolean;
  isFloatingSurfaceOpen: boolean;
  setFloatingSurfaceOpen: (open: boolean) => void;
  /** Re-measure the placeholder and mirror it onto the guest. */
  requestBoundsSync: () => void;
  /**
   * Live suppression flag for async work that outlives the render it started
   * in (the session-lifecycle effect awaits several IPC round trips before it
   * decides whether the guest may be shown).
   */
  getIsSuppressed: () => boolean;
  /** The guest for this session exists and may be positioned. */
  markSurfaceReady: () => void;
  /** Forget geometry recorded for a previous session generation. */
  resetSurfaceTracking: () => void;
  /** Collapse the surface to zero area, leaving the session in place. */
  collapseSurface: () => Promise<void>;
  /** Stop syncing, collapse, and take the surface off screen. */
  releaseSurface: () => void;
};

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

  useEffect(() => {
    if (isPanelVisible) {
      visibleLensSessionIds.add(lensSessionId);
    } else {
      visibleLensSessionIds.delete(lensSessionId);
    }
    return () => {
      visibleLensSessionIds.delete(lensSessionId);
    };
  }, [isPanelVisible, lensSessionId]);

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

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }
      if (
        !isVisualCommentShortcut({
          shortcut: visualCommentShortcut ?? DEFAULT_VISUAL_COMMENT_SHORTCUT,
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          isComposing: event.isComposing,
        })
      ) {
        return;
      }
      // The shortcut is window-global while every lens panel is mounted
      // (keep-alive), so exactly one session may claim it: the active lens
      // panel if there is one, otherwise the first *visible* lens tab.
      if (!isPanelActiveRef.current) {
        const state = useAppStore.getState();
        const activePanelSessionId =
          state.activeSurface.kind === "lens"
            ? state.activeSurface.lensSessionId
            : null;
        if (activePanelSessionId) {
          if (activePanelSessionId !== lensSessionId) {
            return;
          }
        } else {
          const firstVisible = state.lensTabs.find((tab) =>
            visibleLensSessionIds.has(tab.id),
          );
          if (firstVisible?.id !== lensSessionId) {
            return;
          }
        }
      }
      event.preventDefault();
      void onVisualCommentShortcut();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hasLensApi,
    lensSessionId,
    onVisualCommentShortcut,
    visualCommentShortcut,
    workspaceId,
  ]);

  const getIsSuppressed = useCallback(() => isLensSuppressedRef.current, []);

  const markSurfaceReady = useCallback(() => {
    isViewReadyRef.current = true;
  }, []);

  const resetSurfaceTracking = useCallback(() => {
    pendingBoundsRef.current = null;
    lastSentBoundsRef.current = null;
    boundsRequestInFlightRef.current = false;
    isViewReadyRef.current = false;
  }, []);

  const collapseSurface = useCallback(async () => {
    await window.api?.lens?.setBounds?.({
      workspaceId,
      lensSessionId,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
  }, [lensSessionId, workspaceId]);

  const releaseSurface = useCallback(() => {
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
    collapseSurface,
    getIsSuppressed,
    isFloatingSurfaceOpen: isLensFloatingSurfaceOpen,
    isPanelVisible,
    isSuppressed: isLensSuppressed,
    markSurfaceReady,
    placeholderRef,
    releaseSurface,
    requestBoundsSync: syncBounds,
    resetSurfaceTracking,
    setFloatingSurfaceOpen: setIsLensFloatingSurfaceOpen,
  };
}

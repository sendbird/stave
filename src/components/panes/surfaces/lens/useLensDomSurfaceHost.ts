import type { IDockviewPanelProps } from "dockview-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  setLensSurfaceAttached,
  setLensSurfaceSuppressed,
} from "@/lib/lens/lens-instrumentation";
import {
  claimLensGuestPresenter,
  getLensGuestChromeLayer,
  setLensGuestPlacement,
} from "@/lib/lens/lens-guest-host";
import {
  areLensGuestRectsEqual,
  isMeasurableLensGuestRect,
} from "@/lib/lens/lens-guest-placement";
import { createLensGuestPointerPassthroughTracker } from "@/lib/lens/lens-guest-interaction";
import type { LensPanelTab } from "@/lib/lens/lens-log-format";
import type { LensBounds } from "@/lib/lens/lens.types";
import type { VisualCommentShortcut } from "@/lib/visual-comment-shortcuts";
import { useLensVisualCommentShortcut } from "@/components/panes/surfaces/lens/useLensVisualCommentShortcut";
import type { LensSurfaceHostHandle } from "@/components/panes/surfaces/lens/lens-surface-host";
import { useAppStore } from "@/store/app.store";

/**
 * How many consecutive unchanged frames end a tracking burst.
 *
 * Long enough to ride out a stalled drag frame or the tail of a CSS transition,
 * short enough that an idle window is not kept awake by an animation frame
 * callback. ~333ms at 60Hz.
 */
const TRACKING_SETTLE_FRAMES = 20;

/**
 * DOM-hosted surface for one Lens session.
 *
 * The guest is a `<webview>` in the window's flat surface root, so this hook
 * does one thing: keep that element over the panel's placeholder. There is no
 * bounds IPC, no device-pixel conversion, no inward rounding, no single-flight
 * dedupe with dropped frames, and no occlusion detection — a dialog, a tooltip,
 * or a dropdown over a Lens preview is now ordinary z-index and needs no
 * cooperation from this module at all.
 *
 * What remains is genuinely about presentation:
 *
 * - the placeholder's rectangle, mirrored onto the guest as CSS pixels;
 * - whether a panel is showing this session at all, which is a Dockview tab
 *   question, not a stacking one;
 * - reporting that answer to main, which uses it to pick the session an agent
 *   call with no explicit id should target.
 *
 * **Tracking is deliberately not just a `ResizeObserver`**, and the two reasons
 * are the whole design of the section below.
 *
 * 1. *The placeholder element is not stable.* It lives in `LensPreviewSurface`,
 *    which the panel unmounts whenever the Console or Network tab is selected,
 *    so an observer bound once at mount ends up watching a detached node while
 *    the live placeholder is watched by nothing. Observation therefore follows
 *    the element through a ref callback, not through a mount-time effect.
 * 2. *A `ResizeObserver` never fires on movement.* A pane that is translated
 *    without being resized — a Lens tab dragged between two equally sized
 *    groups, a neighbouring pane collapsing — leaves the guest painting over its
 *    old rectangle, where it also keeps taking the clicks. So a settle-based
 *    animation-frame burst runs alongside the observer: it re-measures until
 *    the rectangle has held still for {@link TRACKING_SETTLE_FRAMES}, and stops.
 *    Idle costs nothing; a drag costs one `getBoundingClientRect` per frame.
 */
export function useLensDomSurfaceHost(args: {
  workspaceId: string;
  lensSessionId: string;
  hasLensApi: boolean;
  panelApi: IDockviewPanelProps["api"];
  lensPanelTab: LensPanelTab;
  visualCommentShortcut: VisualCommentShortcut;
  onVisualCommentShortcut: () => void;
}): LensSurfaceHostHandle {
  const {
    workspaceId,
    lensSessionId,
    hasLensApi,
    panelApi,
    lensPanelTab,
    visualCommentShortcut,
    onVisualCommentShortcut,
  } = args;

  // A guest exists only once the session has been opened and bound. Before
  // that there is nothing to place, and measuring would be a rectangle for a
  // page that does not exist.
  const [hasGuest, setHasGuest] = useState(false);
  const hasGuestRef = useRef(false);
  const [chromeLayer, setChromeLayer] = useState<HTMLElement | null>(null);

  const [isPanelVisible, setIsPanelVisible] = useState(
    () => panelApi.isVisible,
  );
  const isPanelActiveRef = useRef(panelApi.isActive);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);

  /*
   * Whether this panel is showing the page.
   *
   * Both terms are about the panel, not about what is stacked over it. A
   * dropdown, a dialog or a toast overlapping the preview does not appear here
   * and does not need to: the guest is a DOM element and they paint above it.
   */
  const isPresented =
    hasGuest &&
    isPanelVisible &&
    lensPanelTab === "preview" &&
    activeWorkspaceId === workspaceId;
  const isPresentedRef = useRef(isPresented);
  isPresentedRef.current = isPresented;

  // ---- Geometry -----------------------------------------------------------

  const placeholderElementRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const trackingFrameRef = useRef<number | null>(null);
  const settledFramesRef = useRef(0);
  const lastRectRef = useRef<LensBounds | null>(null);

  /**
   * Measure and publish. Reports whether the *measured* rectangle moved, which
   * is what decides whether a tracking burst keeps going.
   */
  const syncPlacement = useCallback((): boolean => {
    if (!hasGuestRef.current) {
      return false;
    }

    const domRect = placeholderElementRef.current?.getBoundingClientRect();
    const measured: LensBounds | null = domRect
      ? {
          x: domRect.left,
          y: domRect.top,
          width: domRect.width,
          height: domRect.height,
        }
      : null;
    // A rectangle measured while the pane is collapsed, mid-teardown, or in a
    // group being dragged is zero-sized. Keeping the previous one is what lets
    // the guest re-show without relaying out its page — and it carries no new
    // information, so it must not count as movement either.
    const adoptable = isMeasurableLensGuestRect(measured) ? measured : null;
    const moved = adoptable
      ? !areLensGuestRectsEqual(lastRectRef.current, adoptable)
      : false;
    if (adoptable) {
      lastRectRef.current = adoptable;
    }
    const hasRect = Boolean(adoptable || lastRectRef.current);
    const isActiveWorkspace =
      useAppStore.getState().activeWorkspaceId === workspaceId;

    setLensGuestPlacement(
      { workspaceId, lensSessionId },
      {
        rect: adoptable ?? undefined,
        // Hide until a pane rectangle exists. Showing the default viewport at
        // (0, 0) paints the page over the workspace instead of in the pane.
        // Also refuse to re-present after a workspace switch: a keep-alive
        // panel can keep tracking for a frame and would undo the host park.
        presented: isPresentedRef.current && hasRect && isActiveWorkspace,
      },
    );
    return moved;
  }, [lensSessionId, workspaceId]);

  const stopTracking = useCallback(() => {
    if (trackingFrameRef.current !== null) {
      cancelAnimationFrame(trackingFrameRef.current);
      trackingFrameRef.current = null;
    }
  }, []);

  /**
   * Sync now, then keep syncing until the rectangle holds still.
   *
   * Every trigger goes through here rather than calling `syncPlacement`
   * directly, because a trigger tells us the layout is *starting* to change,
   * not that it has finished: a sash grab, a `width` transition, and a Dockview
   * relayout all settle over many frames, and Dockview positions
   * `.dv-render-overlay` a further animation frame behind its own layout.
   */
  const trackPlacement = useCallback(() => {
    syncPlacement();
    settledFramesRef.current = 0;
    if (trackingFrameRef.current !== null || !hasGuestRef.current) {
      return;
    }
    const step = () => {
      trackingFrameRef.current = null;
      if (!hasGuestRef.current) {
        return;
      }
      settledFramesRef.current = syncPlacement()
        ? 0
        : settledFramesRef.current + 1;
      if (settledFramesRef.current >= TRACKING_SETTLE_FRAMES) {
        return;
      }
      trackingFrameRef.current = requestAnimationFrame(step);
    };
    trackingFrameRef.current = requestAnimationFrame(step);
  }, [syncPlacement]);

  // Indirection so the ResizeObserver and the DOM listeners can be created once
  // and still call the current closure.
  const trackPlacementRef = useRef(trackPlacement);
  trackPlacementRef.current = trackPlacement;

  /**
   * Follow the placeholder element itself.
   *
   * A ref callback rather than an effect, because the element is replaced
   * whenever the panel leaves and re-enters the Preview tab and a ref write does
   * not re-run effects. Binding once at mount is exactly the bug this replaces.
   */
  const placeholderRef = useCallback((element: HTMLDivElement | null) => {
    placeholderElementRef.current = element;

    let observer = resizeObserverRef.current;
    if (!observer && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        trackPlacementRef.current();
      });
      resizeObserverRef.current = observer;
    }
    observer?.disconnect();
    if (element) {
      observer?.observe(element);
      trackPlacementRef.current();
    }
  }, []);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      stopTracking();
    };
  }, [stopTracking]);

  useEffect(() => {
    setIsPanelVisible(panelApi.isVisible);
    isPanelActiveRef.current = panelApi.isActive;
    const track = () => {
      trackPlacementRef.current();
    };
    const disposables = [
      panelApi.onDidVisibilityChange((event) => {
        setIsPanelVisible(event.isVisible);
        track();
      }),
      panelApi.onDidActiveChange((event) => {
        isPanelActiveRef.current = event.isActive;
        track();
      }),
      // Fires for this pane's own resize. Cheap, and it starts the burst that
      // catches the frames Dockview applies after its own layout pass.
      panelApi.onDidDimensionsChange(track),
      // A pane moved between groups keeps its size, so nothing else would fire.
      panelApi.onDidLocationChange?.(track),
    ];
    return () => {
      for (const disposable of disposables) {
        disposable?.dispose();
      }
    };
  }, [panelApi]);

  useEffect(() => {
    const track = () => {
      trackPlacementRef.current();
    };
    window.addEventListener("resize", track);
    const unsubscribeZoom = window.api?.window?.subscribeZoomChanges?.(track);
    return () => {
      window.removeEventListener("resize", track);
      unsubscribeZoom?.();
    };
  }, []);

  /*
   * Pointer drags, for the presented panel only.
   *
   * A sash drag, a sidebar resize, and a tab drag all move this pane without
   * necessarily resizing it, and none of them are visible to any Dockview event
   * this panel subscribes to. Gated on `isPresented` so N mounted-but-hidden
   * Lens tabs do not each measure on every pointer move.
   */
  useEffect(() => {
    if (!isPresented) {
      return;
    }
    const track = () => {
      trackPlacementRef.current();
    };
    const removeDragListeners = () => {
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("blur", resetPointerTracking);
      document.removeEventListener("visibilitychange", resetPointerTracking);
    };
    const pointerTracking = createLensGuestPointerPassthroughTracker(
      (active) => {
        if (!active) {
          removeDragListeners();
          return;
        }
        window.addEventListener("pointermove", track, true);
        window.addEventListener("pointerup", onPointerEnd, true);
        window.addEventListener("pointercancel", onPointerEnd, true);
        window.addEventListener("blur", resetPointerTracking);
        document.addEventListener(
          "visibilitychange",
          resetPointerTracking,
        );
      },
    );
    function onPointerEnd(event: PointerEvent) {
      pointerTracking.release(event.pointerId);
      track();
    }
    function resetPointerTracking() {
      pointerTracking.reset();
      track();
    }
    const onPointerDown = (event: PointerEvent) => {
      pointerTracking.acquire(event.pointerId);
      track();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      resetPointerTracking();
    };
  }, [isPresented]);

  /*
   * Ownership of the session this panel shows.
   *
   * The host reveals a guest only while a claim for it exists, and this is the
   * claim. It is keyed on the identity the panel presents, so it is released
   * — and the guest parked — on unmount and on any identity change, whichever
   * teardown path got there. That closes the gap the session effect cannot: a
   * panel whose tab is no longer in the store returns early there and installs
   * no cleanup, yet it still has to leave nothing revealed behind it.
   *
   * An identity change also drops the attached guest. `hasGuest` describes the
   * previous session's page; carrying it over would let the very next layout
   * pass present the new identity's guest at the old rectangle before the
   * session effect has opened anything. Layout-phase so the claim precedes the
   * placement sync below.
   */
  useLayoutEffect(() => {
    const release = claimLensGuestPresenter({ workspaceId, lensSessionId });
    return () => {
      release();
      hasGuestRef.current = false;
      setHasGuest(false);
      setChromeLayer(null);
      lastRectRef.current = null;
    };
  }, [lensSessionId, workspaceId]);

  // Before paint, so a panel-state change that resizes the placeholder moves
  // the guest in the same frame that moves the placeholder.
  useLayoutEffect(() => {
    trackPlacement();
  }, [isPresented, lensPanelTab, trackPlacement]);

  // ---- Reporting ----------------------------------------------------------

  useEffect(() => {
    setLensSurfaceAttached(lensSessionId, true);
    return () => {
      setLensSurfaceAttached(lensSessionId, false);
    };
  }, [lensSessionId]);

  useEffect(() => {
    setLensSurfaceSuppressed(lensSessionId, !isPresented);
  }, [isPresented, lensSessionId]);

  /*
   * Main keeps this to answer "which Lens tab is the user looking at" for agent
   * calls that name no session. It is a report about a change that has already
   * happened in the DOM, so nothing waits on it.
   *
   * It is a plain function rather than an effect because the message that
   * matters most — `presented: false` — is sent from teardown, when `hasGuest`
   * has already gone false. An effect guarded on `hasGuest` drops exactly that
   * one, leaving main believing a parked session is still on screen and routing
   * agent calls with no session id to a page nobody is looking at.
   */
  const lastReportedPresentedRef = useRef<boolean | null>(null);
  const reportPresented = useCallback(
    (presented: boolean) => {
      if (!workspaceId || !hasLensApi) {
        return;
      }
      if (lastReportedPresentedRef.current === presented) {
        return;
      }
      lastReportedPresentedRef.current = presented;
      void window.api?.lens?.setPresented?.({
        workspaceId,
        lensSessionId,
        presented,
      });
    },
    [hasLensApi, lensSessionId, workspaceId],
  );

  useEffect(() => {
    if (!hasGuest) {
      return;
    }
    reportPresented(isPresented);
  }, [hasGuest, isPresented, reportPresented]);

  useEffect(() => {
    return () => {
      reportPresented(false);
    };
  }, [reportPresented]);

  useLensVisualCommentShortcut({
    enabled: Boolean(workspaceId) && hasLensApi,
    isPanelActiveRef,
    isPanelVisible,
    lensSessionId,
    onTrigger: onVisualCommentShortcut,
    visualCommentShortcut,
  });

  // ---- Attachment ---------------------------------------------------------

  const attachGuest = useCallback(async () => {
    hasGuestRef.current = true;
    setHasGuest(true);
    // A rebuilt session is a new session as far as main is concerned: it starts
    // hidden and knows nothing about what this panel reported for the previous
    // one, so the report has to be allowed through again.
    lastReportedPresentedRef.current = null;
    // Read on every attach, not only the first: a rebuilt session gets a fresh
    // element, and a panel still portaling into the previous one would be
    // rendering its chrome into a detached node.
    setChromeLayer(getLensGuestChromeLayer({ workspaceId, lensSessionId }));
    // Place it before the caller continues. The session effect goes straight on
    // to reading state back, and a guest that has not been positioned yet would
    // answer viewport questions about a rectangle no panel chose.
    trackPlacement();
  }, [lensSessionId, trackPlacement, workspaceId]);

  const detachGuest = useCallback(() => {
    hasGuestRef.current = false;
    setHasGuest(false);
    setChromeLayer(null);
    stopTracking();
    lastRectRef.current = null;
    // Park, do not release. The page belongs to the session, which outlives
    // this panel: a hidden tab, a workspace switch, and layout churn all unmount
    // the panel while the session stays open.
    setLensGuestPlacement({ workspaceId, lensSessionId }, { presented: false });
    reportPresented(false);
  }, [lensSessionId, reportPresented, stopTracking, workspaceId]);

  return {
    attachGuest,
    chromeLayer,
    detachGuest,
    isPresented,
    placeholderRef,
    // Panel chrome no longer has to be traded against the page: it paints over
    // the guest like any other DOM content.
    setFloatingSurfaceOpen: () => {},
  };
}

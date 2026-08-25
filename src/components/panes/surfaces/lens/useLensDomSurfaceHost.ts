import type { IDockviewPanelProps } from "dockview-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  setLensSurfaceAttached,
  setLensSurfaceSuppressed,
} from "@/lib/lens/lens-instrumentation";
import { setLensGuestPlacement } from "@/lib/lens/lens-guest-host";
import { isMeasurableLensGuestRect } from "@/lib/lens/lens-guest-placement";
import type { LensPanelTab } from "@/lib/lens/lens-log-format";
import type { LensBounds } from "@/lib/lens/lens.types";
import type { VisualCommentShortcut } from "@/lib/visual-comment-shortcuts";
import { useLensVisualCommentShortcut } from "@/components/panes/surfaces/lens/useLensVisualCommentShortcut";
import type { LensSurfaceHostHandle } from "@/components/panes/surfaces/lens/lens-surface-host";

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
 * Measurement is triggered by the same signals the `WebContentsView` host used
 * — a `ResizeObserver` on the placeholder, window resize, zoom change, and the
 * panel-state layout effect — because those are what actually move a pane. The
 * difference is what a trigger costs: a style write on one element, applied in
 * the same frame, instead of a cross-process round trip whose reply lands a
 * frame or more later.
 */
export function useLensDomSurfaceHost(args: {
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

  // A guest exists only once the session has been opened and bound. Before
  // that there is nothing to place, and measuring would be a rectangle for a
  // page that does not exist.
  const [hasGuest, setHasGuest] = useState(false);
  const hasGuestRef = useRef(false);

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

  /*
   * Whether this panel is showing the page.
   *
   * Both terms are about the panel, not about what is stacked over it. A
   * dropdown, a dialog or a toast overlapping the preview does not appear here
   * and does not need to: the guest is a DOM element and they paint above it.
   */
  const isPresented = hasGuest && isPanelVisible && lensPanelTab === "preview";
  const isPresentedRef = useRef(isPresented);
  isPresentedRef.current = isPresented;

  useEffect(() => {
    setLensSurfaceAttached(lensSessionId, true);
    return () => {
      setLensSurfaceAttached(lensSessionId, false);
    };
  }, [lensSessionId]);

  useEffect(() => {
    setLensSurfaceSuppressed(lensSessionId, !isPresented);
  }, [isPresented, lensSessionId]);

  const syncPlacement = useCallback(() => {
    if (!hasGuestRef.current) {
      return;
    }

    const element = placeholderRef.current;
    const domRect = element?.getBoundingClientRect() ?? null;
    const rect: LensBounds | null = domRect
      ? {
          x: domRect.left,
          y: domRect.top,
          width: domRect.width,
          height: domRect.height,
        }
      : null;

    setLensGuestPlacement(
      { workspaceId, lensSessionId },
      {
        // A rectangle measured while the pane is collapsed, mid-teardown, or
        // in a group being dragged is zero-sized. Keeping the previous one is
        // what lets the guest re-show without relaying out its page.
        rect: isMeasurableLensGuestRect(rect) ? rect : undefined,
        presented: isPresentedRef.current,
      },
    );
  }, [lensSessionId, workspaceId]);

  // Before paint, so a panel-state change that resizes the placeholder moves
  // the guest in the same frame that moves the placeholder.
  useLayoutEffect(() => {
    syncPlacement();
  }, [
    annotationCount,
    isAnnotationModeActive,
    isPresented,
    lensPanelTab,
    syncPlacement,
  ]);

  useEffect(() => {
    const element = placeholderRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncPlacement();
    });
    resizeObserver.observe(element);

    const handleWindowResize = () => {
      syncPlacement();
    };
    window.addEventListener("resize", handleWindowResize);
    const unsubscribeZoom = window.api?.window?.subscribeZoomChanges?.(() => {
      syncPlacement();
    });

    syncPlacement();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      unsubscribeZoom?.();
    };
  }, [syncPlacement]);

  // Main keeps this to answer "which Lens tab is the user looking at" for agent
  // calls that name no session. It is a report about a change that has already
  // happened in the DOM, so nothing waits on it.
  useEffect(() => {
    if (!workspaceId || !hasLensApi || !hasGuest) {
      return;
    }
    void window.api?.lens?.setPresented?.({
      workspaceId,
      lensSessionId,
      presented: isPresented,
    });
  }, [hasGuest, hasLensApi, isPresented, lensSessionId, workspaceId]);

  useLensVisualCommentShortcut({
    enabled: Boolean(workspaceId) && hasLensApi,
    isPanelActiveRef,
    isPanelVisible,
    lensSessionId,
    onTrigger: onVisualCommentShortcut,
    visualCommentShortcut,
  });

  const attachGuest = useCallback(async () => {
    hasGuestRef.current = true;
    setHasGuest(true);
    // Place it before the caller continues. The session effect goes straight on
    // to reading state back, and a guest that has not been positioned yet would
    // answer viewport questions about a rectangle no panel chose.
    syncPlacement();
  }, [syncPlacement]);

  const detachGuest = useCallback(() => {
    hasGuestRef.current = false;
    setHasGuest(false);
    // Park, do not release. The page belongs to the session, which outlives
    // this panel: a hidden tab, a workspace switch, and layout churn all unmount
    // the panel while the session stays open.
    setLensGuestPlacement(
      { workspaceId, lensSessionId },
      { presented: false },
    );
  }, [lensSessionId, workspaceId]);

  return {
    attachGuest,
    detachGuest,
    placeholderRef,
    // Panel chrome no longer has to be traded against the page: it paints over
    // the guest like any other DOM content.
    setFloatingSurfaceOpen: () => {},
  };
}

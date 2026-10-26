import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Below this toolbar width the element picker and visual comments move into
 * the overflow menu. Without them the remaining page tools (view switch, the
 * menu, full view) stay on one row of their own; with them the block wraps
 * inside itself and full view ends up alone on a fourth row. The full block
 * is about 285px with both counts at their three-digit cap, so 320px leaves
 * room for it plus the toolbar padding.
 *
 * Measured against the toolbar, not the window: Lens shares the window with
 * the sidebar and other panes, so only its own width says how much room the
 * tools have.
 */
export const LENS_CHROME_COMPACT_WIDTH = 320;

/** Whether `width` is narrow enough for the compact toolbar. */
export function isLensChromeCompact(width: number): boolean {
  return width > 0 && width < LENS_CHROME_COMPACT_WIDTH;
}

/**
 * Tracks the toolbar's own width and reports when it is narrow enough for the
 * compact layout. Measured in a layout effect so the first paint already has
 * the right layout.
 */
export function useLensChromeCompact(): {
  ref: (node: HTMLElement | null) => void;
  compact: boolean;
} {
  const [compact, setCompact] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback((node: HTMLElement | null) => {
    if (!node) {
      return;
    }
    const width = node.getBoundingClientRect().width;
    // A detached or hidden toolbar measures 0. That is no signal, not "narrow".
    if (width <= 0) {
      return;
    }
    setCompact(isLensChromeCompact(width));
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || typeof ResizeObserver === "undefined") {
        return;
      }
      measure(node);
      const observer = new ResizeObserver(() => measure(nodeRef.current));
      observer.observe(node);
      observerRef.current = observer;
    },
    [measure],
  );

  useLayoutEffect(() => {
    measure(nodeRef.current);
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [measure]);

  return { ref, compact };
}

import { useCallback, useRef, useState } from "react";
import { TARS_TRAY_PINNED_MIN_WIDTH } from "@/lib/tars/tray-model";

/**
 * Whether the Tars view itself (not the window) is wide enough to keep the
 * tray open beside the conversation, and the view's size for the side view's
 * placement. The sidebar and other panes eat into the view, so a viewport
 * query would pin the tray where it no longer fits. Measured as the node
 * attaches, so the first paint is already the right mode.
 */
export function useTarsTrayPinned() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      // A detached or not-yet-laid-out node measures 0: no signal, not "narrow".
      if (width > 0) setSize((current) => current?.width === width && current.height === height ? current : { width, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(measure);
    observer.current.observe(node);
  }, []);
  return { ref, pinned: size !== null && size.width >= TARS_TRAY_PINNED_MIN_WIDTH, size };
}

import { useLayoutEffect, type RefObject } from "react";
import type { DockviewApi } from "dockview-react";

/**
 * Lays the pane host out in the same frame its box changes. Dockview watches
 * its own element too, but defers that layout to the next animation frame, so
 * when a side panel opened, the shell column took its new width in one frame
 * and the panes (and the composer inside them) re-wrapped a frame later. A
 * ResizeObserver callback runs after layout and before paint, so laying out
 * here paints one consistent frame; dockview's own deferred pass then finds
 * nothing to change.
 */
export function useDockviewSyncLayout(
  rootRef: RefObject<HTMLElement | null>,
  apiRef: RefObject<DockviewApi | null>,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const api = apiRef.current;
      if (!entry || !api) {
        return;
      }
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0 || height <= 0) {
        return;
      }
      if (api.width !== width || api.height !== height) {
        api.layout(width, height);
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef, apiRef]);
}

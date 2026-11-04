import { useLayoutEffect, useState } from "react";
import type { DiffViewerMode } from "@/components/ads/components/DiffViewer";
import type { AppSettings } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";

/**
 * Display options shared by every product `DiffViewer` (the chat's file diffs
 * and Review), so the same change reads the same way in both places.
 */

/** Unchanged lines kept around each change; longer unchanged runs collapse behind Expand. */
export const DIFF_CONTEXT_LINES = 3;

/**
 * Narrowest diff, in CSS pixels, that still shows side by side. Below it each
 * column would hold too few characters to read, so a split preference falls
 * back to unified, as Monaco's diff editor does in a narrow pane.
 */
export const MIN_SPLIT_DIFF_WIDTH = 720;

/**
 * The layout a diff draws in: the user's `diffViewMode` setting, except that a
 * split diff measured narrower than `MIN_SPLIT_DIFF_WIDTH` is drawn unified.
 * An unmeasured diff (`width` null, as on first render) follows the setting.
 */
export function resolveDiffViewerMode(args: {
  setting: AppSettings["diffViewMode"];
  width: number | null;
}): DiffViewerMode {
  if (args.setting !== "split") {
    return "unified";
  }
  return args.width !== null && args.width < MIN_SPLIT_DIFF_WIDTH
    ? "unified"
    : "split";
}

/**
 * The user's diff layout for one `DiffViewer`. Attach `ref` to the viewer: its
 * width is measured before paint and on every resize, so a split preference
 * becomes unified in a narrow container. The viewer fills its container's
 * inline size in both layouts, so switching layout never changes the width
 * that chose it.
 */
export function useDiffViewerMode<T extends HTMLElement = HTMLDivElement>() {
  const setting = useAppStore((state) => state.settings.diffViewMode);
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!node || setting !== "split") {
      return;
    }
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      setWidth(node.getBoundingClientRect().width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, setting]);
  return { mode: resolveDiffViewerMode({ setting, width }), ref: setNode };
}

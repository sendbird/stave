import { i18n, useTranslation } from "@/i18n";
import { transition } from "@/components/ads/recipes/transition";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { layers } from "@/lib/ui-layers.stylex";
import { appShellStyles } from "./app-shell.styles";

export const PANEL_RESIZE_HINT = "ui:panelResizeHandle.dragToResizeDoubleClickToReset" as const;

/**
 * The drag handle on a panel's edge, shared by the repository sidebar, the
 * right-hand panel and the Agents list. At rest its sash is the panel's
 * hairline; under the pointer it thickens to an accent bar. Dragging reports
 * each clamped width, and a double-click asks for the panel's default width.
 * Where the width is kept, and how often it is written, stays with the caller.
 */
export function PanelResizeHandle({
  width,
  grow = "end",
  clamp,
  onResize,
  onResizeStart,
  onResizeEnd,
  onReset,
  xstyle,
}: {
  /** The panel's width when a drag starts; a function reads it at that moment. */
  width: number | (() => number);
  /**
   * `end`: the panel sits before the handle, so dragging toward the inline
   * end widens it. `start`: the panel sits after the handle.
   */
  grow?: "end" | "start";
  clamp: (next: number) => number;
  onResize: (next: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  onReset: () => void;
  xstyle?: StyleXValue;
}) {
  useTranslation();
  return (
    <div
      className={sx(appShellStyles.resizer, layers.resizer, xstyle)}
      title={i18n.t(PANEL_RESIZE_HINT)}
      onDoubleClick={onReset}
      onMouseDown={(event) => {
        event.preventDefault();
        onResizeStart?.();
        const startX = event.clientX;
        const startWidth = typeof width === "function" ? width() : width;
        const onMove = (moveEvent: MouseEvent) => {
          const delta = moveEvent.clientX - startX;
          onResize(clamp(startWidth + (grow === "end" ? delta : -delta)));
        };
        const onUp = () => {
          onResizeEnd?.();
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
    >
      <div className={sx(appShellStyles.resizerSash, transition.colors)} />
    </div>
  );
}

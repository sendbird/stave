import * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { sx } from "../utils/stylex";
import {
  clampColumnWidth,
  DEFAULT_MIN_COLUMN_WIDTH,
  RESIZE_KEYBOARD_STEP,
} from "./DataTable.helpers";
import { styles } from "./DataTable.styles";

/**
 * Widest a column may be dragged/nudged to, and the `aria-valuemax` its
 * splitter reports. The resize math had no upper bound at all, which left a
 * focusable separator with no range to announce; the value sits far past the
 * table's own 760px `minInlineSize` so it never binds in a realistic layout.
 */
const RESIZE_MAX_COLUMN_WIDTH = 1200;

type ColumnResizeSeparatorProps = {
  columnHeader: React.ReactNode;
  columnId: string;
  minWidth?: number;
  onResize: (columnId: string, width: number) => void;
  onResizeStart: () => void;
  /** Committed pixel width, when the column has one; drives `aria-valuenow`. */
  width?: number;
};

/**
 * Draggable / keyboard-operable column divider. Exposed as
 * `role="separator" aria-orientation="vertical"` so assistive tech announces it
 * as an adjustable splitter; ArrowLeft/Right nudge the width by a fixed step,
 * Home/End jump to the min / a comfortable max. A focusable separator IS a
 * splitter, so it also reports its position (`aria-valuenow` within
 * `aria-valuemin`/`aria-valuemax`) — an adjustable control with no value is
 * announced as unusable.
 */
export function ColumnResizeSeparator({
  columnHeader,
  columnId,
  minWidth = DEFAULT_MIN_COLUMN_WIDTH,
  onResize,
  onResizeStart,
  width,
}: ColumnResizeSeparatorProps) {
  useTranslation();
  const [resizing, setResizing] = React.useState(false);
  const separatorRef = React.useRef<HTMLDivElement>(null);
  // The width lives in the table's layout, not in this component, so the
  // announced value is measured off the host <th> and refreshed whenever the
  // committed width moves (every drag step and every arrow press commits one).
  const [currentWidth, setCurrentWidth] = React.useState<number | null>(null);
  const headerLabel =
    typeof columnHeader === "string" ? columnHeader : columnId;

  // Measure the host <th> so drags and arrow keys operate on the real width.
  const measureWidth = React.useCallback(
    (target: HTMLElement | null): number | null => {
      const headerCell = target?.closest("th");

      return headerCell ? headerCell.getBoundingClientRect().width : null;
    },
    [],
  );

  // `width` alone used to be the only re-measure trigger, and it is
  // `undefined` for any column never resized — so this ran exactly once at
  // mount and `aria-valuenow` then lied for the rest of the session (window
  // resize, a column toggled off through the visibility menu, a data
  // refresh widening the cell). A `ResizeObserver` on the host `<th>` covers
  // all of those; `width` stays a dependency alongside it purely so a drag
  // step / arrow press still re-measures on the same synchronous tick as
  // before, ahead of whatever frame the observer callback lands on. Same
  // shape as the expanded-row observer above; `useLayoutEffect` (not
  // `useEffect`) keeps the first measurement synchronous, matching the
  // original mount-time behavior.
  React.useLayoutEffect(() => {
    const remeasure = () => {
      const measured = measureWidth(separatorRef.current);

      if (measured !== null) {
        setCurrentWidth(Math.round(measured));
      }
    };

    // Measure first and unconditionally: the observer is an *additional*
    // trigger, so an environment without `ResizeObserver` must still get the
    // mount-time measurement this effect always did.
    remeasure();

    const headerCell = separatorRef.current?.closest("th");

    if (!headerCell || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(remeasure);
    observer.observe(headerCell);

    return () => {
      observer.disconnect();
    };
    // `width` (the committed pixel width) stays a dependency too: it changes
    // synchronously on every drag step / arrow press, ahead of whatever
    // frame the `ResizeObserver` callback lands on, so this still re-measures
    // immediately for the case the effect always handled correctly.
  }, [measureWidth, width]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Ignore secondary buttons; only drive the resize on a primary press.
      if (event.button !== 0) {
        return;
      }

      const separator = event.currentTarget;
      const startWidth = measureWidth(separator);

      if (startWidth === null) {
        return;
      }

      const startX = event.clientX;

      onResizeStart();
      setResizing(true);
      separator.setPointerCapture(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;

        onResize(
          columnId,
          clampColumnWidth(
            startWidth + delta,
            minWidth,
            RESIZE_MAX_COLUMN_WIDTH,
          ),
        );
      };

      const handlePointerUp = () => {
        setResizing(false);
        separator.removeEventListener("pointermove", handlePointerMove);
        separator.removeEventListener("pointerup", handlePointerUp);
        separator.removeEventListener("pointercancel", handlePointerUp);
      };

      separator.addEventListener("pointermove", handlePointerMove);
      separator.addEventListener("pointerup", handlePointerUp);
      separator.addEventListener("pointercancel", handlePointerUp);

      event.preventDefault();
    },
    [columnId, measureWidth, minWidth, onResize, onResizeStart],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = measureWidth(event.currentTarget);

      if (current === null) {
        return;
      }

      let next: number | null = null;

      switch (event.key) {
        case "ArrowLeft":
          next = current - RESIZE_KEYBOARD_STEP;
          break;
        case "ArrowRight":
          next = current + RESIZE_KEYBOARD_STEP;
          break;
        case "Home":
          next = minWidth;
          break;
        case "End":
          // Jump to the advertised `aria-valuemax`, matching `Home`'s jump to
          // `aria-valuemin` — not a fixed number of steps past the current
          // width.
          next = RESIZE_MAX_COLUMN_WIDTH;
          break;
        default:
          return;
      }

      event.preventDefault();
      onResizeStart();
      onResize(
        columnId,
        clampColumnWidth(next, minWidth, RESIZE_MAX_COLUMN_WIDTH),
      );
    },
    [columnId, measureWidth, minWidth, onResize, onResizeStart],
  );

  return (
    <div
      aria-label={i18n.t("ui:dataTable.resizeColumn", {
        column: headerLabel,
      })}
      aria-orientation="vertical"
      // The announced range is the range the handlers actually enforce — both
      // clamp through `clampColumnWidth(next, minWidth, RESIZE_MAX_COLUMN_WIDTH)`
      // — because a splitter that reports bounds it does not honour is worse
      // than one that reports none.
      aria-valuemax={RESIZE_MAX_COLUMN_WIDTH}
      aria-valuemin={minWidth}
      aria-valuenow={currentWidth ?? undefined}
      aria-valuetext={
        currentWidth === null
          ? undefined
          : i18n.t("ui:dataTable.columnWidth", { count: currentWidth })
      }
      className={sx(
        styles.resizeHandle,
        transition.colors,
        resizing && styles.resizeHandleActive,
        focusRing.ring,
      )}
      data-resizing={resizing ? "true" : undefined}
      // Pointer-driven splitter; arrow keys adjust by a fixed step.
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      ref={separatorRef}
      role="separator"
      tabIndex={0}
    >
      <span aria-hidden className={sx(styles.resizeGrip)} />
    </div>
  );
}

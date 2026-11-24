import * as React from "react";

import { useWindowedList } from "../utils/windowed-list";
import {
  DEFAULT_ESTIMATE_ROW_HEIGHT,
  DEFAULT_OVERSCAN,
} from "./DataTable.helpers";
import type { DataTableVirtualization } from "./DataTable.types";

type UseDataTableVirtualizationOptions = {
  /** The `<tbody>` rows and spacer rows render into. */
  bodyRef: React.RefObject<HTMLTableSectionElement | null>;
  expandedRowIds: string[];
  hasRows: boolean;
  /**
   * A row that stays mounted however far the window scrolls from it — an
   * editable grid's Tab stop. A windowed-out Tab stop would take the grid out
   * of the Tab order, and a focused row unmounting drops focus to `<body>`.
   */
  keepMountedIndex?: number;
  loading: boolean;
  rowCount: number;
  /** The table's scroll frame; the root also measures it for `hideBelow`. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  virtualization?: DataTableVirtualization;
};

const rowPosition = (index: number) => index;

/** A row and its open detail row are one windowed item: measure them as one. */
function measureRowGroup(element: Element): number {
  let total = element.getBoundingClientRect().height;
  const expandedElement = element.nextElementSibling;

  if (expandedElement?.getAttribute("data-vrow-expanded") === "true") {
    total += expandedElement.getBoundingClientRect().height;
  }

  return total;
}

/**
 * Row windowing for the table frame, on the shared seam
 * (`utils/windowed-list.ts`) every long AUI list uses.
 *
 * The frame is the scroll owner and the `<tbody>` the container, so skipped
 * rows become in-flow spacer `<tr>`s and the header, pinned cells and stacked
 * presentation keep the layout they have unwindowed. The seam keeps the grid's
 * Tab stop (`keepMountedIndex`) and whichever row holds focus mounted.
 *
 * Items are keyed by position, as the hand-wired virtualizer keyed them: a
 * re-sort or filter moves rows rather than inserting any, so the table keeps
 * its scroll offset and its measured row heights. Keyed by row id, the seam
 * would re-measure every reordered row and correct the offset each time.
 */
export function useDataTableVirtualization({
  bodyRef,
  expandedRowIds,
  hasRows,
  keepMountedIndex,
  loading,
  rowCount,
  scrollRef,
  virtualization,
}: UseDataTableVirtualizationOptions) {
  const enabled = Boolean(virtualization?.enabled) && !loading && hasRows;
  const keepMounted = React.useMemo(
    () => (keepMountedIndex === undefined ? undefined : [keepMountedIndex]),
    [keepMountedIndex],
  );

  const list = useWindowedList({
    containerRef: bodyRef,
    count: rowCount,
    defaultEstimateRowHeight: DEFAULT_ESTIMATE_ROW_HEIGHT,
    getRowKey: rowPosition,
    keepMounted,
    measureRowElement: measureRowGroup,
    scrollOwnerRef: scrollRef,
    virtualization: {
      enabled,
      estimateRowHeight: virtualization?.estimateRowHeight,
      overscan: virtualization?.overscan ?? DEFAULT_OVERSCAN,
    },
  });
  const { measure } = list;

  const expandedKey = expandedRowIds.join("|");

  React.useEffect(() => {
    if (enabled) {
      measure();
    }
  }, [enabled, expandedKey, measure]);

  const expandedResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const observeExpandedRow = React.useCallback(
    (element: HTMLTableRowElement | null) => {
      if (!element || typeof ResizeObserver === "undefined") {
        return undefined;
      }

      expandedResizeObserverRef.current ??= new ResizeObserver(() => {
        measure();
      });
      const observer = expandedResizeObserverRef.current;
      observer.observe(element);
      return () => observer.unobserve(element);
    },
    [measure],
  );

  React.useEffect(
    () => () => {
      expandedResizeObserverRef.current?.disconnect();
      expandedResizeObserverRef.current = null;
    },
    [],
  );

  return {
    enabled,
    entries: list.entries,
    measureElement: list.measureRow,
    observeExpandedRow,
    spacerProps: list.spacerProps,
  };
}

import * as React from "react";

import type { DataTableColumn, DataTableStackRole } from "./DataTable.types";

/**
 * How a `DataTable` answers to its own width: which columns `hideBelow` has
 * put away, and whether `stackBelow` has turned the rows into a stacked list.
 *
 * Both read ONE measurement — the scroll frame's inline size — so a table
 * beside a docked panel narrows the same way on a desktop as on a phone, and
 * the two thresholds can never disagree about how wide the table is.
 */

/** The stacked presentation's layout facts, or `undefined` for a table. */
export type DataTableStack = {
  /** The column rendered as each row's heading line. */
  titleId: string | undefined;
};

type UseDataTableResponsiveOptions<TRow> = {
  columns: Array<DataTableColumn<TRow>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  stackBelow?: number;
};

/**
 * Measures the frame when a threshold needs it. `null` until the first
 * measurement, so nothing is hidden or stacked on a first paint that the
 * measurement then snaps back.
 *
 * Measured in a layout effect: the first measurement lands before the first
 * paint, so a phone never sees one frame of the wide table before the stacked
 * list (a passive effect painted the table first, then snapped).
 */
export function useDataTableResponsive<TRow>({
  columns,
  scrollRef,
  stackBelow,
}: UseDataTableResponsiveOptions<TRow>) {
  const [frameWidth, setFrameWidth] = React.useState<number | null>(null);
  const hasResponsiveColumns = columns.some(
    (column) => column.hideBelow != null,
  );
  const measured = hasResponsiveColumns || stackBelow != null;

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!measured || !element || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => setFrameWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measured, scrollRef]);

  // The frame's clientWidth excludes a vertical scrollbar, and a stacked list
  // is taller than its table. That only ever narrows the stacked frame, which
  // keeps it stacked: the switch cannot oscillate at the threshold.
  const stacked =
    stackBelow != null && frameWidth != null && frameWidth < stackBelow;

  /** Put away by width: `hideBelow`, or `stackRole: "hidden"` while stacked. */
  const widthHidden = React.useCallback(
    (column: DataTableColumn<TRow>) =>
      (column.hideBelow != null &&
        frameWidth != null &&
        frameWidth < column.hideBelow) ||
      (stacked && column.stackRole === "hidden"),
    [frameWidth, stacked],
  );

  return { hasResponsiveColumns, stacked, widthHidden };
}

/**
 * The stacked layout for the columns on screen: the declared title, else the
 * first visible column.
 */
export function resolveStack<TRow>(
  stacked: boolean,
  visibleColumns: Array<DataTableColumn<TRow>>,
): DataTableStack | undefined {
  if (!stacked) return undefined;
  const title =
    visibleColumns.find((column) => column.stackRole === "title") ??
    visibleColumns[0];
  return { titleId: title?.id };
}

/** A visible column's part in the stack: the title line or a meta line. */
export function stackRoleOf(
  stack: DataTableStack | undefined,
  columnId: string,
): Exclude<DataTableStackRole, "hidden"> | undefined {
  if (!stack) return undefined;
  return stack.titleId === columnId ? "title" : "meta";
}

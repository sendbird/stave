import * as React from "react";

import type {
  DataTableColumn,
  DataTableColumnPinning,
} from "./DataTable.types";

export type DataTablePinnedCell = {
  boundary: boolean;
  offset: number;
  side: "leading" | "trailing";
};

type DataTablePinningOptions<TRow> = {
  columnPinning?: DataTableColumnPinning;
  columns: Array<DataTableColumn<TRow>>;
  direction: "ltr" | "rtl";
  headerCellRefs: React.RefObject<Record<string, HTMLTableCellElement | null>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

/** How far the pinned columns reach in from each inline edge, in px. */
export type DataTablePinnedExtents = { leading: number; trailing: number };

const NO_EXTENTS: DataTablePinnedExtents = { leading: 0, trailing: 0 };

const sameOffsets = (
  first: Record<string, number>,
  second: Record<string, number>,
) => {
  const firstKeys = Object.keys(first);
  return (
    firstKeys.length === Object.keys(second).length &&
    firstKeys.every((key) => first[key] === second[key])
  );
};

/**
 * Keep pin membership controlled while preserving the caller's column order
 * inside each logical edge. Unknown, hidden, and duplicate ids are ignored.
 */
export function orderPinnedColumns<TRow>(
  columns: Array<DataTableColumn<TRow>>,
  columnPinning?: DataTableColumnPinning,
) {
  if (!columnPinning) return columns;

  const ids = new Set(columns.map((column) => column.id));
  const leadingIds = new Set(
    (columnPinning.leading ?? []).filter((id) => ids.has(id)),
  );
  const trailingIds = new Set(
    (columnPinning.trailing ?? []).filter(
      (id) => ids.has(id) && !leadingIds.has(id),
    ),
  );

  return [
    ...columns.filter((column) => leadingIds.has(column.id)),
    ...columns.filter(
      (column) => !leadingIds.has(column.id) && !trailingIds.has(column.id),
    ),
    ...columns.filter((column) => trailingIds.has(column.id)),
  ];
}

/**
 * Measure real header widths so fit, fill, resized, and hidden columns pin
 * alike. `pinnedExtents` is how much of each inline edge the pinned columns
 * cover — where the scroll cue (`DataTable.scrollEdges`) has to stand, since
 * the columns slide under a pinned one rather than under the frame's edge.
 */
export function useDataTablePinning<TRow>({
  columnPinning,
  columns,
  direction,
  headerCellRefs,
  scrollRef,
}: DataTablePinningOptions<TRow>) {
  const leadingIds = React.useMemo(
    () =>
      columns
        .filter((column) => columnPinning?.leading?.includes(column.id))
        .map((column) => column.id),
    [columnPinning?.leading, columns],
  );
  const trailingIds = React.useMemo(
    () =>
      columns
        .filter(
          (column) =>
            columnPinning?.trailing?.includes(column.id) &&
            !columnPinning.leading?.includes(column.id),
        )
        .map((column) => column.id),
    [columnPinning?.leading, columnPinning?.trailing, columns],
  );
  const [offsets, setOffsets] = React.useState<Record<string, number>>({});
  const [extents, setExtents] =
    React.useState<DataTablePinnedExtents>(NO_EXTENTS);
  const [clippedEdges, setClippedEdges] = React.useState({
    leading: false,
    trailing: false,
  });

  React.useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || (!leadingIds.length && !trailingIds.length)) {
      setOffsets((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      setExtents(NO_EXTENTS);
      setClippedEdges((current) =>
        !current.leading && !current.trailing
          ? current
          : { leading: false, trailing: false },
      );
      return;
    }

    const measure = () => {
      const next: Record<string, number> = {};
      let leadingOffset = 0;
      for (const id of leadingIds) {
        next[id] = leadingOffset;
        leadingOffset +=
          headerCellRefs.current[id]?.getBoundingClientRect().width ?? 0;
      }

      let trailingOffset = 0;
      for (const id of [...trailingIds].reverse()) {
        next[id] = trailingOffset;
        trailingOffset +=
          headerCellRefs.current[id]?.getBoundingClientRect().width ?? 0;
      }
      setOffsets((current) => (sameOffsets(current, next) ? current : next));
      setExtents((current) =>
        current.leading === leadingOffset && current.trailing === trailingOffset
          ? current
          : { leading: leadingOffset, trailing: trailingOffset },
      );
    };

    const updateClippedEdges = () => {
      const maximum = Math.max(
        0,
        scrollElement.scrollWidth - scrollElement.clientWidth,
      );
      const progress = Math.min(
        maximum,
        direction === "rtl"
          ? Math.abs(scrollElement.scrollLeft)
          : Math.max(0, scrollElement.scrollLeft),
      );
      const next = {
        leading: leadingIds.length > 0 && progress > 1,
        trailing: trailingIds.length > 0 && progress < maximum - 1,
      };
      setClippedEdges((current) =>
        current.leading === next.leading && current.trailing === next.trailing
          ? current
          : next,
      );
    };

    measure();
    updateClippedEdges();
    const observer = new ResizeObserver(() => {
      measure();
      updateClippedEdges();
    });
    observer.observe(scrollElement);
    for (const id of [...leadingIds, ...trailingIds]) {
      const cell = headerCellRefs.current[id];
      if (cell) observer.observe(cell);
    }
    scrollElement.addEventListener("scroll", updateClippedEdges, {
      passive: true,
    });

    return () => {
      observer.disconnect();
      scrollElement.removeEventListener("scroll", updateClippedEdges);
    };
  }, [direction, headerCellRefs, leadingIds, scrollRef, trailingIds]);

  const pinnedCellFor = React.useCallback(
    (columnId: string): DataTablePinnedCell | undefined => {
      const leadingIndex = leadingIds.indexOf(columnId);
      if (leadingIndex >= 0) {
        return {
          boundary:
            clippedEdges.leading && leadingIndex === leadingIds.length - 1,
          offset: offsets[columnId] ?? 0,
          side: "leading",
        };
      }

      const trailingIndex = trailingIds.indexOf(columnId);
      if (trailingIndex >= 0) {
        return {
          boundary: clippedEdges.trailing && trailingIndex === 0,
          offset: offsets[columnId] ?? 0,
          side: "trailing",
        };
      }
      return undefined;
    },
    [clippedEdges, leadingIds, offsets, trailingIds],
  );

  return { pinnedCellFor, pinnedExtents: extents };
}

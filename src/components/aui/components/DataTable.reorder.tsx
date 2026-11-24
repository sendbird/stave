/**
 * Column reordering for `DataTable`: drag a header with a mouse or pen, or
 * move a focused header with the keyboard.
 *
 * 2026-11-14. Drag a header and `onColumnOrderChange` reports the order.
 * AUI's version draws no motion at all — the picked-up header steps back and a bar marks the drop
 * edge — so there is nothing to reduce. The keyboard half follows AUI's own
 * `Board` column moves (direction-aware Left/Right, Home/End, a polite live
 * announcement of the new position), on Alt because plain arrows already
 * walk the cells of an editable table.
 *
 * - Pointer: press a header and drag past 6px; release over another header
 *   in the same group to drop before or after it. Escape cancels. A press
 *   that never passes the threshold is still a click, so sorting is
 *   unchanged. Touch does not start a drag: a horizontal swipe on the header
 *   row scrolls the table, as before.
 * - Keyboard: Alt+ArrowLeft / Alt+ArrowRight move the focused header one
 *   place, Alt+Home / Alt+End to the ends of its group.
 * - A pinned column moves inside its pinned group only; the scrolling
 *   columns move among themselves.
 */
import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { i18n } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { columnGroupOf, columnLabel, moveColumnId } from "./DataTable.columns";
import type {
  DataTableColumn,
  DataTableColumnPinning,
} from "./DataTable.types";

/** Pointer travel, in px, before a press on a header becomes a drag. */
const DRAG_THRESHOLD = 6;

/** Spread onto a sort button so a press on it can start a drag. */
export const COLUMN_GRIP_ATTR = "data-aui-column-grip";

export type DataTableColumnDrag = {
  columnId: string;
  place: "after" | "before" | null;
  targetId: string | null;
};

/** What a reorderable `<th>` wears; `undefined` for any other header. */
export type DataTableReorderHeaderProps = {
  "data-aui-column-drop"?: "after" | "before";
  "data-aui-column-dragging"?: "";
  "data-aui-column-reorderable": "";
  onKeyDown: React.KeyboardEventHandler<HTMLTableCellElement>;
  onPointerDown: React.PointerEventHandler<HTMLTableCellElement>;
};

export type DataTableColumnReorder<TRow> = {
  /** The live region's text; empty until a column has moved. */
  announcement: string;
  /** At least one visible column can be moved. */
  enabled: boolean;
  headerProps: (
    column: DataTableColumn<TRow>,
  ) => DataTableReorderHeaderProps | undefined;
};

type ReorderOptions<TRow> = {
  commitOrder: (order: string[]) => void;
  direction: "ltr" | "rtl";
  /** Reordering is on for every column that does not say otherwise. */
  enabled: boolean;
  headerCellRefs: React.RefObject<Record<string, HTMLTableCellElement | null>>;
  /** Every column id in display order, hidden ones included. */
  orderedIds: string[];
  pinning?: DataTableColumnPinning;
  visibleColumns: Array<DataTableColumn<TRow>>;
};

const INTERACTIVE = `a, button:not([${COLUMN_GRIP_ATTR}]), input, select, textarea, [role="separator"]`;

export function useDataTableColumnReorder<TRow>({
  commitOrder,
  direction,
  enabled,
  headerCellRefs,
  orderedIds,
  pinning,
  visibleColumns,
}: ReorderOptions<TRow>): DataTableColumnReorder<TRow> {
  const [drag, setDrag] = React.useState<DataTableColumnDrag | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const pendingFocus = React.useRef<string | null>(null);
  const canMove = React.useCallback(
    (column: DataTableColumn<TRow>) => column.reorderable ?? enabled,
    [enabled],
  );
  const anyReorderable = visibleColumns.some(canMove);

  // The render's inputs, read by listeners that outlive it.
  const latest = React.useRef({
    commitOrder,
    direction,
    orderedIds,
    pinning,
    visibleColumns,
  });
  latest.current = {
    commitOrder,
    direction,
    orderedIds,
    pinning,
    visibleColumns,
  };

  // A move re-inserts the header's `<th>`, which can drop focus: put it back
  // on the header that moved (its sort button, else the cell itself).
  React.useLayoutEffect(() => {
    const columnId = pendingFocus.current;
    if (columnId === null) return;
    pendingFocus.current = null;
    const cell = headerCellRefs.current[columnId];
    const target = cell?.querySelector<HTMLElement>(`[${COLUMN_GRIP_ATTR}]`);
    (target ?? cell)?.focus();
  });

  /** Visible columns sharing `columnId`'s pinned edge, in display order. */
  const groupOf = (columnId: string) => {
    const state = latest.current;
    const group = columnGroupOf(state.pinning, columnId);
    return state.visibleColumns.filter(
      (column) => columnGroupOf(state.pinning, column.id) === group,
    );
  };

  const commitMove = (
    columnId: string,
    targetId: string,
    place: "after" | "before",
  ) => {
    const state = latest.current;
    const next = moveColumnId(state.orderedIds, columnId, targetId, place);
    if (next === state.orderedIds) return false;
    const visibleIds = state.visibleColumns.map((column) => column.id);
    const moved = state.visibleColumns.find((column) => column.id === columnId);
    // Position among the columns on screen, read off the new order.
    const position =
      next.filter((id) => visibleIds.includes(id)).indexOf(columnId) + 1;
    state.commitOrder(next);
    if (moved) {
      setAnnouncement(
        i18n.t("ui:dataTable.columnMoved", {
          column: columnLabel(moved),
          position,
          total: visibleIds.length,
        }),
      );
    }
    return true;
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.target as HTMLElement).closest('[role="separator"]')) return;
    const group = groupOf(columnId);
    const index = group.findIndex((column) => column.id === columnId);
    let targetIndex: number;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const physical = event.key === "ArrowRight" ? 1 : -1;
      targetIndex =
        index + (latest.current.direction === "rtl" ? -physical : physical);
    } else if (event.key === "Home") targetIndex = 0;
    else if (event.key === "End") targetIndex = group.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    const target = group[targetIndex];
    if (!target || target.id === columnId) return;
    pendingFocus.current = columnId;
    if (
      !commitMove(columnId, target.id, targetIndex > index ? "after" : "before")
    ) {
      pendingFocus.current = null;
    }
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    const startX = event.clientX;
    let current: DataTableColumnDrag | null = null;

    const locate = (clientX: number): DataTableColumnDrag => {
      const candidates = groupOf(columnId)
        .map((column) => ({
          id: column.id,
          rect: headerCellRefs.current[column.id]?.getBoundingClientRect(),
        }))
        .filter(
          (entry): entry is { id: string; rect: DOMRect } =>
            entry.rect !== undefined,
        );
      // The header under the pointer, else the nearest one in the group.
      const hit = candidates.reduce<(typeof candidates)[number] | null>(
        (best, entry) => {
          const distance = (item: typeof entry) =>
            clientX < item.rect.left
              ? item.rect.left - clientX
              : clientX > item.rect.right
                ? clientX - item.rect.right
                : 0;
          return best === null || distance(entry) < distance(best)
            ? entry
            : best;
        },
        null,
      );
      if (!hit || hit.id === columnId) {
        return { columnId, place: null, targetId: null };
      }
      const leftHalf = clientX < hit.rect.left + hit.rect.width / 2;
      const place =
        leftHalf === (latest.current.direction === "rtl") ? "after" : "before";
      const moves =
        moveColumnId(latest.current.orderedIds, columnId, hit.id, place) !==
        latest.current.orderedIds;
      return moves
        ? { columnId, place, targetId: hit.id }
        : { columnId, place: null, targetId: null };
    };

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      setDrag(null);
    };
    const onMove = (moveEvent: PointerEvent) => {
      if (
        current === null &&
        Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD
      ) {
        return;
      }
      // Dragging a label would otherwise select the header row's text.
      moveEvent.preventDefault();
      window.getSelection()?.removeAllRanges();
      const next = locate(moveEvent.clientX);
      if (current?.targetId !== next.targetId || current.place !== next.place) {
        setDrag(next);
      }
      current = next;
    };
    // The press ended a drag: the click that follows must not sort.
    const swallowNextClick = () => {
      const swallow = (clickEvent: MouseEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    };
    const onUp = () => {
      const dropped = current;
      stop();
      if (dropped === null) return;
      swallowNextClick();
      if (dropped.targetId !== null && dropped.place !== null) {
        commitMove(columnId, dropped.targetId, dropped.place);
      }
    };
    const onCancel = () => stop();
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape" || current === null) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      stop();
      // The button is still down; its release is not a click either.
      window.addEventListener("pointerup", swallowNextClick, { once: true });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  };

  const headerProps = (
    column: DataTableColumn<TRow>,
  ): DataTableReorderHeaderProps | undefined => {
    if (!canMove(column)) return undefined;
    return {
      "data-aui-column-reorderable": "",
      ...(drag?.columnId === column.id
        ? { "data-aui-column-dragging": "" as const }
        : {}),
      ...(drag?.targetId === column.id && drag.place
        ? { "data-aui-column-drop": drag.place }
        : {}),
      onKeyDown: (event) => onKeyDown(event, column.id),
      onPointerDown: (event) => onPointerDown(event, column.id),
    };
  };

  return { announcement, enabled: anyReorderable, headerProps };
}

export const reorderStyles = stylex.create({
  /** A header that can be picked up. Listed before the pinned styles, so a
   * pinned header keeps `position: sticky`. */
  header: {
    cursor: "grab",
    position: "relative",
    userSelect: "none",
  },
  /** The header being dragged steps back; the drop bar says where it lands. */
  dragging: {
    cursor: "grabbing",
    opacity: vars["--aui-opacity-disabled"],
  },
  dropBefore: {
    "::before": {
      backgroundColor: vars["--aui-color-accent"],
      content: '""',
      inlineSize: vars["--aui-space-2"],
      insetBlock: 0,
      insetInlineStart: 0,
      pointerEvents: "none",
      position: "absolute",
    },
  },
  dropAfter: {
    "::after": {
      backgroundColor: vars["--aui-color-accent"],
      content: '""',
      inlineSize: vars["--aui-space-2"],
      insetBlock: 0,
      insetInlineEnd: 0,
      pointerEvents: "none",
      position: "absolute",
    },
  },
});

/** The reorder style list for one `<th>`, in application order. */
export function reorderHeaderStyles(
  props: DataTableReorderHeaderProps | undefined,
) {
  return props === undefined
    ? []
    : [
        reorderStyles.header,
        props["data-aui-column-dragging"] !== undefined &&
          reorderStyles.dragging,
        props["data-aui-column-drop"] === "before" && reorderStyles.dropBefore,
        props["data-aui-column-drop"] === "after" && reorderStyles.dropAfter,
      ];
}

import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { useAtelierMotion } from "../motion/useAtelierMotion";
import { vars } from "../tokens/tokens.stylex";
import type { DataTablePagination } from "./DataTable.types";

const revealFade = stylex.keyframes({
  "0%": { backgroundColor: vars["--aui-color-info-soft"] },
  "20%": { backgroundColor: vars["--aui-color-info-soft"] },
  "100%": { backgroundColor: "transparent" },
});

/**
 * The tint on rows Load more just appended: held for the first fifth, then
 * faded out over `LOAD_MORE_REVEAL_MS`. Reduced motion keeps the same tint
 * still for the same time — it is colour, not movement, and it is the only
 * thing that says where the new rows start.
 */
export const revealStyles = stylex.create({
  row: {
    animationDuration: vars["--aui-motion-duration-reveal"],
    animationFillMode: "both",
    animationName: {
      default: revealFade,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    backgroundColor: {
      default: null,
      "@media (prefers-reduced-motion: reduce)": vars["--aui-color-info-soft"],
    },
  },
});

/**
 * How long appended rows keep their tint: the JS twin of
 * `motionDurationReveal` (1500ms), which times the fade above. A timer cannot
 * read a CSS variable, so the two are kept equal by hand; change both.
 */
export const LOAD_MORE_REVEAL_MS = 1500;

/**
 * Rows ABOVE the first new one that stay in view after the scroll: the last
 * previously loaded row whole and half of the one before it, so the boundary
 * between old and new rows is on screen.
 */
const CONTEXT_ROWS = 1.5;
const NO_IDS: ReadonlySet<string> = new Set();

type PendingLoad = {
  /** Row ids on screen when Load more was pressed. */
  ids: ReadonlySet<string>;
  /** Whether the caller reported the request in flight since the press. */
  sawLoading: boolean;
};

function isScrollable(element: Element) {
  const { overflowY } = getComputedStyle(element);
  return (
    /(auto|scroll|overlay)/.test(overflowY) &&
    element.scrollHeight > element.clientHeight + 1
  );
}

/** The table's own frame when it scrolls its rows, else the nearest ancestor that does. */
function scrollContainerFor(row: HTMLElement, frame: HTMLElement | null) {
  if (frame && isScrollable(frame)) return frame;
  for (
    let element = row.parentElement;
    element && element !== document.body;
    element = element.parentElement
  ) {
    if (isScrollable(element)) return element;
  }
  return null;
}

function scrollToBoundary(
  row: HTMLElement,
  frame: HTMLElement | null,
  behavior: ScrollBehavior,
) {
  const container = scrollContainerFor(row, frame);
  const rowRect = row.getBoundingClientRect();
  const head = row.closest("table")?.tHead;
  // A sticky header stays over the top of the rows; leave room under it.
  const headInset =
    head && getComputedStyle(head).position === "sticky"
      ? head.getBoundingClientRect().height
      : 0;
  const offset = headInset + rowRect.height * CONTEXT_ROWS;

  if (container) {
    const top =
      container.scrollTop +
      rowRect.top -
      container.getBoundingClientRect().top -
      offset;
    container.scrollTo({ behavior, top: Math.max(0, top) });
    return;
  }
  window.scrollTo({
    behavior,
    top: Math.max(0, window.scrollY + rowRect.top - offset),
  });
}

/**
 * Load more appends rows below the fold, where a reader who pressed the button
 * sees nothing change but the footer's count. After the press this scrolls the
 * rows so the first new one sits `CONTEXT_ROWS` below the top (under a sticky
 * header), the last old row still visible above it, and tints the new rows for
 * `LOAD_MORE_REVEAL_MS`.
 *
 * Focus is deliberately left where it is: AUI keeps the footer's Load more (or
 * its "All rows loaded" end state) as the keyboard continuation target, and the
 * footer's count is already a polite live region, so nothing is announced
 * twice.
 *
 * Only a press of the footer's Load more (or its Retry) arms it, and only rows
 * APPENDED to the ones on screen at that press trigger it: a refetch, a filter
 * or a sort that replaces or drops rows disarms it instead.
 */
export function useLoadMoreReveal<TRow extends { id: string }>({
  pagination,
  rows,
  scrollRef,
}: {
  pagination?: DataTablePagination;
  rows: TRow[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { reduceMotion } = useAtelierMotion();
  const pendingRef = React.useRef<PendingLoad | null>(null);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const [revealedRowIds, setRevealedRowIds] =
    React.useState<ReadonlySet<string>>(NO_IDS);

  const loadMore =
    pagination?.mode === "cursor" && pagination.navigation !== "previous-next"
      ? pagination
      : null;
  const loading = Boolean(loadMore?.loading);

  const revealPagination = React.useMemo(() => {
    if (!loadMore) return pagination;
    const arm = () => {
      pendingRef.current = {
        ids: new Set(rowsRef.current.map((row) => row.id)),
        sawLoading: false,
      };
    };
    const { onLoadMore, onRetry } = loadMore;
    return {
      ...loadMore,
      onLoadMore: onLoadMore
        ? () => {
            arm();
            onLoadMore();
          }
        : undefined,
      ...(onRetry
        ? {
            onRetry: () => {
              arm();
              onRetry();
            },
          }
        : {}),
    } as DataTablePagination;
  }, [loadMore, pagination]);

  React.useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const kept =
      rows.filter((row) => pending.ids.has(row.id)).length === pending.ids.size;
    const added = rows.filter((row) => !pending.ids.has(row.id));
    // Still the rows of the press: the page has not arrived yet.
    if (kept && added.length === 0) return;
    pendingRef.current = null;
    // Rows replaced or dropped — a refetch or a filter, not an append.
    if (!kept) return;

    setRevealedRowIds(new Set(added.map((row) => row.id)));
    const frame = scrollRef.current;
    // A windowed table may not have the row mounted; the tint still applies
    // once it scrolls into the window.
    const firstNew = frame?.querySelector<HTMLElement>(
      `tr[data-row-id="${CSS.escape(added[0]!.id)}"]`,
    );
    if (firstNew) {
      scrollToBoundary(firstNew, frame, reduceMotion ? "instant" : "smooth");
    }
  }, [reduceMotion, rows, scrollRef]);

  React.useEffect(() => {
    if (revealedRowIds.size === 0) return undefined;
    const timeout = window.setTimeout(
      () => setRevealedRowIds(NO_IDS),
      LOAD_MORE_REVEAL_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [revealedRowIds]);

  React.useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (loading) {
      pending.sawLoading = true;
      return;
    }
    // The request settled without appending anything (an error, or no rows).
    if (pending.sawLoading) pendingRef.current = null;
  }, [loading]);

  return { pagination: revealPagination, revealedRowIds };
}

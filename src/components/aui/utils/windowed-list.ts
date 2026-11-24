import {
  defaultRangeExtractor,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  type Range,
  useVirtualizer,
  type Virtualizer,
  windowScroll,
} from "@tanstack/react-virtual";
import * as React from "react";

import {
  contentOffset,
  findScrollOwner,
  isWindow,
  observeLiveOffset,
  ownerOffset,
  ownerRect,
  rowIndexOf,
  type ScrollOwner,
  WINDOWED_INDEX_ATTRIBUTE,
} from "./windowed-list.helpers";

type ListVirtualizer = Virtualizer<HTMLElement, Element>;
type OffsetCallback = (offset: number, isScrolling: boolean) => void;
const readOwnerOffset = (instance: ListVirtualizer) =>
  instance.scrollElement ? ownerOffset(instance.scrollElement) : null;
// See `observeLiveOffset`: a scroll-end report reads the owner, not a replay.
const elementOffset = observeLiveOffset(
  (instance: ListVirtualizer, callback: OffsetCallback) =>
    observeElementOffset(instance, callback),
  readOwnerOffset,
);
// The window arm is the library's own observer for a page-level owner; the
// cast only bridges `useVirtualizer`'s Element-typed signature.
const windowOffset = observeLiveOffset(
  (instance: ListVirtualizer, callback: OffsetCallback) =>
    (observeWindowOffset as unknown as typeof observeElementOffset)(
      instance,
      callback,
    ),
  readOwnerOffset,
);

export {
  flattenWindowedChildren,
  WINDOWED_INDEX_ATTRIBUTE,
  type WindowedChild,
} from "./windowed-list.helpers";

/**
 * The windowed-scroll seam every long AUI list shares.
 *
 * `LogViewer` and `DataTable` each wired `@tanstack/react-virtual` on their own,
 * and four more surfaces (`Thread`, `TranscriptList`, `ActivityFeed`, `Inbox`)
 * rendered every row. What they needed was not "a virtualizer" — the library
 * is one — but the same five decisions made once. All six now window here:
 *
 * 1. **Who scrolls.** A list is windowed against the one element that already
 *    owns vertical scrolling. `Thread` and `TranscriptList` are their own scroll
 *    containers; `ActivityFeed` and `Inbox` never were, so they window against
 *    the nearest scrolling ancestor (or the page) instead of becoming a second,
 *    nested scroller. Windowing must never add a scroll owner.
 * 2. **Rows stay in flow.** Skipped rows become in-flow spacer elements, not
 *    absolutely positioned items, so the list keeps its own grid `gap`, its
 *    `<ol>`/`<li>` shape and every row style it had. The gap is read from the
 *    container's computed `row-gap`, so a density preset that moves it is
 *    measured rather than assumed.
 * 3. **Focus survives the window.** The row holding focus — and its immediate
 *    neighbours — stay mounted however far the reader scrolls away, so focus is
 *    never dropped to `<body>` and Tab / Shift+Tab still reach the adjacent row.
 * 4. **Reading position survives inserts.** When rows are inserted above the
 *    reader (history prepends, new notifications at the top), the row at the
 *    viewport's leading edge keeps its offset. Browser scroll anchoring is
 *    switched off on the container because it would double-apply the virtual
 *    size corrections; this replaces it.
 * 5. **The scroll position is adopted, never reset.** Windowing turns on
 *    against wherever the owner already is, so a list mounting inside a
 *    scrolled panel does not yank it to the top.
 *
 * Windowing is opt-in (`virtualization.enabled`) for the same reason
 * `DataTable`'s is: it changes contracts a consumer can observe — find-in-page,
 * printing, a screen reader's browse mode reading past the window, a DOM query
 * for a row that is not mounted. Flipping those at a row-count threshold would
 * change them in production the day the data grew, which is the worst time.
 */

/** Opt-in windowing options shared by `Thread`, `TranscriptList`, `ActivityFeed` and `Inbox`. */
export type ListVirtualization = {
  /** Turn windowing on. Defaults to `false` — every row renders, as before. */
  enabled?: boolean;
  /**
   * Best-guess block size (px) of a row that has not been measured yet. Rows
   * are measured as they mount, so this only shapes the first scroll range.
   */
  estimateRowHeight?: number;
  /** Rows rendered beyond the viewport on each edge. Defaults to 8. */
  overscan?: number;
};

const DEFAULT_OVERSCAN = 8;
/** Rows kept mounted on each side of the focused row. */
const FOCUS_NEIGHBOURS = 2;

export type WindowedEntry =
  | { index: number; key: React.Key; type: "row" }
  | { key: string; size: number; type: "spacer" };

export type UseWindowedListOptions = {
  /** The element rows (and spacers) render into. */
  containerRef: React.RefObject<HTMLElement | null>;
  count: number;
  /** Component default for `virtualization.estimateRowHeight`. */
  defaultEstimateRowHeight: number;
  /** Stable key per data index; also the measurement-cache key. */
  getRowKey: (index: number) => React.Key;
  /**
   * Index to open at instead of adopting the owner's offset — a restored
   * reading position. Consumed when windowing turns on.
   */
  initialIndex?: number;
  /** Data indexes that stay mounted wherever the window is. */
  keepMounted?: readonly number[];
  /**
   * Block size of a mounted row when it is more than the row element — a
   * table row and its open detail row measured as one. Defaults to the
   * element's border box.
   */
  measureRowElement?: (element: Element) => number;
  /**
   * Whether the reader's position is held: inserts above keep the leading
   * row in place, and a row above the viewport that is measured at a new size
   * shifts the scroll by the difference. `Thread` answers `false` while it
   * follows its live edge — there the pin owns the scroll position, and a
   * correction scrolling up would read as the reader leaving the edge.
   */
  preserveAnchor?: () => boolean;
  /** The scroll owner, when the component already knows it. */
  scrollOwnerRef?: React.RefObject<HTMLElement | null>;
  virtualization?: ListVirtualization;
};

export type WindowedList = {
  /** The scroll owner is known and the window is rendering. */
  active: boolean;
  /** Rows and spacers in DOM order. Empty unless `windowed`. */
  entries: WindowedEntry[];
  /** Whether a row is currently mounted. */
  isRendered: (index: number) => boolean;
  /**
   * Drop every measured size and measure again, for a change the rows' own
   * resize observation cannot see. Stable across renders.
   */
  measure: () => void;
  /** Ref callback for every row element. */
  measureRow: (element: Element | null) => void;
  /** Attributes a row element must carry. */
  rowAttributes: (index: number) => { [WINDOWED_INDEX_ATTRIBUTE]: number };
  /** Scroll a row into the window by data index. Stable across renders. */
  scrollToIndex: (
    index: number,
    options?: { align?: "auto" | "center" | "end" | "start" },
  ) => void;
  /** Props for a spacer element standing in for skipped rows. */
  spacerProps: (size: number) => {
    "aria-hidden": true;
    "data-windowed-spacer": "";
    role: "presentation";
    style: React.CSSProperties;
  };
  /** Windowing was requested (`virtualization.enabled`). */
  windowed: boolean;
};

type Geometry = { gap: number; margin: number };
type Anchor = { delta: number; index: number; key: React.Key };
type Tracked = { index: number; key: React.Key };

function sameGeometry(a: Geometry, b: Geometry) {
  return Math.abs(a.gap - b.gap) < 0.5 && Math.abs(a.margin - b.margin) < 1;
}

function resolveIndex(
  tracked: Tracked,
  count: number,
  getRowKey: (index: number) => React.Key,
): number {
  if (tracked.index < count && getRowKey(tracked.index) === tracked.key) {
    return tracked.index;
  }
  for (let index = 0; index < count; index += 1) {
    if (getRowKey(index) === tracked.key) return index;
  }
  return -1;
}

export function useWindowedList({
  containerRef,
  count,
  defaultEstimateRowHeight,
  getRowKey,
  initialIndex,
  keepMounted,
  measureRowElement,
  preserveAnchor,
  scrollOwnerRef,
  virtualization,
}: UseWindowedListOptions): WindowedList {
  const windowed = virtualization?.enabled === true;
  const estimate =
    virtualization?.estimateRowHeight ?? defaultEstimateRowHeight;
  const overscan = virtualization?.overscan ?? DEFAULT_OVERSCAN;
  const [owner, setOwner] = React.useState<ScrollOwner | null>(null);
  const [geometry, setGeometry] = React.useState<Geometry>({
    gap: 0,
    margin: 0,
  });
  const [focused, setFocused] = React.useState<Tracked | null>(null);
  const anchorRef = React.useRef<Anchor | null>(null);
  const pendingOffsetRef = React.useRef<number | null>(null);
  const initialRectRef = React.useRef<
    { height: number; width: number } | undefined
  >(undefined);
  const preserveAnchorRef = React.useRef(preserveAnchor);
  preserveAnchorRef.current = preserveAnchor;
  const getRowKeyRef = React.useRef(getRowKey);
  getRowKeyRef.current = getRowKey;

  const measureGeometry = React.useCallback(
    (scrollOwner: ScrollOwner) => {
      const container = containerRef.current;
      if (!container) return;
      const next = {
        gap: parseFloat(getComputedStyle(container).rowGap) || 0,
        margin: contentOffset(container, scrollOwner),
      };
      setGeometry((current) => (sameGeometry(current, next) ? current : next));
    },
    [containerRef],
  );

  // Owner detection. Windowing stays off until the owner is known, so the first
  // enabled render reads the owner's real offset instead of writing a default
  // one into it — see rule 5 above.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!windowed || !container) {
      setOwner(null);
      return;
    }
    const next = scrollOwnerRef?.current ?? findScrollOwner(container);
    measureGeometry(next);
    initialRectRef.current = ownerRect(next);
    setOwner((current) => (current === next ? current : next));
  }, [containerRef, measureGeometry, scrollOwnerRef, windowed]);

  const enabled = windowed && owner !== null;
  const focusIndex =
    enabled && focused ? resolveIndex(focused, count, getRowKey) : -1;
  const keepIndexes = new Set<number>(keepMounted ?? []);
  if (focusIndex >= 0) {
    for (let step = -FOCUS_NEIGHBOURS; step <= FOCUS_NEIGHBOURS; step += 1) {
      keepIndexes.add(focusIndex + step);
    }
  }
  // A string, so the extractor (and the range it memoises) only changes when
  // the kept set does — callers rebuild `keepMounted` on every render.
  const keptKey = [...keepIndexes]
    .filter((index) => index >= 0 && index < count)
    .sort((a, b) => a - b)
    .join(",");
  const kept = React.useMemo(
    () => (keptKey === "" ? [] : keptKey.split(",").map(Number)),
    [keptKey],
  );

  const rangeExtractor = React.useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (kept.length === 0) return indexes;
      const merged = new Set(indexes);
      for (const index of kept) merged.add(index);
      return merged.size === indexes.length
        ? indexes
        : [...merged].sort((a, b) => a - b);
    },
    [kept],
  );

  const recordAnchor = React.useCallback(
    (instance: Virtualizer<HTMLElement, Element>) => {
      const offset = instance.scrollOffset;
      const measurements = instance.measurementsCache;
      const first = measurements[0];
      const last = measurements[measurements.length - 1];
      // Only a viewport whose leading edge is inside the list has a row to
      // hold. Content above or below the list is the browser's to anchor.
      if (offset == null || !first || !last || offset < first.start) {
        anchorRef.current = null;
        return;
      }
      if (offset >= last.end) {
        anchorRef.current = null;
        return;
      }
      const item = instance.getVirtualItemForOffset(offset);
      anchorRef.current = item
        ? { delta: offset - item.start, index: item.index, key: item.key }
        : null;
    },
    [],
  );

  const ownerIsWindow = owner !== null && isWindow(owner);
  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count: enabled ? count : 0,
    enabled,
    estimateSize: () => estimate,
    gap: geometry.gap,
    getItemKey: getRowKey,
    getScrollElement: () => owner as HTMLElement | null,
    indexAttribute: WINDOWED_INDEX_ATTRIBUTE,
    initialOffset: () => {
      if (!owner) return 0;
      if (initialIndex !== undefined && initialIndex >= 0) {
        return geometry.margin + initialIndex * (estimate + geometry.gap);
      }
      return ownerOffset(owner);
    },
    initialRect: initialRectRef.current,
    measureElement: measureRowElement
      ? (element) => measureRowElement(element)
      : undefined,
    // The window arms are the library's own observers for a page-level owner;
    // the casts only bridge `useVirtualizer`'s Element-typed signature.
    observeElementOffset: ownerIsWindow ? windowOffset : elementOffset,
    observeElementRect: ownerIsWindow
      ? (observeWindowRect as unknown as typeof observeElementRect)
      : observeElementRect,
    onChange: recordAnchor,
    overscan,
    rangeExtractor,
    scrollMargin: geometry.margin,
    scrollToFn: ownerIsWindow
      ? (windowScroll as unknown as typeof elementScroll)
      : elementScroll,
  });

  // Size corrections for rows above the viewport: the library's default rule
  // (first measurement always, re-measurement unless scrolling backward), but
  // never while the component owns the position (a followed live edge).
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _d, v) =>
    (preserveAnchorRef.current?.() ?? true) &&
    item.start < (v.scrollOffset ?? 0) &&
    (!v.itemSizeCache.has(item.key) || v.scrollDirection !== "backward");

  // Rule 4, applied during render so this pass already computes the window at
  // the corrected offset; the layout effect below syncs the DOM to it.
  const anchor = anchorRef.current;
  if (
    enabled &&
    anchor &&
    virtualizer.scrollOffset !== null &&
    (preserveAnchorRef.current?.() ?? true)
  ) {
    const next = resolveIndex(anchor, count, getRowKey);
    if (next >= 0 && next !== anchor.index) {
      virtualizer.getTotalSize();
      const item = virtualizer.measurementsCache[next];
      if (item) {
        const offset = item.start + anchor.delta;
        virtualizer.scrollOffset = offset;
        pendingOffsetRef.current = offset;
      }
    }
  }

  React.useLayoutEffect(() => {
    if (!enabled || !owner) return;
    measureGeometry(owner);
    const pending = pendingOffsetRef.current;
    if (pending !== null) {
      pendingOffsetRef.current = null;
      virtualizer.scrollToOffset(pending);
    }
    recordAnchor(virtualizer);
  });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || !owner) return;
    const onFocusIn = (event: FocusEvent) => {
      const index = rowIndexOf(event.target, container);
      if (index === null) return;
      const key = getRowKeyRef.current(index);
      setFocused((current) =>
        current?.index === index && current.key === key
          ? current
          : { index, key },
      );
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && container.contains(next)) return;
      // A window blur reports no related target but leaves focus in place;
      // the row must stay mounted for the browser to restore it.
      if (!next && container.contains(document.activeElement)) return;
      setFocused(null);
    };
    const onResize = () => measureGeometry(owner);
    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(onResize);
    observer?.observe(container);
    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      observer?.disconnect();
    };
  }, [containerRef, enabled, measureGeometry, owner]);

  const items = enabled ? virtualizer.getVirtualItems() : [];
  const entries: WindowedEntry[] = [];
  const spacer = (key: string, size: number): WindowedEntry => ({
    key,
    size: Math.max(0, size),
    type: "spacer",
  });
  if (windowed && !enabled && count > 0) {
    // Before the owner is known: hold the estimated height, so the owner's
    // scroll range does not collapse (and clamp its offset) for one frame.
    entries.push(
      spacer("windowed-spacer-pending", count * (estimate + geometry.gap)),
    );
  }
  const { gap, margin } = geometry;
  let previousIndex = -1;
  let previousEnd = margin - gap;
  for (const item of items) {
    if (item.index !== previousIndex + 1) {
      entries.push(
        spacer(
          previousIndex < 0
            ? "windowed-spacer-start"
            : `windowed-spacer-${item.index}`,
          item.start - previousEnd - 2 * gap,
        ),
      );
    }
    entries.push({ index: item.index, key: item.key, type: "row" });
    previousIndex = item.index;
    previousEnd = item.end;
  }
  if (items.length > 0 && previousIndex < count - 1) {
    const totalEnd = virtualizer.getTotalSize() + margin;
    entries.push(spacer("windowed-spacer-end", totalEnd - previousEnd - gap));
  }

  const rendered = new Set(items.map((item) => item.index));
  const scrollToIndex = React.useCallback<WindowedList["scrollToIndex"]>(
    (index, options) =>
      virtualizer.scrollToIndex(index, { align: options?.align ?? "auto" }),
    [virtualizer],
  );
  const measure = React.useCallback(() => virtualizer.measure(), [virtualizer]);

  return {
    active: enabled,
    entries,
    isRendered: (index) => rendered.has(index),
    measure,
    measureRow: virtualizer.measureElement,
    rowAttributes: (index) => ({ [WINDOWED_INDEX_ATTRIBUTE]: index }),
    scrollToIndex,
    spacerProps: (size) => ({
      "aria-hidden": true,
      "data-windowed-spacer": "",
      role: "presentation",
      style: { blockSize: size, flexShrink: 0 },
    }),
    windowed,
  };
}

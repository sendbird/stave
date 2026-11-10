import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/** One rendered position of a windowed list: a row, or a spacer standing in for unmounted rows. */
export type WindowedSlot =
  | { kind: "item"; index: number; key: string }
  | { kind: "gap"; key: string; size: number };

export interface WindowedListOptions {
  /** Stable row keys in display order. Pass a memoized array. */
  keys: readonly string[];
  /** Size guess in px for a row not yet measured. A number is refined to the median of measured rows. */
  estimateSize: number | ((index: number) => number);
  /** Windowing is on only when true; otherwise every row renders and nothing is measured. */
  enabled?: boolean;
  /** The element that scrolls the list. Defaults to the nearest scrolling ancestor. */
  scrollOwner?: (list: HTMLElement) => HTMLElement | null;
  /** Extra px rendered above and below the visible area. */
  overscan?: number;
  /** Rows rendered before the scroll owner is known (first commit, static markup). */
  initialCount?: number;
  /**
   * Rows kept mounted wherever they are, in addition to the row holding focus.
   * A function receives the first visible row's index.
   */
  pinnedKeys?: readonly string[] | ((firstVisibleIndex: number) => readonly string[]);
  /** Height of sticky content covering the top of the scroll owner, such as a table header. */
  insetStart?: () => number;
  /**
   * Lists of the same kind of row share their typical measured size under this name,
   * so a list that has not rendered a row yet (below the view) still sizes its
   * spacer from real rows instead of the estimate.
   */
  sizeGroup?: string;
}

/** The latest typical row size of each size group, and who listens. */
const groupTypicalSizes = new Map<string, number>();
const groupListeners = new Map<string, Set<() => void>>();

function publishGroupSize(group: string, size: number) {
  if (Math.abs((groupTypicalSizes.get(group) ?? -1) - size) < 0.5) return;
  groupTypicalSizes.set(group, size);
  groupListeners.get(group)?.forEach((listener) => listener());
}

export interface WindowedList {
  /** Attach to the element whose direct children are the slots. */
  listRef: (element: HTMLElement | null) => void;
  /** Attach to each row element; it must carry `data-windowed-key`. */
  measureRef: (element: HTMLElement | null) => void | (() => void);
  slots: readonly WindowedSlot[];
  /** The first row under the visible top edge (after `insetStart`). */
  firstVisibleIndex: number;
  /** Scrolls the least distance that shows the row; does nothing when it is already visible. */
  scrollToIndex: (index: number) => void;
}

interface Range { start: number; end: number; first: number }

const DEFAULT_OVERSCAN = 600;

function nearestScrollOwner(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    if (/(auto|scroll)/.test(getComputedStyle(current).overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * The median measured size of a list's rows, or undefined before any is
 * measured. A median ignores the odd taller or shorter row (a header, the
 * default workspace), so unmeasured rows take the common size.
 */
function typicalSize(keys: readonly string[], sizes: ReadonlyMap<string, number>) {
  const measured: number[] = [];
  for (const key of keys) {
    const size = sizes.get(key);
    if (size !== undefined) measured.push(size);
  }
  if (measured.length === 0) return undefined;
  measured.sort((a, b) => a - b);
  return measured[measured.length >> 1]!;
}

/** Smallest index whose bottom edge lies below `y`. */
function indexBelow(offsets: Float64Array, count: number, y: number) {
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle + 1]! > y) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Largest index whose top edge lies above `y`, or -1. */
function indexAbove(offsets: Float64Array, count: number, y: number) {
  let low = -1;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (offsets[middle]! < y) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Renders the rows of a long list that are near the visible area of its scroll
 * owner, with spacers in the normal flow for the rest. Row sizes are measured,
 * so rows of any height keep their real position, and the browser's scroll
 * anchoring holds the view still when a size above it changes. The row that
 * holds focus and any pinned rows stay mounted when they leave the window.
 */
export function useWindowedList(options: WindowedListOptions): WindowedList {
  const { keys, enabled = true, initialCount = 30, pinnedKeys } = options;
  const count = keys.length;
  const latest = useRef(options);
  latest.current = options;
  const sizes = useRef(new Map<string, number>());
  const elements = useRef(new Map<string, HTMLElement>());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [list, setList] = useState<HTMLElement | null>(null);
  const owner = useRef<HTMLElement | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(() => ({ start: 0, end: Math.min(count, initialCount) - 1, first: 0 }));

  const sizeGroup = options.sizeGroup;
  useEffect(() => {
    if (!sizeGroup) return;
    const listeners = groupListeners.get(sizeGroup) ?? new Set<() => void>();
    groupListeners.set(sizeGroup, listeners);
    const listener = () => setMeasureVersion((version) => version + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [sizeGroup]);

  const offsets = useMemo(() => {
    const estimate = latest.current.estimateSize;
    const typical = typeof estimate === "number" ? typicalSize(keys, sizes.current) : undefined;
    const shared = sizeGroup ? groupTypicalSizes.get(sizeGroup) : undefined;
    const fallback = typeof estimate === "number" ? (typical ?? shared ?? estimate) : 0;
    const result = new Float64Array(count + 1);
    for (let index = 0; index < count; index += 1) {
      result[index + 1] = result[index]! + (sizes.current.get(keys[index]!) ?? (typeof estimate === "number" ? fallback : estimate(index)));
    }
    return result;
    // measureVersion invalidates the measured sizes held in the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, keys, measureVersion, sizeGroup]);
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;

  /** The visible span in list coordinates. */
  const viewport = useCallback(() => {
    const scroller = owner.current;
    if (!scroller || !list) return null;
    const ownerBox = scroller.getBoundingClientRect();
    const listTop = list.getBoundingClientRect().top;
    const inset = latest.current.insetStart?.() ?? 0;
    const top = ownerBox.top + scroller.clientTop - listTop;
    return { top: top + inset, bottom: top + scroller.clientHeight };
  }, [list]);

  const updateRange = useCallback(() => {
    const view = viewport();
    const total = latest.current.keys.length;
    if (!view || total === 0) return;
    const current = offsetsRef.current;
    const margin = latest.current.overscan ?? DEFAULT_OVERSCAN;
    const start = indexBelow(current, total, view.top - margin);
    const end = indexAbove(current, total, view.bottom + margin);
    const first = indexBelow(current, total, view.top + 1);
    setRange((previous) => (previous.start === start && previous.end === end && previous.first === first ? previous : { start, end, first }));
  }, [viewport]);

  useLayoutEffect(() => {
    if (!list || !enabled) return;
    const scroller = latest.current.scrollOwner?.(list) ?? nearestScrollOwner(list);
    owner.current = scroller;
    if (!scroller) return;
    updateRange();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; updateRange(); });
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(scroller);
    resize?.observe(list);
    return () => {
      scroller.removeEventListener("scroll", schedule);
      resize?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, list, updateRange]);

  // New sizes or keys move rows; recompute before paint.
  useLayoutEffect(() => { if (enabled) updateRange(); }, [enabled, offsets, updateRange]);

  // The row holding focus stays mounted while focus is inside the list.
  useEffect(() => {
    if (!list || !enabled) return;
    const rowKey = (node: EventTarget | null) => {
      let element = node instanceof Element ? node : null;
      while (element && element.parentElement !== list) element = element.parentElement;
      return element instanceof HTMLElement ? (element.dataset.windowedKey ?? null) : null;
    };
    const onFocusIn = (event: FocusEvent) => setFocusedKey(rowKey(event.target));
    let frame = 0;
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!list.contains(document.activeElement)) setFocusedKey(null); });
    };
    list.addEventListener("focusin", onFocusIn);
    list.addEventListener("focusout", onFocusOut);
    return () => {
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
      cancelAnimationFrame(frame);
    };
  }, [enabled, list]);

  const observer = useRef<ResizeObserver | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const measureRef = useCallback((element: HTMLElement | null) => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const key = element.dataset.windowedKey;
    if (key === undefined) return;
    elements.current.set(key, element);
    observer.current ??= new ResizeObserver((entries) => {
      if (!enabledRef.current) return;
      let changed = false;
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const entryKey = target.dataset.windowedKey;
        if (entryKey === undefined || !target.isConnected) continue;
        const size = entry.borderBoxSize?.[0]?.blockSize ?? target.getBoundingClientRect().height;
        if (Math.abs((sizes.current.get(entryKey) ?? -1) - size) > 0.5) {
          sizes.current.set(entryKey, size);
          changed = true;
        }
      }
      if (!changed) return;
      const group = latest.current.sizeGroup;
      if (group) {
        const typical = typicalSize(latest.current.keys, sizes.current);
        if (typical !== undefined) publishGroupSize(group, typical);
      }
      setMeasureVersion((version) => version + 1);
    });
    const resize = observer.current;
    resize.observe(element);
    return () => {
      resize.unobserve(element);
      if (elements.current.get(key) === element) elements.current.delete(key);
    };
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const scrollToIndex = useCallback((index: number) => {
    const scroller = owner.current;
    const view = viewport();
    const key = latest.current.keys[index];
    if (!scroller || !view || !list || key === undefined) return;
    const mounted = elements.current.get(key);
    let top = offsetsRef.current[index]!;
    let bottom = offsetsRef.current[index + 1]!;
    if (mounted?.isConnected) {
      const box = mounted.getBoundingClientRect();
      const listTop = list.getBoundingClientRect().top;
      top = box.top - listTop;
      bottom = box.bottom - listTop;
    }
    if (top < view.top) scroller.scrollTop -= view.top - top;
    else if (bottom > view.bottom) scroller.scrollTop += Math.min(bottom - view.bottom, top - view.top);
    else return;
    updateRange();
  }, [list, updateRange, viewport]);

  const indexOf = useMemo(() => new Map(keys.map((key, index) => [key, index])), [keys]);
  const slots = useMemo<WindowedSlot[]>(() => {
    if (!enabled) return keys.map((key, index) => ({ kind: "item", index, key }));
    const wanted = new Set<number>();
    const end = Math.min(range.end, count - 1);
    for (let index = Math.max(0, range.start); index <= end; index += 1) wanted.add(index);
    const pinned = typeof pinnedKeys === "function" ? pinnedKeys(Math.min(range.first, count - 1)) : (pinnedKeys ?? []);
    for (const key of [focusedKey, ...pinned]) {
      const index = key === null ? undefined : indexOf.get(key);
      if (index !== undefined) wanted.add(index);
    }
    const result: WindowedSlot[] = [];
    let cursor = 0;
    for (const index of [...wanted].sort((a, b) => a - b)) {
      if (index > cursor) result.push({ kind: "gap", key: `gap-${cursor}`, size: offsets[index]! - offsets[cursor]! });
      result.push({ kind: "item", index, key: keys[index]! });
      cursor = index + 1;
    }
    const tail = offsets[count]! - offsets[cursor]!;
    if (tail > 0.5) result.push({ kind: "gap", key: `gap-${cursor}`, size: tail });
    return result;
  }, [count, enabled, focusedKey, indexOf, keys, offsets, pinnedKeys, range]);

  return {
    listRef: setList,
    measureRef,
    slots,
    firstVisibleIndex: enabled ? Math.min(range.first, Math.max(0, count - 1)) : 0,
    scrollToIndex,
  };
}

const EDITABLE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
let pendingFocus: { frame: number } | null = null;

/** Drops a focus request that has not landed yet. */
export function cancelFocusWhenMounted() {
  if (pendingFocus) cancelAnimationFrame(pendingFocus.frame);
  pendingFocus = null;
}

/**
 * Focuses the element `find` returns once it is mounted, trying each frame for
 * a bounded number of frames. A request lands at most once, and only while
 * focus is still where it was when the request was made (or fell to the body
 * because that row unmounted) and is not in a text field. A newer request
 * replaces an older one.
 */
export function focusWhenMounted(find: () => HTMLElement | null, frames = 30) {
  cancelFocusWhenMounted();
  const origin = document.activeElement;
  const attempt = (left: number) => {
    pendingFocus = null;
    const active = document.activeElement;
    if (active !== origin && active !== document.body && active !== null) return;
    if (active?.closest(EDITABLE)) return;
    const element = find();
    if (element?.isConnected) { element.focus({ preventScroll: true }); return; }
    if (left > 0) pendingFocus = { frame: requestAnimationFrame(() => attempt(left - 1)) };
  };
  attempt(frames);
}

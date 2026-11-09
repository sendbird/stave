import * as React from "react";

/**
 * The transcript's follow arithmetic and the hook that wires it to a viewport.
 *
 * Split out of `Thread.parts.tsx` for the 500-line source cap, and the seam is
 * the useful one: everything here is *scroll behaviour* and holds no markup,
 * while `Thread.parts.tsx` is the anatomy — roles, announcements, the divider,
 * the blank slate, the stylesheet. Nothing in this file renders, which is why
 * it is a `.ts`.
 */

/**
 * How close to the bottom (px) still counts as "at the live edge". Above one
 * line of body text (14px at `lineHeightNormal` = 20px), so a nudge of less
 * than a line still reads as watching; below the 48px that would swallow a
 * deliberate one-line step back.
 */
export const AT_BOTTOM_THRESHOLD = 32;

/**
 * Upward movement (px) below which a scroll event is jitter rather than intent:
 * sub-pixel rounding, and the settle frame at the end of a momentum fling.
 */
export const SCROLL_UP_EPSILON = 2;

/** Sub-pixel layout rounding still counts as aligned with a viewport edge. */
const VIEWPORT_EDGE_EPSILON = 1;

export type LiveEdgeSample = {
  clientHeight: number;
  /** Whether the viewport was following the live edge before this sample. */
  following: boolean;
  /** `scrollHeight` at the previous sample. */
  previousHeight: number;
  /** `scrollTop` at the previous sample. */
  previousTop: number;
  scrollHeight: number;
  scrollTop: number;
};

export type LiveEdgeState = {
  /** The live edge is in view; the jump affordance stays hidden. */
  atBottom: boolean;
  /** Growth should pin the viewport to the live edge. */
  following: boolean;
};

export type ThreadPosition = {
  /** Stable `Thread.Item` id nearest the viewport's leading edge. */
  itemId: string;
  /** Item top relative to viewport top; may be negative when partly read. */
  offset: number;
};

export type ThreadScrollToItemOptions = {
  behavior?: ScrollBehavior;
  block?: "center" | "nearest" | "start";
};

function motionSafeBehavior(behavior: ScrollBehavior): ScrollBehavior {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return behavior === "smooth" && reduced ? "auto" : behavior;
}

function threadItems(node: HTMLElement): HTMLElement[] {
  return Array.from(
    node.querySelectorAll<HTMLElement>("[data-thread-item-id]"),
  );
}

function findThreadItem(
  node: HTMLElement,
  itemId: string,
): HTMLElement | undefined {
  return threadItems(node).find((item) => item.dataset.threadItemId === itemId);
}

export function readThreadPosition(
  viewport: HTMLElement,
): ThreadPosition | null {
  return readThreadViewportSnapshot(viewport, { visibleItems: false }).position;
}

export function readVisibleThreadItemIds(viewport: HTMLElement): string[] {
  return readThreadViewportSnapshot(viewport, { position: false })
    .visibleItemIds;
}

export type ThreadViewportSnapshot = {
  position: ThreadPosition | null;
  visibleItemIds: string[];
};

/**
 * Position and visibility from one item query and one rect read per row.
 * Scroll is the hottest transcript path; two independent passes doubled its
 * forced-layout work on every frame for consumers that persisted both values.
 */
export function readThreadViewportSnapshot(
  viewport: HTMLElement,
  options: { position?: boolean; visibleItems?: boolean } = {},
): ThreadViewportSnapshot {
  const includePosition = options.position ?? true;
  const includeVisibleItems = options.visibleItems ?? true;
  const bounds = viewport.getBoundingClientRect();
  let position: ThreadPosition | null = null;
  const visibleItemIds: string[] = [];

  for (const item of threadItems(viewport)) {
    const rect = item.getBoundingClientRect();
    const itemId = item.dataset.threadItemId;
    if (!itemId) continue;
    if (includePosition && position === null && rect.bottom > bounds.top) {
      position = { itemId, offset: rect.top - bounds.top };
    }
    if (
      includeVisibleItems &&
      rect.bottom > bounds.top &&
      rect.top < bounds.bottom
    ) {
      visibleItemIds.push(itemId);
    }
    if (!includeVisibleItems && position !== null) break;
  }

  return { position, visibleItemIds };
}

/**
 * The whole follow decision, as one pure function of two samples.
 *
 * Pure and exported so the behaviour can be exercised without a DOM: "does the
 * transcript stop following the moment the reader scrolls away" is a claim
 * about arithmetic, and a claim about arithmetic should not have to be
 * verified by watching a screen.
 *
 * Three things it gets right that a position-only check does not:
 *
 * 1. **Direction beats position.** A reader who nudges up 10px mid-stream is
 *    still inside `AT_BOTTOM_THRESHOLD`, so a position-only check re-pins them
 *    and eats the nudge on the next growth frame — the "fighting the user"
 *    failure. Any upward movement releases the follow; only a downward return
 *    re-engages it.
 * 2. **A shrink is not a scroll-up.** When a completed tool run collapses, the
 *    browser clamps `scrollTop` to the new maximum and fires a scroll event
 *    indistinguishable from a reader scrolling up. Per the HTML rendering
 *    steps that event is dispatched *before* the frame's ResizeObserver
 *    callbacks, so the component cannot front-run it with a flag; subtracting
 *    the height loss from the observed movement is what stops a collapsing
 *    payload from silently unpinning the transcript.
 * 3. **Our own follow scroll is invisible here.** Every scroll this component
 *    performs moves *down*, so it is never mistaken for reader intent.
 */
export function resolveLiveEdge({
  clientHeight,
  following,
  previousHeight,
  previousTop,
  scrollHeight,
  scrollTop,
}: LiveEdgeSample): LiveEdgeState {
  const shrink = Math.max(0, previousHeight - scrollHeight);
  const movedUp = previousTop - scrollTop - shrink;
  const distance = scrollHeight - scrollTop - clientHeight;
  const atBottom = distance <= AT_BOTTOM_THRESHOLD;

  if (movedUp > SCROLL_UP_EPSILON) {
    return { atBottom, following: false };
  }

  if (atBottom) {
    return { atBottom, following: true };
  }

  return { atBottom, following };
}

/**
 * Live-edge follow, wired to a real viewport. Two observers, one decision:
 *
 * - the **scroll** listener reads reader intent (direction, not position) and
 *   is the only thing that may release or re-engage the follow;
 * - the **ResizeObserver** on the content column reads growth — new turns,
 *   streamed tokens, an image finishing its decode, a payload collapsing —
 *   none of which fire a scroll event, and so none of which may change the
 *   follow decision. It only acts on it.
 *
 * Keeping those two jobs apart is what makes "hands control back the moment
 * the reader scrolls away" true rather than approximately true.
 */
export function useLiveEdgeFollow(initialPosition?: ThreadPosition) {
  const viewportRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  // The decision lives in a ref as well as in state: scroll fires per frame,
  // and the ResizeObserver needs the current answer synchronously — which a
  // state value captured in a closure cannot give it.
  const stateRef = React.useRef<LiveEdgeState>({
    atBottom: true,
    following: true,
  });
  const previousRef = React.useRef({ height: 0, top: 0 });
  const initialPositionRef = React.useRef(initialPosition);
  const [edge, setEdge] = React.useState<LiveEdgeState>(stateRef.current);

  const commit = React.useCallback((next: LiveEdgeState) => {
    const current = stateRef.current;

    if (
      current.atBottom === next.atBottom &&
      current.following === next.following
    ) {
      return;
    }

    stateRef.current = next;
    setEdge(next);
  }, []);

  const scrollToLatest = React.useCallback((smooth: boolean) => {
    const node = viewportRef.current;

    if (!node) {
      return;
    }

    // §5: reduced motion is a designed state. A smooth scroll is vestibular
    // motion with no CSS transition behind it, so no `transition.*` key can
    // carry the override — this is the one place the query is read directly,
    // and it degrades to an instant jump rather than to nothing.
    node.scrollTo({
      behavior: motionSafeBehavior(smooth ? "smooth" : "auto"),
      top: node.scrollHeight,
    });
    previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
  }, []);

  const handleScroll = React.useCallback(() => {
    const node = viewportRef.current;

    if (!node) {
      return;
    }

    const previous = previousRef.current;
    const next = resolveLiveEdge({
      clientHeight: node.clientHeight,
      following: stateRef.current.following,
      previousHeight: previous.height,
      previousTop: previous.top,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    });

    previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
    commit(next);
  }, [commit]);

  const pinToLatest = React.useCallback(() => {
    commit({ atBottom: true, following: true });
    scrollToLatest(true);
  }, [commit, scrollToLatest]);

  const releaseFollow = React.useCallback(() => {
    const node = viewportRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    commit({
      atBottom: distance <= AT_BOTTOM_THRESHOLD,
      following: false,
    });
  }, [commit]);

  const scrollToItem = React.useCallback(
    (itemId: string, options: ThreadScrollToItemOptions = {}) => {
      const node = viewportRef.current;
      if (!node) return false;
      const item = findThreadItem(node, itemId);
      if (!item) return false;

      const viewportRect = node.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const block = options.block ?? "start";
      let delta = itemRect.top - viewportRect.top;

      if (block === "center") {
        delta -= (viewportRect.height - itemRect.height) / 2;
      } else if (block === "nearest") {
        if (
          (itemRect.top <= viewportRect.top + VIEWPORT_EDGE_EPSILON &&
            itemRect.bottom >= viewportRect.bottom - VIEWPORT_EDGE_EPSILON) ||
          (itemRect.top >= viewportRect.top - VIEWPORT_EDGE_EPSILON &&
            itemRect.bottom <= viewportRect.bottom + VIEWPORT_EDGE_EPSILON)
        ) {
          delta = 0;
        } else if (itemRect.bottom > viewportRect.bottom) {
          delta = itemRect.bottom - viewportRect.bottom;
        }
      }

      releaseFollow();
      node.scrollTo({
        behavior: motionSafeBehavior(options.behavior ?? "auto"),
        top: node.scrollTop + delta,
      });
      item.focus({ preventScroll: true });
      return true;
    },
    [releaseFollow],
  );

  // Layout effect, not effect: a transcript that paints from the top and then
  // jumps to the bottom shows the reader a frame of the wrong end.
  React.useLayoutEffect(() => {
    const node = viewportRef.current;

    if (!node) {
      return;
    }

    previousRef.current = { height: node.scrollHeight, top: node.scrollTop };

    const savedPosition = initialPositionRef.current;
    const restoredItem =
      savedPosition == null
        ? undefined
        : findThreadItem(node, savedPosition.itemId);
    if (restoredItem && savedPosition) {
      const viewportTop = node.getBoundingClientRect().top;
      const itemTop = restoredItem.getBoundingClientRect().top;
      node.scrollTop += itemTop - viewportTop - savedPosition.offset;
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      const atBottom = distance <= AT_BOTTOM_THRESHOLD;
      stateRef.current = { atBottom, following: atBottom };
      setEdge(stateRef.current);
      previousRef.current = { height: node.scrollHeight, top: node.scrollTop };
    } else {
      scrollToLatest(false);
    }

    const content = contentRef.current;

    if (!content || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      if (stateRef.current.following) {
        scrollToLatest(false);
        commit({ atBottom: true, following: true });

        return;
      }

      // Released. Growth still has to be *reported*, because it moves the live
      // edge away from a reader who is standing still; without this the jump
      // affordance stays hidden until they happen to scroll.
      previousRef.current = {
        height: viewport.scrollHeight,
        top: viewport.scrollTop,
      };
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

      commit({ atBottom: distance <= AT_BOTTOM_THRESHOLD, following: false });
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, [commit, scrollToLatest]);

  return {
    contentRef,
    edge,
    handleScroll,
    pinToLatest,
    releaseFollow,
    scrollToItem,
    viewportRef,
  };
}

import * as React from "react";

/**
 * Which inline edges of a horizontal scroller have content past them — the
 * input to the scroll cue (`recipes/scroll-edge-shade`).
 *
 * Shared by `DataTable` (a table wider than its frame) and `Tabs.List` (a strip
 * wider than its space). Re-read on scroll, when the scroller resizes, and
 * when anything named by `observe` resizes: a scroller's own box can stay put
 * while its content grows past it (rows arriving, a tab getting a longer
 * label).
 */
export type InlineScrollEdges = {
  /** Content is hidden past the inline-end edge (more to scroll to). */
  end: boolean;
  /** Content is hidden past the inline-start edge (scrolled away from it). */
  start: boolean;
};

const NO_EDGES: InlineScrollEdges = { end: false, start: false };

/**
 * Sub-pixel scroll positions (zoom, fractional column widths) leave a scroller
 * that is visually at its end a fraction of a pixel short of its maximum. One
 * pixel of slack keeps the cue from flickering on at a settled edge.
 */
const EDGE_THRESHOLD_PX = 1;

export function useInlineScrollEdges({
  direction,
  enabled = true,
  observe,
  scrollRef,
}: {
  direction?: "ltr" | "rtl";
  enabled?: boolean;
  /** Extra elements whose size moves the edges without resizing the scroller. */
  observe?: (scroller: HTMLElement) => Iterable<Element>;
  scrollRef: React.RefObject<HTMLElement | null>;
}): InlineScrollEdges {
  const [edges, setEdges] = React.useState<InlineScrollEdges>(NO_EDGES);

  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !enabled) {
      setEdges(NO_EDGES);
      return undefined;
    }

    const update = () => {
      const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const rtl = (direction ?? getComputedStyle(scroller).direction) === "rtl";
      // RTL `scrollLeft` runs from 0 to -maximum; the distance is the same.
      const progress = Math.min(
        maximum,
        rtl ? Math.abs(scroller.scrollLeft) : Math.max(0, scroller.scrollLeft),
      );
      const next = {
        end: progress < maximum - EDGE_THRESHOLD_PX,
        start: progress > EDGE_THRESHOLD_PX,
      };
      setEdges((current) =>
        current.start === next.start && current.end === next.end
          ? current
          : next,
      );
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    for (const element of observe?.(scroller) ?? []) observer?.observe(element);

    return () => {
      observer?.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [direction, enabled, observe, scrollRef]);

  return edges;
}

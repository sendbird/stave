import { useEffect, useState } from "react";

/**
 * Host extension: keep a bottom-anchored toast stack above product chrome it
 * must never cover.
 *
 * The host knows its own column (the viewport's inline extent); the product
 * marks what lives at the bottom of the window — the composer, a status bar —
 * with a selector. While a toast is open, any visible match that shares the
 * column lifts the stack so its usual gap is measured from that element's top
 * edge instead of the window's bottom edge. Matches beside the column (a
 * composer in a centre pane while the stack sits over a side pane) leave it
 * where it is.
 */

/**
 * How often an open stack re-checks for a match that mounted or moved under
 * it without resizing. A resize already re-measures at once; this only covers
 * a surface switch while a toast is up, so a quarter second is plenty and an
 * idle window (no toast) runs nothing.
 */
const RECHECK_MS = 250;

/**
 * Room the stack always keeps between its lifted bottom edge and the top of
 * the window, so an unusually tall match cannot push the toast off screen.
 */
const MIN_STACK_ROOM_PX = 160;

function isShown(element: Element, box: DOMRect) {
  if (box.width === 0 || box.height === 0) return false;
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility({ visibilityProperty: true })
    : true;
}

/** Pixels the stack's bottom edge must rise to clear every match in its column. */
export function measureToastLift(
  viewport: Element,
  selector: string,
  windowHeight: number,
): number {
  const column = viewport.getBoundingClientRect();
  let lift = 0;
  for (const element of document.querySelectorAll(selector)) {
    const box = element.getBoundingClientRect();
    if (!isShown(element, box)) continue;
    if (box.right <= column.left || box.left >= column.right) continue;
    if (box.top >= windowHeight || box.bottom <= 0) continue;
    lift = Math.max(lift, windowHeight - box.top);
  }
  return Math.round(
    Math.min(lift, Math.max(0, windowHeight - MIN_STACK_ROOM_PX)),
  );
}

/**
 * The lift for `viewport` while `active` (at least one toast is open). It
 * stops observing as soon as the stack empties.
 */
export function useToastAvoidance(
  viewport: HTMLElement | null,
  selector: string | undefined,
  active: boolean,
): number {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    if (!viewport || !selector || !active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setLift(measureToastLift(viewport, selector, window.innerHeight));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const observed = new WeakSet<Element>();
    const resize = new ResizeObserver(schedule);
    const observeMatches = () => {
      for (const element of document.querySelectorAll(selector)) {
        if (observed.has(element)) continue;
        observed.add(element);
        resize.observe(element);
      }
    };
    observeMatches();
    measure();
    const timer = window.setInterval(() => {
      observeMatches();
      schedule();
    }, RECHECK_MS);
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
    };
  }, [viewport, selector, active]);

  return active && viewport && selector ? lift : 0;
}

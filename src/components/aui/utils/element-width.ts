import { useLayoutEffect, useRef, useState } from "react";

/**
 * The content-box width of an element, tracked with a ResizeObserver. The
 * hand-drawn SVG chart forms (slope, sunburst, tile map) lay out in pixels,
 * so text stays text-sized instead of scaling with a viewBox. `fallback` is
 * the width used before the first measurement (and in non-DOM renders).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 480) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

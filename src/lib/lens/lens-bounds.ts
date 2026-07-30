import type { LensBounds } from "./lens.types";

/**
 * Convert renderer CSS-pixel bounds into native-view bounds without allowing
 * the native view to spill into a neighbouring Dockview sash. Rounding the
 * origin and size independently can expand a fractional rectangle by a pixel;
 * rounding its edges inward preserves the renderer-owned resize hit target.
 */
export function scaleLensBoundsWithinContainer(args: {
  bounds: LensBounds;
  zoomFactor: number;
}): LensBounds {
  const { bounds, zoomFactor } = args;
  const left = Math.ceil(bounds.x * zoomFactor);
  const top = Math.ceil(bounds.y * zoomFactor);
  const right = Math.floor((bounds.x + bounds.width) * zoomFactor);
  const bottom = Math.floor((bounds.y + bounds.height) * zoomFactor);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

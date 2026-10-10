/**
 * Where a viewport-relative rectangle lands in a viewport capture.
 *
 * Lens serves area and element screenshots by capturing the viewport and
 * cropping it, rather than by handing CDP a `clip` — see `captureViewport`
 * in `electron/main/browser/browser-screenshot.ts` for why. This is the arithmetic,
 * kept pure so it can be checked without a browser.
 */

export type LensCaptureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Geometry measured in the page right before its viewport is captured. */
export type LensCaptureViewport = {
  /**
   * `innerWidth` / `innerHeight`: the layout viewport in CSS pixels, scrollbars
   * included. That is exactly the area a viewport capture covers, so it — not
   * `clientWidth`, which drops a classic scrollbar — is what pixel density is
   * derived from.
   */
  width: number;
  height: number;
  /** `visualViewport.offsetLeft` / `offsetTop`, in CSS pixels. */
  offsetX: number;
  offsetY: number;
  /** `visualViewport.scale`: pinch zoom, 1 unless the page enables it. */
  scale: number;
};

/** Sub-pixel slop tolerated before rounding outward to whole pixels. */
const PIXEL_EPSILON = 1e-6;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isLensCaptureViewport(
  value: unknown,
): value is LensCaptureViewport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const viewport = value as Record<string, unknown>;
  return (
    typeof viewport.width === "number" &&
    isPositiveFinite(viewport.width) &&
    typeof viewport.height === "number" &&
    isPositiveFinite(viewport.height) &&
    typeof viewport.offsetX === "number" &&
    Number.isFinite(viewport.offsetX) &&
    typeof viewport.offsetY === "number" &&
    Number.isFinite(viewport.offsetY) &&
    typeof viewport.scale === "number" &&
    isPositiveFinite(viewport.scale)
  );
}

/**
 * Map `clip` — CSS pixels relative to the layout viewport, as
 * `getBoundingClientRect` reports them — onto a capture of `image` pixels.
 *
 * The result is rounded outward to whole pixels and intersected with the
 * image. `null` means none of `clip` is on screen, which a viewport capture
 * cannot show.
 */
export function resolveLensViewportCrop(args: {
  clip: LensCaptureRect;
  viewport: LensCaptureViewport;
  image: { width: number; height: number };
}): LensCaptureRect | null {
  const { clip, viewport, image } = args;
  if (!isPositiveFinite(image.width) || !isPositiveFinite(image.height)) {
    return null;
  }

  const scaleX = (image.width / viewport.width) * viewport.scale;
  const scaleY = (image.height / viewport.height) * viewport.scale;

  const left = Math.max(
    0,
    Math.floor((clip.x - viewport.offsetX) * scaleX + PIXEL_EPSILON),
  );
  const top = Math.max(
    0,
    Math.floor((clip.y - viewport.offsetY) * scaleY + PIXEL_EPSILON),
  );
  const right = Math.min(
    image.width,
    Math.ceil(
      (clip.x + clip.width - viewport.offsetX) * scaleX - PIXEL_EPSILON,
    ),
  );
  const bottom = Math.min(
    image.height,
    Math.ceil(
      (clip.y + clip.height - viewport.offsetY) * scaleY - PIXEL_EPSILON,
    ),
  );

  if (right - left < 1 || bottom - top < 1) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

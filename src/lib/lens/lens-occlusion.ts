export const LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR = [
  ".t-dropdown",
  ".t-modal",
  ".t-overlay",
  ".cn-toast",
  "[data-sonner-toast]",
  "[data-slot='dialog-overlay']",
  "[data-slot='dialog-content']",
  "[data-slot='sheet-overlay']",
  "[data-slot='sheet-content']",
  "[data-slot='drawer-overlay']",
  "[data-slot='drawer-content']",
  "[role='dialog'][aria-modal='true']",
  "[role='alertdialog'][aria-modal='true']",
  ".z-\\[80\\].fixed.inset-0",
].join(", ");

type RectLike = Pick<
  DOMRectReadOnly,
  "bottom" | "height" | "left" | "right" | "top" | "width"
>;

type LensOcclusionRoot = Pick<Document, "querySelector"> &
  Partial<Pick<Document, "querySelectorAll">>;

function hasArea(rect: RectLike): boolean {
  return rect.width > 0 && rect.height > 0;
}

function intersects(left: RectLike, right: RectLike): boolean {
  return (
    hasArea(left) &&
    hasArea(right) &&
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

export function hasLensOccludingFloatingSurface(
  root: LensOcclusionRoot | null =
    typeof document === "undefined" ? null : document,
  targetRect?: RectLike | null,
): boolean {
  if (!root) {
    return false;
  }

  if (targetRect === undefined) {
    return Boolean(root.querySelector(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR));
  }

  if (!targetRect || !hasArea(targetRect)) {
    return false;
  }

  const candidates = root.querySelectorAll
    ? Array.from(
        root.querySelectorAll(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR),
      )
    : [
        root.querySelector(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR),
      ].filter((candidate): candidate is Element => Boolean(candidate));

  return candidates.some((candidate) => {
    const getBoundingClientRect = candidate.getBoundingClientRect;
    if (typeof getBoundingClientRect !== "function") {
      return false;
    }

    return intersects(targetRect, getBoundingClientRect.call(candidate));
  });
}

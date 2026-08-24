import {
  UI_LAYER_FLOATING_MIN_VALUE,
  uiLayerClassSelector,
  uiLayerClassesAtOrAbove,
} from "@/lib/ui-layers";

/**
 * Floating surfaces identified by their own component contract rather than by
 * z-index. These are the Base UI / Sonner / shadcn parts whose popup layers are
 * portalled to the body and carry a stable class or data attribute.
 */
const LENS_OCCLUDING_COMPONENT_SELECTORS = [
  ".t-dropdown",
  ".t-modal",
  ".t-overlay",
  ".t-tooltip",
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
  // Dockview paints its drag-and-drop landing zone inside the pane tree, so it
  // lands under the native Lens view during a pane drag over a Lens tab.
  ".dv-drop-target-dropzone",
] as const;

/**
 * Every app z-plane that floats above pane content, derived from the shared
 * scale in `ui-layers.ts`. Deriving instead of hand-listing means a new
 * floating layer is covered the moment it is added to the scale — the previous
 * hardcoded `.z-\[80\]` literal silently stopped matching whenever the scale
 * was renumbered.
 */
const LENS_OCCLUDING_LAYER_SELECTORS = uiLayerClassesAtOrAbove(
  UI_LAYER_FLOATING_MIN_VALUE,
).map(uiLayerClassSelector);

export const LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR = [
  ...LENS_OCCLUDING_COMPONENT_SELECTORS,
  ...LENS_OCCLUDING_LAYER_SELECTORS,
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

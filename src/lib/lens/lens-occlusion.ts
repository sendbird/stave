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

export function hasLensOccludingFloatingSurface(
  root: Pick<Document, "querySelector"> | null =
    typeof document === "undefined" ? null : document,
): boolean {
  return Boolean(root?.querySelector(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR));
}

/**
 * The window's keyboard regions, in the order F6 visits them: the sidebar,
 * the top bar, the main column, the side panel when it is open, and the
 * right rail. Shift+F6 goes the other way. Each region element carries
 * `data-focus-region`; document order is the visiting order.
 *
 * Entering a region returns focus to where it last was inside it, or else to
 * its first control, so a round trip lands where the user left off.
 */
export const FOCUS_REGION_ATTRIBUTE = "data-focus-region";

export type FocusRegionId = "sidebar" | "top-bar" | "main" | "panel" | "rail";

export type FocusRegionDirection = 1 | -1;

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/**
 * Index of the region to visit from `current` (-1 when focus is in no
 * region): the next or previous one, wrapping at either end.
 */
export function nextFocusRegionIndex(
  count: number,
  current: number,
  direction: FocusRegionDirection,
): number {
  if (count <= 0) {
    return -1;
  }
  if (current < 0) {
    return direction === 1 ? 0 : count - 1;
  }
  return (current + direction + count) % count;
}

const lastFocusByRegion = new WeakMap<Element, HTMLElement>();

function isShown(element: Element) {
  return (
    element instanceof HTMLElement &&
    element.getClientRects().length > 0 &&
    !element.closest("[inert], [aria-hidden='true']")
  );
}

function listRegions(root: ParentNode): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(`[${FOCUS_REGION_ATTRIBUTE}]`),
  ].filter(isShown);
}

function firstTabbable(region: HTMLElement): HTMLElement | null {
  for (const candidate of region.querySelectorAll<HTMLElement>(TABBABLE)) {
    if (isShown(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Remembers the focused element of each region; returns the stop function. */
export function trackFocusRegions(doc: Document = document): () => void {
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const region = target.closest(`[${FOCUS_REGION_ATTRIBUTE}]`);
    if (region) {
      lastFocusByRegion.set(region, target);
    }
  };
  doc.addEventListener("focusin", onFocusIn);
  return () => doc.removeEventListener("focusin", onFocusIn);
}

/** Focus inside one region; false when it has nothing to focus. */
export function focusRegion(region: HTMLElement): boolean {
  const remembered = lastFocusByRegion.get(region);
  const target =
    remembered && region.contains(remembered) && isShown(remembered)
      ? remembered
      : firstTabbable(region);
  if (target) {
    target.focus();
    return document.activeElement === target;
  }
  return false;
}

/** Focus the region with this id, e.g. the main column for the skip link. */
export function focusRegionById(
  id: FocusRegionId,
  doc: Document = document,
): boolean {
  const region = doc.querySelector<HTMLElement>(
    `[${FOCUS_REGION_ATTRIBUTE}="${id}"]`,
  );
  return region ? focusRegion(region) : false;
}

/**
 * Move focus to the next or previous region that can take it. False while a
 * modal dialog holds focus, or when no other region can be focused.
 */
export function cycleFocusRegion(
  direction: FocusRegionDirection,
  doc: Document = document,
): boolean {
  const active = doc.activeElement;
  if (active?.closest("[role='dialog'][aria-modal='true'], [role='alertdialog']")) {
    return false;
  }
  const regions = listRegions(doc);
  let index = regions.findIndex((region) => active && region.contains(active));
  const start = index;
  for (let step = 0; step < regions.length; step += 1) {
    index = nextFocusRegionIndex(regions.length, index, direction);
    if (index === start) {
      break;
    }
    if (focusRegion(regions[index]!)) {
      return true;
    }
  }
  return false;
}

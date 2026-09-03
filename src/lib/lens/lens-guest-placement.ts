import type { LensBounds } from "./lens.types";

/**
 * Where a Lens guest element sits, and whether it is on screen.
 *
 * A guest is a DOM element, so "where" is CSS pixels in the host document and
 * nothing converts, scales, or rounds them: the element occupies exactly the
 * rectangle the panel measured, and the app's own chrome stacks over it by
 * z-index like any other content.
 */
export type LensGuestPlacement = {
  /** Last rectangle a panel measured for this session, if any ever did. */
  rect: LensBounds | null;
  /** Whether a panel is currently showing this session's page. */
  presented: boolean;
};

export type LensGuestStyle = {
  left: string;
  top: string;
  width: string;
  height: string;
  opacity: "1" | "0";
  pointerEvents: "auto" | "none";
};

/**
 * Viewport a guest gets before any panel has measured one for it.
 *
 * Agent-driven sessions are opened with no panel on screen, and a guest sized
 * 0x0 would lay its page out at zero width — every media query, every
 * responsive layout, every `getBoundingClientRect` the agent reads back would
 * describe a page no user will ever see. A conventional desktop viewport is the
 * useful default.
 */
export const DEFAULT_LENS_GUEST_VIEWPORT = {
  width: 1280,
  height: 800,
} as const;

/** Smallest guest viewport. Below this, page layout stops being meaningful. */
const MIN_GUEST_EXTENT = 1;

function extent(value: number | undefined, fallback: number): number {
  return value !== undefined &&
    Number.isFinite(value) &&
    value >= MIN_GUEST_EXTENT
    ? value
    : fallback;
}

function origin(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/**
 * Whether a placement is allowed to paint and take hits.
 *
 * `presented` is the panel's intent. Revealing still needs a real rectangle:
 * an unmeasured guest resolves to the default desktop viewport at (0, 0), and
 * showing that overlays the workspace as a floating card instead of sitting
 * in the pane.
 */
export function isLensGuestVisuallyPresented(
  placement: LensGuestPlacement,
): boolean {
  return placement.presented && isMeasurableLensGuestRect(placement.rect);
}

/**
 * Resolve the style a guest element should carry.
 *
 * Three properties matter more than the arithmetic, and all three are about a
 * guest that is *not* on screen. An agent-driven session is opened with no
 * panel showing it and may never be shown at all, yet `stave_lens_screenshot`
 * has to answer for it — so "parked" must mean invisible, not uncomposited.
 *
 * 1. **Park with `opacity: 0`, never `visibility: hidden` or `display: none`.**
 *    Chromium produces no compositor frame for either of those, and with no
 *    frame there is no surface to capture: `Page.captureScreenshot` against a
 *    `visibility: hidden` guest fails outright with "Unable to capture
 *    screenshot", and a guest hidden *after* having been visible answers
 *    nothing at all until Lens's own 15s guard fires. `opacity: 0` keeps the
 *    guest compositing — measured live, a navigation still repaints 99.9% of
 *    the captured pixels — so the agent path keeps working while the guest
 *    stays invisible to the user.
 * 2. **`pointer-events: none` is what makes a parked guest untouchable**, not
 *    the lack of paint. An `opacity: 0` element is still hit-testable; without
 *    this, a parked guest would swallow clicks meant for the app. With it,
 *    `elementFromPoint` over the guest's rectangle returns the app's own
 *    chrome.
 * 3. **Parked guests keep their size and their place.** They are hidden, not
 *    moved offscreen. Chromium throttles frame production for content outside
 *    the viewport — and an offscreen guest fails a screenshot the same way a
 *    hidden one does, also measured. Staying put is what keeps it answerable.
 * 4. **Never reveal without a measured rectangle.** The default viewport is
 *    for layout and screenshots, not for showing a page at the window origin.
 */
export function resolveLensGuestStyle(
  placement: LensGuestPlacement,
): LensGuestStyle {
  const { rect } = placement;
  const shown = isLensGuestVisuallyPresented(placement);

  const width = extent(rect?.width, DEFAULT_LENS_GUEST_VIEWPORT.width);
  const height = extent(rect?.height, DEFAULT_LENS_GUEST_VIEWPORT.height);

  return {
    left: `${origin(rect?.x)}px`,
    top: `${origin(rect?.y)}px`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: shown ? "1" : "0",
    pointerEvents: shown ? "auto" : "none",
  };
}

/** Whether two measured rectangles describe the same guest geometry. */
export function areLensGuestRectsEqual(
  left: LensBounds | null,
  right: LensBounds | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

/**
 * A measured rectangle worth adopting.
 *
 * A panel that is mid-teardown, collapsed, or in a Dockview group being
 * dragged measures zero. Adopting that would resize the guest's viewport to
 * nothing and reflow the page; keeping the previous rectangle means the guest
 * is hidden at its old size instead, and re-shows without a relayout.
 */
export function isMeasurableLensGuestRect(
  rect: LensBounds | null,
): rect is LensBounds {
  return Boolean(
    rect &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width >= MIN_GUEST_EXTENT &&
    rect.height >= MIN_GUEST_EXTENT,
  );
}

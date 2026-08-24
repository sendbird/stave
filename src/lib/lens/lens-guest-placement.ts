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
  visibility: "visible" | "hidden";
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
export const DEFAULT_LENS_GUEST_VIEWPORT = { width: 1280, height: 800 } as const;

/** Smallest guest viewport. Below this, page layout stops being meaningful. */
const MIN_GUEST_EXTENT = 1;

function extent(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= MIN_GUEST_EXTENT
    ? value
    : fallback;
}

function origin(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/**
 * Resolve the style a guest element should carry.
 *
 * Two properties matter more than the arithmetic, and both are about a guest
 * that is *not* on screen:
 *
 * 1. **Never `display: none`.** Chromium does not paint inside a
 *    `display: none` subtree and stops driving the guest's compositor, so a
 *    parked guest would freeze — and un-parking it would show a stale frame
 *    until it caught up. Hiding is `visibility: hidden`, which is enough on its
 *    own: an unpainted element cannot occlude anything and cannot be hit.
 * 2. **Parked guests keep their size and their place.** They are hidden, not
 *    moved offscreen. Chromium throttles frame production for content outside
 *    the viewport, which is exactly the wrong behaviour for an agent-driven
 *    session that no panel is showing and that must still answer a screenshot.
 *    Staying put costs nothing, since a hidden element paints nothing.
 */
export function resolveLensGuestStyle(
  placement: LensGuestPlacement,
): LensGuestStyle {
  const { rect, presented } = placement;

  const width = extent(rect?.width, DEFAULT_LENS_GUEST_VIEWPORT.width);
  const height = extent(rect?.height, DEFAULT_LENS_GUEST_VIEWPORT.height);

  return {
    left: `${origin(rect?.x)}px`,
    top: `${origin(rect?.y)}px`,
    width: `${width}px`,
    height: `${height}px`,
    visibility: presented ? "visible" : "hidden",
    pointerEvents: presented ? "auto" : "none",
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

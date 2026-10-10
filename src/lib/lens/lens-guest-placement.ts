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
 * Parked guests retain their last measured CSS rectangle and reject pointer
 * input. Opacity zero permits idle compositor throttling; capture preparation
 * temporarily uses a transparent filter so a hidden guest can produce frames.
 * Never reveal a guest without a measured rectangle or move it offscreen.
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

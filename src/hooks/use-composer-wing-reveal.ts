import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A resting wing is one icon column plus the sliver that tucks under the card,
 * and that is all the frame reserves for it. Revealing a wing therefore has to
 * spend space that lives *outside* the frame, in whatever margin the chat
 * column has left over.
 */
export const COMPOSER_WING_COLLAPSED_WIDTH_PX = 60;
/** Widest a revealed wing ever gets: icon column, gap, and a short label. */
export const COMPOSER_WING_REVEALED_WIDTH_PX = 144;
/**
 * Below this gain the reveal is not worth playing: the label would be clipped
 * mid-word, which reads as breakage rather than as a compact layout. The wing
 * simply stays an icon column and the control tooltips carry the naming.
 */
const MIN_REVEAL_GAIN_PX = 32;
/** Keeps a revealed wing off the exact edge of whatever clips it. */
const REVEAL_EDGE_BREATHING_PX = 4;

function findClippingAncestor(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const overflowX = getComputedStyle(current).overflowX;
    if (overflowX !== "visible") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Turns the room measured beside the frame into the width a revealed wing may
 * take. Pure, so the cap is testable without a layout engine.
 */
export function resolveComposerWingRevealWidth(outsideRoomPx: number): number {
  const width =
    COMPOSER_WING_COLLAPSED_WIDTH_PX +
    Math.max(0, outsideRoomPx - REVEAL_EDGE_BREATHING_PX);
  if (width - COMPOSER_WING_COLLAPSED_WIDTH_PX < MIN_REVEAL_GAIN_PX) {
    return COMPOSER_WING_COLLAPSED_WIDTH_PX;
  }
  return Math.min(width, COMPOSER_WING_REVEALED_WIDTH_PX);
}

function measureRevealWidth(node: HTMLElement): number {
  const clip = findClippingAncestor(node);
  if (!clip) {
    return COMPOSER_WING_REVEALED_WIDTH_PX;
  }
  const frameRect = node.getBoundingClientRect();
  const clipRect = clip.getBoundingClientRect();
  if (frameRect.width <= 0 || clipRect.width <= 0) {
    return COMPOSER_WING_REVEALED_WIDTH_PX;
  }
  // Both wings reveal at once when the pointer crosses the frame, so the
  // usable room is the smaller of the two outside margins.
  return resolveComposerWingRevealWidth(
    Math.min(frameRect.left - clipRect.left, clipRect.right - frameRect.right),
  );
}

/**
 * How wide a revealed side wing is allowed to get, in px.
 *
 * The frame reserves only the resting width, so a reveal overhangs the frame.
 * Rather than letting that overhang be clipped by the chat column, it is capped
 * to the room actually available beside the frame — measured, because the
 * sidebar and the information panel both change it without changing the window.
 */
export function useComposerWingReveal(): {
  ref: (node: HTMLElement | null) => void;
  revealWidthPx: number;
} {
  const [revealWidthPx, setRevealWidthPx] = useState(
    COMPOSER_WING_REVEALED_WIDTH_PX,
  );
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) {
      return;
    }
    setRevealWidthPx(measureRevealWidth(node));
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || typeof ResizeObserver === "undefined") {
        return;
      }
      measure();
      const observer = new ResizeObserver(() => measure());
      observer.observe(node);
      const clip = findClippingAncestor(node);
      if (clip) {
        observer.observe(clip);
      }
      observerRef.current = observer;
    },
    [measure],
  );

  useEffect(() => {
    measure();
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [measure]);

  return { ref, revealWidthPx };
}

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * The framed composer spends ~18rem of the composer measure on its two control
 * wings. Below this width the raised card gets too narrow to type in, so the
 * session view falls back to the classic stack regardless of the user's
 * `composerLayout` preference.
 *
 * Deliberately wider than the `useIsMobile` breakpoint (768px): the frame stops
 * being comfortable well before the window is phone-sized.
 */
export const COMPOSER_FRAME_MIN_WIDTH = 900;

/**
 * Tracks whether the composer's own measure — not the window — is wide enough
 * for the framed layout. The sidebar and the information panel both eat into
 * it, so a window-width media query would keep the frame on in layouts where
 * the card has already been squeezed.
 *
 * Measured in a layout effect so the first paint is already the correct mode.
 */
export function useComposerFrameFits(): {
  ref: (node: HTMLElement | null) => void;
  fits: boolean;
} {
  const [fits, setFits] = useState(true);
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback((node: HTMLElement | null) => {
    if (!node) {
      return;
    }
    const width = node.getBoundingClientRect().width;
    // A detached or not-yet-laid-out node measures 0; treat that as "no signal"
    // rather than as "too narrow", which would flip the layout for one frame.
    if (width <= 0) {
      return;
    }
    setFits(width >= COMPOSER_FRAME_MIN_WIDTH);
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || typeof ResizeObserver === "undefined") {
        return;
      }
      measure(node);
      const observer = new ResizeObserver(() => measure(nodeRef.current));
      observer.observe(node);
      observerRef.current = observer;
    },
    [measure],
  );

  useLayoutEffect(() => {
    measure(nodeRef.current);
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [measure]);

  return { ref, fits };
}

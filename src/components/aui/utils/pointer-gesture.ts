import { useCallback, useEffect, useRef } from "react";
import type * as React from "react";

/**
 * A cancelable `setTimeout`/`requestAnimationFrame` handle: `cancel` is
 * automatically run on unmount so a pending one can't fire into a dead
 * component. Returns `schedule`, which cancels whatever handle is already
 * pending, runs `scheduler` to start the new one, and clears the stored
 * handle itself right before `callback` runs (so a completed schedule never
 * reads as "still pending"). Board's keyboard-refocus RAF, Tree's typeahead
 * buffer-reset timer, and (internally, see below) the post-drag click
 * latch's release timer all leaked their handle across an unmount, or left a
 * stale one from an earlier gesture racing a newer one, without this.
 */
export function useCancelableHandle<T>(
  cancel: (handle: T) => void,
): (scheduler: (callback: () => void) => T, callback: () => void) => void {
  const ref = useRef<T | null>(null);
  // `cancel` is read through a ref so the unmount effect below can depend on
  // nothing. Depending on `cancel` directly would make an inline lambda at the
  // call site re-run the cleanup on every render, silently cancelling a handle
  // that is still legitimately pending.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  useEffect(() => {
    return () => {
      if (ref.current !== null) cancelRef.current(ref.current);
    };
  }, []);

  return useCallback((scheduler, callback) => {
    if (ref.current !== null) cancelRef.current(ref.current);
    ref.current = scheduler(() => {
      ref.current = null;
      callback();
    });
  }, []);
}

/**
 * Timeout flavour of `useCancelableHandle`, which is the shape most call sites
 * actually want: "run this later, replacing any earlier pending run, and never
 * fire it into an unmounted component". Only Board's keyboard-refocus RAF needs
 * the generic scheduler underneath.
 */
export function useCancelableTimeout(): (
  callback: () => void,
  delayMs: number,
) => void {
  const schedule =
    useCancelableHandle<ReturnType<typeof setTimeout>>(clearTimeout);
  return useCallback(
    (callback, delayMs) =>
      schedule((done) => setTimeout(done, delayMs), callback),
    [schedule],
  );
}

/**
 * Post-drag click suppression latch.
 *
 * A completed pointer drag (Board card, SortableList row/handle, CanvasViewport
 * pan) still produces a `click` when the pointer releases — Motion and the
 * browser both deliver it to whatever now sits under the pointer, not to
 * wherever the *press* started, so it must be eaten once. A plain click (or a
 * keyboard activation, which never touches the latch) must still reach the
 * caller.
 *
 * `arm()` marks the next click as one to eat, called where the drag/pan is
 * detected to have actually moved. `release()` schedules clearing that mark
 * 150ms later rather than immediately — Motion can deliver its drag-end
 * callback a frame later than the browser's own `click`, so an immediate
 * reset can race the very click it's meant to catch. `consumeClick` is the
 * `onClickCapture` handler: while armed it eats exactly one click
 * (`preventDefault` + `stopPropagation`) and clears the latch; otherwise it
 * forwards to the caller's own `onClickCapture`.
 *
 * SortableList shares one latch across an entire list — armed by whichever
 * row is dragged, consumed at the list root before a press/release on two
 * different rows can retarget it to their common ancestor — so the backing
 * ref can be supplied externally instead of owned locally.
 */
export function useClickSuppressionLatch(
  externalRef?: React.MutableRefObject<boolean>,
): {
  arm: () => void;
  consumeClick: <E extends React.SyntheticEvent>(
    event: E,
    forward?: (event: E) => void,
  ) => void;
  ref: React.MutableRefObject<boolean>;
  release: () => void;
} {
  const localRef = useRef(false);
  const ref = externalRef ?? localRef;
  const scheduleRelease = useCancelableTimeout();

  const arm = useCallback(() => {
    ref.current = true;
  }, [ref]);

  const release = useCallback(() => {
    scheduleRelease(() => {
      ref.current = false;
    }, 150);
  }, [ref, scheduleRelease]);

  const consumeClick = useCallback(
    <E extends React.SyntheticEvent>(
      event: E,
      forward?: (event: E) => void,
    ) => {
      if (ref.current) {
        ref.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      forward?.(event);
    },
    [ref],
  );

  return { arm, consumeClick, ref, release };
}

/**
 * Pair `onPointerCancel` and `onLostPointerCapture` to one gesture-end reset.
 *
 * CanvasViewport's pan and Flow's viewport pan / node drag all take pointer
 * capture on press; either event can interrupt that capture with no matching
 * `pointerup` (the browser reclaiming capture, or a genuine cancel), and
 * without this pairing the gesture's ref is left stranded — reacting to a
 * pointer that no longer belongs to it (see ResizablePanel.tsx / Lightbox.tsx
 * / DataTable.tsx / SortableList.tsx for the same pairing elsewhere). Both
 * events call the caller's own handler for that event first (if given), then
 * `onEnd` — so wiring this in never drops a handler already passed through
 * the component's public props.
 */
export function usePointerGestureEnd<T extends Element = Element>(
  onEnd: (event: React.PointerEvent<T>) => void,
  forward?: {
    onLostPointerCapture?: (event: React.PointerEvent<T>) => void;
    onPointerCancel?: (event: React.PointerEvent<T>) => void;
  },
): {
  onLostPointerCapture: (event: React.PointerEvent<T>) => void;
  onPointerCancel: (event: React.PointerEvent<T>) => void;
} {
  return {
    onLostPointerCapture: (event) => {
      forward?.onLostPointerCapture?.(event);
      onEnd(event);
    },
    onPointerCancel: (event) => {
      forward?.onPointerCancel?.(event);
      onEnd(event);
    },
  };
}

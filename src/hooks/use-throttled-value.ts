import { useEffect, useRef, useState } from "react";

/**
 * Trailing-edge throttle for values that change faster than a human can read.
 *
 * Provider turn events are flushed once per animation frame
 * (`createProviderTurnEventController`), so anything derived from a turn
 * activity snapshot gets a fresh identity ~60x/second. Feeding that straight
 * into a list rebuilds and repaints every frame; throttling the derived value
 * keeps the first change instant and then coalesces the rest.
 *
 * The first change after an idle period is emitted immediately, so a single
 * update never waits out the interval.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastEmittedAtRef = useRef(0);

  useEffect(() => {
    if (Object.is(value, throttledValue)) {
      return;
    }
    const emit = () => {
      lastEmittedAtRef.current = Date.now();
      setThrottledValue(value);
    };
    const elapsedMs = Date.now() - lastEmittedAtRef.current;
    if (elapsedMs >= intervalMs) {
      emit();
      return;
    }
    const timer = window.setTimeout(emit, intervalMs - elapsedMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [intervalMs, throttledValue, value]);

  return throttledValue;
}

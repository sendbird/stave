import { useEffect, useState, type ReactNode } from "react";

/**
 * How often a live elapsed span re-reads the time. It reads to the second
 * (`2m 10s`), so it ticks every five seconds, as Fleet's rows do.
 */
export const ELAPSED_CLOCK_MS = 5_000;

/**
 * The text that shows a live elapsed span, on a clock of its own. While `live`
 * it re-reads the time every five seconds and re-renders alone, so the panel
 * around it keeps its slower clock for ages and its cards do not re-render
 * with every tick. `now` is the surrounding clock's reading: used until this
 * one ticks, and whenever it is the newer of the two.
 */
export function ElapsedClock(props: { live: boolean; now: number; children: (now: number) => ReactNode }) {
  const { live, now } = props;
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setTick(Date.now()), ELAPSED_CLOCK_MS);
    return () => window.clearInterval(timer);
  }, [live]);
  return <>{props.children(live && tick !== null ? Math.max(tick, now) : now)}</>;
}

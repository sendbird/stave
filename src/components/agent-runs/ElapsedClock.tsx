import { useState, type ReactNode } from "react";
import { useSharedNow } from "@/components/ads/components/DurationTimer";

/**
 * The text that shows a live elapsed span. While `live` it reads the design
 * system's shared one-second clock (the one `DurationTimer` ticks on, one
 * interval however many spans are live) and re-renders alone, so the panel or
 * line around it keeps its slower clock for ages and does not re-render with
 * every tick. `now` is the surrounding clock's reading: used until the shared
 * clock ticks, and whenever it is the newer of the two.
 */
export function ElapsedClock(props: { live: boolean; now: number; children: (now: number) => ReactNode }) {
  const { live, now } = props;
  const shared = useSharedNow(live);
  // The shared reading at mount may be an old one; it counts once it has ticked.
  const [mounted] = useState(shared);
  return <>{props.children(live && shared !== mounted ? Math.max(shared, now) : now)}</>;
}

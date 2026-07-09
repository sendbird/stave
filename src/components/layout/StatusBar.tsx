import { useEffect, useRef } from "react";
import { StatusBarMemorySegment } from "@/components/layout/StatusBarMemorySegment";
import { StatusBarUsageSegment } from "@/components/layout/StatusBarUsageSegment";
import { useAppStore } from "@/store/app.store";

const RATE_LIMITS_POLL_INTERVAL_MS = 60_000;

/**
 * Global, VSCode-style bottom status bar. Spans the full window width below
 * the project sidebar, chat/editor column, and right rail — a persistent
 * home for Claude/Codex usage plus other bottom-of-window info (memory today,
 * more segments later).
 */
export function StatusBar() {
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void refreshRateLimits();
    intervalRef.current = setInterval(() => {
      void refreshRateLimits();
    }, RATE_LIMITS_POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshRateLimits]);

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-border/70 bg-card px-1 text-xs">
      <div className="flex items-center gap-0.5">
        <StatusBarMemorySegment />
      </div>
      <div className="flex items-center gap-0.5">
        <StatusBarUsageSegment provider="claude" />
        <StatusBarUsageSegment provider="codex" />
      </div>
    </div>
  );
}

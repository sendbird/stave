import { useEffect, useRef } from "react";
import { StatusBarMemorySegment } from "@/components/layout/StatusBarMemorySegment";
import { StatusBarUsageSegment } from "@/components/layout/StatusBarUsageSegment";
import { useAppStore } from "@/store/app.store";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

const RATE_LIMITS_POLL_INTERVAL_MS = 60_000;

/**
 * Global, VSCode-style bottom status bar. Spans the full window width below
 * the project sidebar, chat/editor column, and right rail — a persistent
 * home for provider usage plus other bottom-of-window info (memory today,
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
    <div {...stylex.props(layoutShellStyles.statusBar)}>
      <div {...stylex.props(layoutShellStyles.statusGroup)}>
        <StatusBarUsageSegment provider="claude" />
        <StatusBarUsageSegment provider="codex" />
        <StatusBarUsageSegment provider="cursor" />
        <StatusBarUsageSegment provider="kiro" />
      </div>
      <div {...stylex.props(layoutShellStyles.statusGroup)}>
        <StatusBarMemorySegment />
      </div>
    </div>
  );
}

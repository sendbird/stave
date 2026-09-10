import { useEffect } from "react";
import { StatusBarMemorySegment } from "@/components/layout/StatusBarMemorySegment";
import { StatusBarUsageSegment } from "@/components/layout/StatusBarUsageSegment";
import { resolveEarliestAccountUsageResetAtMs } from "@/lib/providers/account-usage-block";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  noteRateLimitsInteraction,
  readRateLimitsPollInputs,
  resolveRateLimitsPollPlan,
  subscribeRateLimitsPollWake,
} from "@/lib/providers/rate-limits-poll-policy";
import { useAppStore } from "@/store/app.store";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

/**
 * Global, VSCode-style bottom status bar. Spans the full window width below
 * the project sidebar, chat/editor column, and right rail — a persistent
 * home for provider usage plus other bottom-of-window info (memory today,
 * more segments later).
 */
export function StatusBar() {
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // State is read at fire time rather than closed over: this loop and its
    // listeners outlive any single render, and the tier decision has to see
    // the interaction timestamp as it is now.
    const tick = () => {
      if (cancelled) {
        return;
      }
      const now = Date.now();
      const state = useAppStore.getState();
      const resetsAtMsByProvider: Partial<Record<ProviderId, number | null>> =
        {};
      for (const providerId of listProviderIds()) {
        resetsAtMsByProvider[providerId] = resolveEarliestAccountUsageResetAtMs(
          { providerId, snapshot: state.rateLimitsSnapshot },
        );
      }
      const plan = resolveRateLimitsPollPlan({
        now,
        visible: document.visibilityState !== "hidden",
        inputs: readRateLimitsPollInputs(),
        updatedAtByProvider: state.rateLimitsUpdatedAtByProvider,
        resetsAtMsByProvider,
      });
      if (plan.providers.length > 0) {
        void refreshRateLimits({ providers: plan.providers });
      }
      // Reschedule from the plan rather than a fixed interval so a tier change
      // (window hidden, meter opened, a turn started) takes effect on the next
      // hop instead of at the end of a long fixed period.
      timer = setTimeout(tick, plan.intervalMs);
    };

    // Opening the meter or starting the first turn after a quiet stretch has
    // to be able to pull the next evaluation forward, or the app would sit on
    // a pending 30-minute timer while the user waits for a number.
    const rearm = () => {
      if (cancelled) {
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      tick();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      // Returning to the window says the user is working, not that they are
      // watching a quota, so it records ordinary attention rather than opening
      // the fast tier — only the meter itself does that. The pending timer is
      // replaced so a tier change is evaluated now instead of at the end of a
      // hidden-window period.
      noteRateLimitsInteraction();
      rearm();
    };

    tick();
    const unsubscribeWake = subscribeRateLimitsPollWake(rearm);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribeWake();
      document.removeEventListener("visibilitychange", onVisibilityChange);
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

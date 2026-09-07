import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getFleetAttentionSnoozeRevision,
  invalidateFleetAttentionSnoozes,
  listFleetAttentionSnoozes,
  subscribeFleetAttentionSnoozes,
} from "./attention-snooze-client";
import {
  selectActiveFleetAttentionSnoozeIds,
  type FleetAttentionSnooze,
} from "./attention-snooze";

const EMPTY_SNOOZES: readonly FleetAttentionSnooze[] = [];
const EMPTY_IDS: ReadonlySet<string> = new Set();
/** Timers longer than this are re-armed in chunks; `setTimeout` caps at ~24.8 days. */
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

export function useFleetAttentionSnoozes() {
  const revision = useSyncExternalStore(
    subscribeFleetAttentionSnoozes,
    getFleetAttentionSnoozeRevision,
    getFleetAttentionSnoozeRevision,
  );
  const [state, setState] = useState<{
    snoozes: readonly FleetAttentionSnooze[];
    error: string;
  }>({ snoozes: EMPTY_SNOOZES, error: "" });

  useEffect(() => {
    let cancelled = false;
    void listFleetAttentionSnoozes().then(
      (snoozes) => {
        if (!cancelled) {
          setState({
            snoozes: snoozes.length > 0 ? snoozes : EMPTY_SNOOZES,
            error: "",
          });
        }
      },
      (error: unknown) => {
        if (cancelled) {
          return;
        }
        // A failed read must not hide anything: an unreadable snooze list means
        // every item stays visible rather than silently disappearing.
        setState({
          snoozes: EMPTY_SNOOZES,
          error:
            error instanceof Error
              ? error.message
              : "Could not load snoozed Fleet items.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);

  /**
   * A snooze ends on a wall-clock deadline, with no event to announce it. Arm a
   * timer for the soonest one so the item comes back on its own instead of
   * waiting for the next unrelated render.
   */
  useEffect(() => {
    if (state.snoozes.length === 0) {
      return;
    }
    const nextDeadline = state.snoozes.reduce((soonest, snooze) => {
      const deadline = Date.parse(snooze.snoozedUntil);
      return Number.isFinite(deadline) && deadline < soonest
        ? deadline
        : soonest;
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextDeadline)) {
      return;
    }
    const delay = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(250, nextDeadline - Date.now()),
    );
    const timer = window.setTimeout(invalidateFleetAttentionSnoozes, delay);
    return () => window.clearTimeout(timer);
  }, [state.snoozes]);

  const activeIds = useMemo(
    () =>
      state.snoozes.length === 0
        ? EMPTY_IDS
        : selectActiveFleetAttentionSnoozeIds({
            snoozes: state.snoozes,
            nowMs: Date.now(),
          }),
    [state.snoozes],
  );

  return {
    snoozes: state.snoozes,
    activeIds,
    error: state.error,
    refresh: invalidateFleetAttentionSnoozes,
  };
}

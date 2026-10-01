/**
 * Check-back schedules (wake-ups underneath) across every workspace, for the
 * Schedules list. Refreshed on `wake-ups:changed` and on a slow poll so a
 * schedule that ran or stopped on its own shows up without a reload.
 */
import { useCallback, useEffect, useState } from "react";
import type { WakeUp, WakeUpSummary } from "@/lib/supervision/wake-up-policy";

const POLL_MS = 5_000;

export function useCheckBacks() {
  const [state, setState] = useState<{ wakeUps: WakeUp[]; summaries: WakeUpSummary[]; loaded: boolean }>({
    wakeUps: [],
    summaries: [],
    loaded: false,
  });

  const reload = useCallback(async () => {
    const listed = await window.api?.wakeUps?.list({}).catch(() => null);
    setState((previous) =>
      listed?.ok
        ? { wakeUps: listed.wakeUps, summaries: listed.summaries, loaded: true }
        : { ...previous, loaded: true },
    );
  }, []);

  useEffect(() => {
    void reload();
    const interval = window.setInterval(() => void reload(), POLL_MS);
    const unsubscribe = window.api?.wakeUps?.subscribeChanged(() => void reload());
    return () => {
      window.clearInterval(interval);
      unsubscribe?.();
    };
  }, [reload]);

  return { ...state, reload };
}

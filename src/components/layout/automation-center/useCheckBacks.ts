import { i18n } from "@/i18n";
/**
 * Check-back schedules (wake-ups underneath) across every workspace, for the
 * Schedules list. Refreshed on `wake-ups:changed` and on a slow poll so a
 * schedule that ran or stopped on its own shows up without a reload. A failed
 * read keeps the last list and reports `error`, so the surface can say so
 * instead of showing an empty list.
 */
import { useCallback, useEffect, useState } from "react";
import type { WakeUp, WakeUpSummary } from "@/lib/supervision/wake-up-policy";

const POLL_MS = 5_000;

export function useCheckBacks() {
  const [state, setState] = useState<{
    wakeUps: WakeUp[];
    summaries: WakeUpSummary[];
    loaded: boolean;
    error: string | null;
  }>({ wakeUps: [], summaries: [], loaded: false, error: null });

  const reload = useCallback(async () => {
    const list = window.api?.wakeUps?.list;
    // Without the desktop bridge there are no check-backs to read; that is not a failure.
    if (!list) {
      setState((previous) => ({ ...previous, loaded: true, error: null }));
      return;
    }
    const listed = await list({}).catch((cause: unknown) => ({
      ok: false as const,
      message: cause instanceof Error ? cause.message : undefined,
    }));
    setState((previous) =>
      listed.ok && "wakeUps" in listed
        ? { wakeUps: listed.wakeUps, summaries: listed.summaries, loaded: true, error: null }
        : {
            ...previous,
            loaded: true,
            error: listed.message ? i18n.t("automation:additionalCopy.message21", { value1: listed.message }) : i18n.t("automation:additionalCopy.message22"),
          },
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

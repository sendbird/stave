import { useEffect } from "react";
import { create } from "zustand";
import type { ProviderId } from "./provider.types";
import {
  resolveTurnSpendPeriods,
  resolveTurnSpendRefreshDelayMs,
  type ProviderTurnSpend,
} from "./turn-spend";

export type TurnSpendByProvider = Partial<Record<ProviderId, ProviderTurnSpend>>;

let refreshGeneration = 0;

/**
 * Today's and this month's tokens and reported cost of turns run in Stave. Read from the
 * local database only, so refreshing it never touches a provider account.
 */
export const useTurnSpend = create<{
  byProvider: TurnSpendByProvider;
  refresh: () => Promise<void>;
}>((set) => ({
  byProvider: {},
  refresh: async () => {
    const summarize =
      typeof window === "undefined"
        ? undefined
        : window.api?.persistence?.summarizeTurnSpend;
    if (!summarize) return;
    const generation = ++refreshGeneration;
    try {
      const result = await summarize(resolveTurnSpendPeriods());
      if (generation !== refreshGeneration || !result.ok) return;
      const byProvider: TurnSpendByProvider = {};
      for (const entry of result.spend) {
        byProvider[entry.providerId] = entry;
      }
      set({ byProvider });
    } catch {
      // Keep the last reading; the next refresh tries again.
    }
  },
}));

/**
 * The host writes a turn's usage while it completes the turn, just after the
 * renderer hears the turn end, so the read waits a moment for that write.
 */
const TURN_SPEND_SETTLE_MS = 1_500;
let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

/** A turn finished; its tokens and cost are about to land on the turn row. */
export function noteTurnSpendChanged() {
  if (pendingRefresh !== null) clearTimeout(pendingRefresh);
  pendingRefresh = setTimeout(() => {
    pendingRefresh = null;
    void useTurnSpend.getState().refresh();
  }, TURN_SPEND_SETTLE_MS);
}

/**
 * Keeps the spend reading current for the always-mounted status bar: on
 * mount, when the window comes back, after local midnight, and on a slow
 * interval for turns the renderer did not start.
 */
export function useLoadTurnSpend() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void useTurnSpend.getState().refresh();
      timer = setTimeout(tick, resolveTurnSpendRefreshDelayMs());
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") return;
      if (timer !== null) clearTimeout(timer);
      tick();
    };
    tick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}

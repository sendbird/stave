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
 * Coming back to the window usually fires both `visibilitychange` and `focus`;
 * returns this close together are one return.
 */
const WINDOW_RETURN_COALESCE_MS = 1_000;

/**
 * Calls `onReturn` when the window comes back (it becomes visible or regains
 * focus), once per return. Returns the unsubscribe.
 */
export function watchWindowReturn(args: {
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  onReturn: () => void;
  now?: () => number;
}): () => void {
  const now = args.now ?? Date.now;
  let lastReturnAt = Number.NEGATIVE_INFINITY;
  const onEvent = () => {
    if (args.document.visibilityState === "hidden") return;
    const at = now();
    if (at - lastReturnAt < WINDOW_RETURN_COALESCE_MS) return;
    lastReturnAt = at;
    args.onReturn();
  };
  args.document.addEventListener("visibilitychange", onEvent);
  args.window.addEventListener("focus", onEvent);
  return () => {
    args.document.removeEventListener("visibilitychange", onEvent);
    args.window.removeEventListener("focus", onEvent);
  };
}

/**
 * Keeps the spend reading current for the always-mounted status bar: on
 * mount, when the window comes back (visible again or focused), after local
 * midnight, and on a slow interval for turns the renderer did not start.
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
    tick();
    const unwatch = watchWindowReturn({
      window,
      document,
      onReturn: () => {
        if (timer !== null) clearTimeout(timer);
        tick();
      },
    });
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      unwatch();
    };
  }, []);
}

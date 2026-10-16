import { useEffect } from "react";
import { create } from "zustand";

/** What the status bar knows of a Vercel AI Gateway connection's balance. */
export type ApiConnectionCreditsView =
  | { status: "loading" }
  | { status: "ok"; balanceUsd: string; totalUsedUsd: string }
  | { status: "unavailable" };

/**
 * How often a visible window asks again. Main reuses a successful read for the
 * same minute and shares concurrent reads, so meters, windows and runtimes on
 * one connection still reach the gateway at most once a minute.
 */
export const API_CONNECTION_CREDITS_REFRESH_MS = 60_000;

/**
 * Balances of the Vercel connections the meters show, by connection id. Only
 * the two amounts reach the renderer; the key stays in Electron main.
 */
export const useApiConnectionCredits = create<{
  byId: Record<string, ApiConnectionCreditsView>;
  refresh: (id: string) => Promise<void>;
}>((set, get) => ({
  byId: {},
  refresh: async (id) => {
    const put = (view: ApiConnectionCreditsView) => set((state) => ({ byId: { ...state.byId, [id]: view } }));
    const read = typeof window === "undefined" ? undefined : window.api?.apiConnections?.credits;
    if (!read) {
      put({ status: "unavailable" });
      return;
    }
    if (!get().byId[id]) put({ status: "loading" });
    try {
      const result = await read({ id });
      put(result.ok ? { status: "ok", balanceUsd: result.balanceUsd, totalUsedUsd: result.totalUsedUsd } : { status: "unavailable" });
    } catch {
      put({ status: "unavailable" });
    }
  },
}));

/** Reads each connection's balance now, then every minute while the window is visible. */
export function useApiConnectionCreditsPolling(ids: readonly string[]) {
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      for (const id of key.split(",")) void useApiConnectionCredits.getState().refresh(id);
    };
    refresh();
    const timer = setInterval(refresh, API_CONNECTION_CREDITS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [key]);
}

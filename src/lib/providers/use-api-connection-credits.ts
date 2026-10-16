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

/**
 * Reads each connection's balance now, every minute while the window is
 * visible, and again when it becomes visible, so a window brought back after a
 * while does not show an old balance until the next minute.
 */
export function useApiConnectionCreditsPolling(ids: readonly string[]) {
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => (key ? startApiConnectionCreditsPolling(key.split(",")) : undefined), [key]);
}

/** The polling behind the hook; returns the function that stops it. */
export function startApiConnectionCreditsPolling(ids: readonly string[], options: {
  doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  intervalMs?: number;
  refresh?: (id: string) => unknown;
} = {}) {
  const doc = options.doc ?? document;
  const read = options.refresh ?? ((id: string) => useApiConnectionCredits.getState().refresh(id));
  const refresh = () => {
    if (doc.visibilityState === "hidden") return;
    for (const id of ids) void read(id);
  };
  refresh();
  const timer = setInterval(refresh, options.intervalMs ?? API_CONNECTION_CREDITS_REFRESH_MS);
  doc.addEventListener("visibilitychange", refresh);
  return () => {
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", refresh);
  };
}

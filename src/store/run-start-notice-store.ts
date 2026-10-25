import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

interface RunStartNoticeState {
  /** Whether the run-start line before a send shows its details. One choice for every task and composer. */
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
}

/** View state, not a setting: it is neither synced nor exported, and losing it costs one click. */
const browserStorage: StateStorage = {
  getItem: (name) => typeof window === "undefined" ? null : window.localStorage?.getItem?.(name) ?? null,
  setItem: (name, value) => {
    if (typeof window !== "undefined") window.localStorage?.setItem?.(name, value);
  },
  removeItem: (name) => { if (typeof window !== "undefined") window.localStorage?.removeItem?.(name); },
};

export function createRunStartNoticeStore(options: { storage?: StateStorage } = {}) {
  return create<RunStartNoticeState>()(
    persist(
      (set) => ({
        detailsOpen: false,
        setDetailsOpen: (open) => set((state) => (state.detailsOpen === open ? state : { detailsOpen: open })),
      }),
      {
        name: "stave:run-start-notice",
        storage: createJSONStorage(() => options.storage ?? browserStorage),
        partialize: (state) => ({ detailsOpen: state.detailsOpen }),
        merge: (saved, current) => ({
          ...current,
          detailsOpen: Boolean(saved && typeof saved === "object" && (saved as { detailsOpen?: unknown }).detailsOpen === true),
        }),
      },
    ),
  );
}

// Synchronous hydration finishes before the shelf renders its first rows.
export const useRunStartNoticeStore = createRunStartNoticeStore();

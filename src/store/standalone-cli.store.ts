import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  STANDALONE_CLI_SLOT_PREFIX,
  STANDALONE_CLI_TAB_IDS,
  type StandaloneCliTabId,
} from "@/lib/terminal/standalone-cli";

export interface StandaloneCliDependencies {
  closeSessionsBySlotPrefix?: (args: {
    prefix: string;
  }) => Promise<{ ok: boolean; closedCount?: number }>;
}

export interface StandaloneCliState {
  open: boolean;
  activeTabId: StandaloneCliTabId;
  /**
   * The folder the live sessions were booted against. Compared with the
   * Settings value to detect a change, so a new folder can never inherit the
   * previous folder's CLI session.
   */
  adoptedFolderPath: string | null;
  nativeSessionIdByTab: Partial<Record<StandaloneCliTabId, string>>;
  openOverlay: () => void;
  closeOverlay: () => void;
  toggleOverlay: () => void;
  setActiveTab: (args: { tabId: StandaloneCliTabId }) => void;
  setTabNativeSession: (args: {
    tabId: string;
    nativeSessionId?: string;
  }) => void;
  adoptFolder: (
    args: { folderPath: string },
    deps?: StandaloneCliDependencies,
  ) => Promise<void>;
  reset: () => void;
}

function isStandaloneCliTabId(candidate: string): candidate is StandaloneCliTabId {
  return (STANDALONE_CLI_TAB_IDS as readonly string[]).includes(candidate);
}

const initialState = {
  open: false,
  activeTabId: "claude-code" as StandaloneCliTabId,
  adoptedFolderPath: null,
  nativeSessionIdByTab: {},
} satisfies Pick<
  StandaloneCliState,
  "open" | "activeTabId" | "adoptedFolderPath" | "nativeSessionIdByTab"
>;

export const useStandaloneCliStore = create<StandaloneCliState>()(
  persist(
    (set, get) => ({
      ...initialState,

      openOverlay: () => set({ open: true }),
      closeOverlay: () => set({ open: false }),
      toggleOverlay: () => set({ open: !get().open }),

      setActiveTab: ({ tabId }) => set({ activeTabId: tabId }),

      setTabNativeSession: ({ tabId, nativeSessionId }) => {
        if (!isStandaloneCliTabId(tabId)) {
          return;
        }
        const normalized = nativeSessionId?.trim() || undefined;
        const current = get().nativeSessionIdByTab;
        if (current[tabId] === normalized) {
          return;
        }
        const next = { ...current };
        if (normalized) {
          next[tabId] = normalized;
        } else {
          delete next[tabId];
        }
        set({ nativeSessionIdByTab: next });
      },

      adoptFolder: async ({ folderPath }, deps) => {
        const normalized = folderPath.trim() || null;
        if (normalized === get().adoptedFolderPath) {
          return;
        }

        // Tear the sessions down before adopting so the new folder can never
        // resume the previous folder's conversation.
        const closeSessionsBySlotPrefix =
          deps?.closeSessionsBySlotPrefix ??
          window.api?.terminal?.closeSessionsBySlotPrefix;
        try {
          await closeSessionsBySlotPrefix?.({
            prefix: STANDALONE_CLI_SLOT_PREFIX,
          });
        } catch {
          // Best effort. Local state must still be cleared, otherwise a failed
          // IPC would leave stale native session ids pointing at the old folder.
        }

        set({ adoptedFolderPath: normalized, nativeSessionIdByTab: {} });
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: "stave:standalone-cli",
      partialize: (state) => ({
        activeTabId: state.activeTabId,
        adoptedFolderPath: state.adoptedFolderPath,
        nativeSessionIdByTab: state.nativeSessionIdByTab,
      }),
    },
  ),
);

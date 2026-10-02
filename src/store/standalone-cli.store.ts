import { create } from "zustand";
import {
  persist,
  type PersistStorage,
  type StorageValue,
} from "zustand/middleware";
import {
  STANDALONE_CLI_SLOT_PREFIX,
  STANDALONE_CLI_TAB_IDS,
  STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
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
  accountProfileIdByTab: Partial<Record<StandaloneCliTabId, string>>;
  pinTabAccount: (tabId: StandaloneCliTabId, accountProfileId: string) => void;
  /**
   * Moves a tab to another account. The tab's conversation belongs to the old
   * account, so its resume id is dropped with it; the caller restarts the
   * session. Returns false when the tab is already on that account.
   */
  setTabAccount: (tabId: StandaloneCliTabId, accountProfileId: string) => boolean;
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

type PersistedStandaloneCliState = Pick<
  StandaloneCliState,
  "activeTabId" | "adoptedFolderPath" | "nativeSessionIdByTab" | "accountProfileIdByTab"
>;

/**
 * zustand's default persist storage is `createJSONStorage(() => window.localStorage)`,
 * and `createJSONStorage` guards only against that resolver throwing — not against it
 * returning undefined. Tests in this repository routinely install a bare
 * `globalThis.window = { api: ... }` with no `localStorage`, after which every write
 * would call `undefined.setItem`. Resolve and shape-check per call so an absent or
 * partial backing store degrades to a no-op.
 */
function resolveBackingStorage(): Storage | null {
  let candidate: Storage | undefined;
  try {
    candidate = (globalThis as { window?: { localStorage?: unknown } }).window
      ?.localStorage as Storage | undefined;
  } catch {
    // Some sandboxed origins throw on the property access itself.
    return null;
  }
  if (
    !candidate ||
    typeof candidate.getItem !== "function" ||
    typeof candidate.setItem !== "function" ||
    typeof candidate.removeItem !== "function"
  ) {
    return null;
  }
  return candidate;
}

const standaloneCliStorage: PersistStorage<PersistedStandaloneCliState> = {
  getItem: (name) => {
    const raw = resolveBackingStorage()?.getItem(name);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as StorageValue<PersistedStandaloneCliState>;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    resolveBackingStorage()?.setItem(name, JSON.stringify(value));
  },
  removeItem: (name) => {
    resolveBackingStorage()?.removeItem(name);
  },
};

const initialState = {
  open: false,
  activeTabId: "claude-code" as StandaloneCliTabId,
  adoptedFolderPath: null,
  nativeSessionIdByTab: {},
  accountProfileIdByTab: {},
} satisfies Pick<
  StandaloneCliState,
  "open" | "activeTabId" | "adoptedFolderPath" | "nativeSessionIdByTab" | "accountProfileIdByTab"
>;

export const useStandaloneCliStore = create<StandaloneCliState>()(
  persist(
    (set, get) => ({
      ...initialState,

      openOverlay: () => set({ open: true }),
      closeOverlay: () => set({ open: false }),
      toggleOverlay: () => set({ open: !get().open }),

      setActiveTab: ({ tabId }) => set({ activeTabId: tabId }),

      // Runs on every session launch, so an already-pinned tab must leave the
      // map's identity alone. A fresh object here rebuilds the active tab while
      // its launch is still in flight, and the cancelled launch then closes the
      // session the next launch has just adopted from the same slot.
      pinTabAccount: (tabId, accountProfileId) => {
        const current = get().accountProfileIdByTab;
        if (current[tabId]) {
          return;
        }
        set({ accountProfileIdByTab: { ...current, [tabId]: accountProfileId } });
      },
      setTabAccount: (tabId, accountProfileId) => {
        const { accountProfileIdByTab, nativeSessionIdByTab } = get();
        if (accountProfileIdByTab[tabId] === accountProfileId) {
          return false;
        }
        const nextNativeSessionIdByTab = { ...nativeSessionIdByTab };
        delete nextNativeSessionIdByTab[tabId];
        set({
          accountProfileIdByTab: { ...accountProfileIdByTab, [tabId]: accountProfileId },
          nativeSessionIdByTab: nextNativeSessionIdByTab,
        });
        return true;
      },
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
        let closed: boolean;
        try {
          const result = await closeSessionsBySlotPrefix?.({
            prefix: STANDALONE_CLI_SLOT_PREFIX,
          });
          // An absent bridge means there is no host slot to close at all.
          closed = result?.ok ?? true;
        } catch {
          closed = false;
        }

        if (!closed) {
          // A half-applied folder change is worse than a retried one. The old
          // PTYs are still alive in their slots, and createCliSession returns an
          // existing slot session while ignoring the new cwd, so committing here
          // would permanently show folder B while the CLI runs in folder A.
          // Leaving adoptedFolderPath and the resume ids untouched keeps the
          // mismatch visible so the next reconciliation retries the teardown.
          return;
        }

        // Transcript entries are keyed by tab only, so they are folder
        // independent and would otherwise replay the previous folder's
        // scrollback above the new folder's prompt.
        resolveBackingStorage()?.removeItem(
          STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
        );

        set({ adoptedFolderPath: normalized, nativeSessionIdByTab: {}, accountProfileIdByTab: {} });
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: "stave:standalone-cli",
      storage: standaloneCliStorage,
      partialize: (state) => ({
        activeTabId: state.activeTabId,
        adoptedFolderPath: state.adoptedFolderPath,
        nativeSessionIdByTab: state.nativeSessionIdByTab,
        accountProfileIdByTab: state.accountProfileIdByTab,
      }),
    },
  ),
);

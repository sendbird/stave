import { describe, expect, test } from "bun:test";
import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import {
  arePersistedSlicesEqual,
  createCoalescedPersistStorage,
  type CoalescedPersistTimers,
  type SyncStringStorage,
} from "@/store/app-store-persist-storage";
import {
  createAppStorePersistenceOptions,
  flushPersistenceForQuit,
} from "@/store/app-store-persistence";
import type { AppState } from "@/store/app-store.types";

function createCountingStorage() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const storage: SyncStringStorage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      writes.push(value);
      values.set(name, value);
    },
    removeItem: (name) => {
      values.delete(name);
    },
  };
  return { storage, values, writes };
}

function createManualTimers() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; callback: () => void }>();
  const timers: CoalescedPersistTimers = {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      scheduled.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (handle) => {
      scheduled.delete(handle as number);
    },
    now: () => now,
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...scheduled.entries()]
        .filter(([, entry]) => entry.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      scheduled.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  };
  return { timers, advance, pendingCount: () => scheduled.size };
}

type TestState = {
  settings: { theme: string };
  layout: { width: number };
  streamingTick: number;
  setTheme: (theme: string) => void;
  tick: () => void;
};

function createPersistedTestStore() {
  const backing = createCountingStorage();
  const clock = createManualTimers();
  const lifecycleListeners = new Map<string, () => void>();
  const storage = createCoalescedPersistStorage<
    Pick<TestState, "settings" | "layout">
  >({
    getStorage: () => backing.storage,
    debounceMs: 400,
    maxWaitMs: 2000,
    timers: clock.timers,
    lifecycleTarget: {
      addEventListener: ((type: string, listener: () => void) => {
        lifecycleListeners.set(type, listener);
      }) as Window["addEventListener"],
    },
  });
  if (!storage) throw new Error("storage should resolve");
  const store = createStore<TestState>()(
    persist(
      (set) => ({
        settings: { theme: "dark" },
        layout: { width: 300 },
        streamingTick: 0,
        setTheme: (theme) => set({ settings: { theme } }),
        tick: () => set((state) => ({ streamingTick: state.streamingTick + 1 })),
      }),
      {
        name: "test-store",
        storage,
        partialize: (state) => ({
          settings: state.settings,
          layout: state.layout,
        }),
      },
    ),
  );
  // The first update after start always writes once (nothing is accepted
  // yet); settle it so each test starts from a clean slate.
  store.getState().tick();
  storage.flush();
  backing.writes.length = 0;
  return { store, storage, backing, clock, lifecycleListeners };
}

describe("arePersistedSlicesEqual", () => {
  test("compares top-level slices by reference", () => {
    const settings = { theme: "dark" };
    expect(arePersistedSlicesEqual({ settings }, { settings })).toBe(true);
    expect(
      arePersistedSlicesEqual({ settings }, { settings: { theme: "dark" } }),
    ).toBe(false);
    expect(arePersistedSlicesEqual({ settings }, { settings, extra: 1 })).toBe(
      false,
    );
    expect(arePersistedSlicesEqual({ a: undefined }, { b: undefined })).toBe(
      false,
    );
  });
});

describe("createCoalescedPersistStorage", () => {
  test("skips the write when only non-persisted state changes", () => {
    const { store, backing, clock, storage } = createPersistedTestStore();
    for (let index = 0; index < 50; index += 1) {
      store.getState().tick();
    }
    clock.advance(5000);
    expect(backing.writes).toHaveLength(0);
    expect(storage.hasPendingWrite()).toBe(false);
  });

  test("coalesces a burst into one trailing write of the latest state", () => {
    const { store, backing, clock } = createPersistedTestStore();
    store.getState().setTheme("light");
    clock.advance(100);
    store.getState().setTheme("solarized");
    clock.advance(100);
    store.getState().setTheme("nord");
    expect(backing.writes).toHaveLength(0);
    clock.advance(399);
    expect(backing.writes).toHaveLength(0);
    clock.advance(1);
    expect(backing.writes).toHaveLength(1);
    expect(JSON.parse(backing.writes[0]!).state.settings.theme).toBe("nord");
  });

  test("writes at least once per max wait during a steady stream of changes", () => {
    const { store, backing, clock } = createPersistedTestStore();
    for (let index = 0; index < 30; index += 1) {
      store.getState().setTheme(`theme-${index}`);
      clock.advance(100);
    }
    // 3 s of changes every 100 ms: the 2 s max wait forces one write mid-stream.
    expect(backing.writes).toHaveLength(1);
    clock.advance(400);
    expect(backing.writes).toHaveLength(2);
    expect(JSON.parse(backing.writes.at(-1)!).state.settings.theme).toBe(
      "theme-29",
    );
  });

  test("flush writes the latest state immediately and only once", () => {
    const { store, storage, backing, clock } = createPersistedTestStore();
    store.getState().setTheme("light");
    store.getState().setTheme("nord");
    storage.flush();
    expect(backing.writes).toHaveLength(1);
    expect(
      JSON.parse(backing.values.get("test-store")!).state.settings.theme,
    ).toBe("nord");
    clock.advance(5000);
    storage.flush();
    expect(backing.writes).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
  });

  test("flushes on pagehide and beforeunload", () => {
    const { store, backing, lifecycleListeners } = createPersistedTestStore();
    store.getState().setTheme("light");
    lifecycleListeners.get("pagehide")?.();
    expect(backing.writes).toHaveLength(1);
    store.getState().setTheme("nord");
    lifecycleListeners.get("beforeunload")?.();
    expect(backing.writes).toHaveLength(2);
  });

  test("a read flushes the pending write first", async () => {
    const { store, storage } = createPersistedTestStore();
    store.getState().setTheme("nord");
    const value = await storage.getItem("test-store");
    expect(value?.state.settings.theme).toBe("nord");
  });

  test("removeItem drops the pending write", () => {
    const { store, storage, backing, clock } = createPersistedTestStore();
    store.getState().setTheme("nord");
    storage.removeItem("test-store");
    clock.advance(5000);
    expect(backing.writes).toHaveLength(0);
    expect(backing.values.has("test-store")).toBe(false);
  });

  test("a value written by someone else after our last write keeps winning", () => {
    const { store, storage, backing, clock } = createPersistedTestStore();
    store.getState().setTheme("nord");
    // e.g. the e2e harness seeding `localStorage` before a reload.
    const seeded = JSON.stringify({ state: { seeded: true }, version: 0 });
    backing.values.set("test-store", seeded);
    clock.advance(5000);
    storage.flush();
    expect(backing.values.get("test-store")).toBe(seeded);
    expect(backing.writes).toHaveLength(0);

    // Any later update writes the full state again, as a synchronous
    // persist write would have.
    store.getState().tick();
    storage.flush();
    expect(backing.writes).toHaveLength(1);
    expect(
      JSON.parse(backing.values.get("test-store")!).state.settings.theme,
    ).toBe("nord");
  });

  test("a failed write is logged and retried on the next change", () => {
    const { store, storage, backing } = createPersistedTestStore();
    const originalSetItem = backing.storage.setItem;
    const originalConsoleError = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      backing.storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      store.getState().setTheme("nord");
      expect(() => storage.flush()).not.toThrow();
      expect(errors).toHaveLength(1);
      backing.storage.setItem = originalSetItem;
      store.getState().setTheme("nord-2");
      storage.flush();
      expect(backing.writes).toHaveLength(1);
    } finally {
      backing.storage.setItem = originalSetItem;
      console.error = originalConsoleError;
    }
  });

  test("a failed write reports failure and stays pending for the next flush", () => {
    const { store, storage, backing } = createPersistedTestStore();
    const originalSetItem = backing.storage.setItem;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      backing.storage.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      store.getState().setTheme("nord");
      expect(storage.flush()).toBe(false);
      expect(storage.hasPendingWrite()).toBe(true);
      // Unrelated updates do not drop the retained value.
      store.getState().tick();
      expect(storage.hasPendingWrite()).toBe(true);

      backing.storage.setItem = originalSetItem;
      // No new change: the retry alone writes the retained value.
      expect(storage.flush()).toBe(true);
      expect(storage.hasPendingWrite()).toBe(false);
      expect(
        JSON.parse(backing.values.get("test-store")!).state.settings.theme,
      ).toBe("nord");
      expect(storage.flush()).toBe(true);
    } finally {
      backing.storage.setItem = originalSetItem;
      console.error = originalConsoleError;
    }
  });

  test("resolves to undefined when the backing storage is unavailable", () => {
    expect(
      createCoalescedPersistStorage({
        getStorage: () => {
          throw new Error("no localStorage");
        },
        lifecycleTarget: null,
      }),
    ).toBeUndefined();
  });
});

describe("createAppStorePersistenceOptions partialize", () => {
  test("keeps every persisted slice reference-stable while inputs are unchanged", () => {
    const options = createAppStorePersistenceOptions();
    const state = {
      workspaces: [{ id: "ws-1", name: "main", updatedAt: "2026-01-01T00:00:00.000Z" }],
      activeWorkspaceId: "ws-1",
      activeAppSurface: { kind: "workspace" },
      repositoryPath: "/tmp/repo",
      repositoryName: "repo",
      defaultBranch: "main",
      recentRepositories: [],
      workspaceBranchById: { "ws-1": "main" },
      workspacePathById: { "ws-1": "/tmp/repo" },
      workspaceDefaultById: { "ws-1": true },
      workspaceLastActiveAtById: {},
      workspaceSettlementById: {},
      taskCheckpointById: {},
      compareRunsById: {},
      isDarkMode: true,
      draftProvider: "claude-code",
      layout: {},
      settings: {},
    } as unknown as AppState;
    const first = options.partialize({ ...state });
    const second = options.partialize({ ...state, isDarkMode: true });
    expect(arePersistedSlicesEqual(first, second)).toBe(true);
    expect(first.recentRepositories[0]?.repositoryPath).toBe("/tmp/repo");

    const third = options.partialize({ ...state, defaultBranch: "develop" });
    expect(third.recentRepositories).not.toBe(first.recentRepositories);
    expect(third.recentRepositories[0]?.defaultBranch).toBe("develop");
  });
});

describe("flushPersistenceForQuit", () => {
  test("reports failure when the app-store write fails, after flushing the other stores", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      let storesFlushed = false;
      const success = await flushPersistenceForQuit({
        flushAppStore: () => false,
        flushStores: async () => {
          storesFlushed = true;
        },
      });
      expect(success).toBe(false);
      expect(storesFlushed).toBe(true);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("reports success when every write lands and rejects when a store flush fails", async () => {
    expect(
      await flushPersistenceForQuit({
        flushAppStore: () => true,
        flushStores: async () => {},
      }),
    ).toBe(true);
    await expect(
      flushPersistenceForQuit({
        flushAppStore: () => true,
        flushStores: async () => {
          throw new Error("sqlite closed");
        },
      }),
    ).rejects.toThrow("sqlite closed");
  });
});

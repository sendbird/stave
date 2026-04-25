import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("reasoning expansion mode settings", () => {
  test("rehydrates invalid persisted values to manual", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    localStorage.setItem("stave-store", JSON.stringify({
      state: {
        settings: {
          reasoningExpansionMode: "bogus",
        },
      },
      version: 0,
    }));

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());

    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        rehydrate: () => Promise<void>;
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });
    await persistedStore.persist.rehydrate();

    expect(useAppStore.getState().settings.reasoningExpansionMode).toBe("manual");
  });

  test("migrates the legacy expanded flag into the new mode key", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    localStorage.setItem("stave-store", JSON.stringify({
      state: {
        settings: {
          reasoningDefaultExpanded: true,
        },
      },
      version: 0,
    }));

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());

    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        rehydrate: () => Promise<void>;
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });
    await persistedStore.persist.rehydrate();

    expect(useAppStore.getState().settings.reasoningExpansionMode).toBe("auto");

    useAppStore.getState().updateSettings({
      patch: {
        chatSendPreview: false,
      },
    });

    const persisted = JSON.parse(localStorage.getItem("stave-store") ?? "{}") as {
      state?: {
        settings?: Record<string, unknown>;
      };
    };

    expect(persisted.state?.settings?.reasoningExpansionMode).toBe("auto");
    expect(persisted.state?.settings?.reasoningDefaultExpanded).toBeUndefined();
  });
});

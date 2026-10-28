import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { defaultSettings } from "../src/store/app-settings";

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

/** Rehydrates the store from a persisted `settings` object. */
async function rehydrateWithSettings(settings: Record<string, unknown> | null) {
  const localStorage = createMemoryStorage();
  (globalThis as { window?: unknown }).window = {
    localStorage,
    api: { fs: { listFiles: async () => ({ ok: true, files: [] }) } },
  };
  if (settings) {
    localStorage.setItem(
      "stave-store",
      JSON.stringify({ state: { settings }, version: 0 }),
    );
  }
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  const persistedStore = useAppStore as typeof useAppStore & {
    persist: {
      rehydrate: () => Promise<void>;
      setOptions: (options: {
        storage: ReturnType<typeof createJSONStorage>;
      }) => void;
    };
  };
  persistedStore.persist.setOptions({
    storage: createJSONStorage(() => localStorage as Storage),
  });
  await persistedStore.persist.rehydrate();
  return useAppStore.getState().settings;
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("message font size default", () => {
  test("a new install reads the transcript at 16px with 14px code", async () => {
    expect(defaultSettings.messageFontSize).toBe(16);
    expect(defaultSettings.messageCodeFontSize).toBe(14);
    const settings = await rehydrateWithSettings(null);
    expect(settings.messageFontSize).toBe(16);
  });

  test("a saved size is kept, including the previous 18px default", async () => {
    expect((await rehydrateWithSettings({ messageFontSize: 18 })).messageFontSize).toBe(18);
    expect((await rehydrateWithSettings({ messageFontSize: 20 })).messageFontSize).toBe(20);
  });

  test("saved settings without a size take the new default", async () => {
    const settings = await rehydrateWithSettings({ themeMode: "dark" });
    expect(settings.messageFontSize).toBe(16);
  });

  test("the legacy named sizes still map to their pixel values", async () => {
    expect((await rehydrateWithSettings({ messageFontSize: "base" })).messageFontSize).toBe(16);
    expect((await rehydrateWithSettings({ messageFontSize: "lg" })).messageFontSize).toBe(18);
  });
});

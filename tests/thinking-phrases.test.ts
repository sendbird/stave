import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import {
  THINKING_PHRASE_ANIMATION_STYLES,
  normalizeThinkingPhraseAnimationStyle,
} from "@/lib/thinking-phrases";

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

describe("thinking phrase animation settings", () => {
  test("accepts every supported animation style", () => {
    for (const style of THINKING_PHRASE_ANIMATION_STYLES) {
      expect(normalizeThinkingPhraseAnimationStyle(style)).toBe(style);
    }
  });

  test("falls back to the default animation style for invalid persisted values", () => {
    expect(normalizeThinkingPhraseAnimationStyle("bogus")).toBe("soft");
    expect(normalizeThinkingPhraseAnimationStyle(null)).toBe("soft");
  });

  test("rehydrates invalid persisted animation styles to the default", async () => {
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
          thinkingPhraseAnimationStyle: "bogus",
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

    expect(useAppStore.getState().settings.thinkingPhraseAnimationStyle).toBe("soft");
  });

  test("preserves valid persisted animation styles during rehydrate", async () => {
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
          thinkingPhraseAnimationStyle: "slot",
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

    expect(useAppStore.getState().settings.thinkingPhraseAnimationStyle).toBe("slot");
  });
});

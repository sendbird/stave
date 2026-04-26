import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  LEGACY_DEFAULT_PROMPT_RESPONSE_STYLE,
} from "@/lib/providers/prompt-defaults";

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

describe("prompt response style migration", () => {
  test("rehydrates the legacy inline-code default into the markdown-link default", async () => {
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
          promptResponseStyle: LEGACY_DEFAULT_PROMPT_RESPONSE_STYLE,
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

    expect(useAppStore.getState().settings.promptResponseStyle).toBe(DEFAULT_PROMPT_RESPONSE_STYLE);
  });

  test("preserves customized response style prompts during rehydrate", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    const customPrompt = [
      "Response formatting rules:",
      "- Be terse.",
      "- Use inline code for CLI flags only.",
    ].join("\n");

    localStorage.setItem("stave-store", JSON.stringify({
      state: {
        settings: {
          promptResponseStyle: customPrompt,
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

    expect(useAppStore.getState().settings.promptResponseStyle).toBe(customPrompt);
  });
});

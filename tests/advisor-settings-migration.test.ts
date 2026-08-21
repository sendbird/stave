import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
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
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("Advisor settings rehydration", () => {
  test("migrates the legacy source model and removes its persisted key", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

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
    localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          settings: {
            claudeAdvisorModel: "claude-haiku-4-5",
            themeMode: "light",
          },
        },
        version: 0,
      }),
    );

    await persistedStore.persist.rehydrate();

    expect(useAppStore.getState().settings.themeMode).toBe("light");
    expect(
      (useAppStore.getState().settings as unknown as Record<string, unknown>)
        .claudeAdvisorModel,
    ).toBeUndefined();
    expect(useAppStore.getState().settings.advisorTarget).toEqual({
      providerId: "claude-code",
      model: "claude-sonnet-5",
    });
    // The legacy shape expressed "armed" as a configured target, so the
    // migrated snapshot has to stay armed rather than quietly turning off.
    expect(useAppStore.getState().settings.advisorEnabled).toBe(true);

    useAppStore.getState().updateSettings({
      patch: {
        advisorTarget: {
          providerId: "claude-code",
          model: "claude-sonnet-5",
        },
      },
    });
    const persisted = JSON.parse(
      localStorage.getItem("stave-store") ?? "{}",
    ) as {
      state?: { settings?: Record<string, unknown> };
    };

    expect(persisted.state?.settings?.advisorTarget).toEqual({
      providerId: "claude-code",
      model: "claude-sonnet-5",
    });
    expect(persisted.state?.settings?.claudeAdvisorModel).toBeUndefined();
  });

  test("keeps per-provider defaults through an explicit default-off state", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

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
    localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          settings: {
            advisorEnabled: false,
            advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" },
            advisorTargetByProvider: {
              "claude-code": { model: "claude-fable-5", effort: "high" },
              // Junk is dropped rather than trusted: a newer build could have
              // written a provider or tier this build does not know.
              codex: { model: "   " },
              gemini: { model: "gemini-3" },
            },
          },
        },
        version: 0,
      }),
    );

    await persistedStore.persist.rehydrate();

    const settings = useAppStore.getState().settings;
    expect(settings.advisorEnabled).toBe(false);
    expect(settings.advisorTarget).toEqual({
      providerId: "codex",
      model: "gpt-5.6-sol",
    });
    expect(settings.advisorTargetByProvider).toEqual({
      "claude-code": { model: "claude-fable-5", effort: "high" },
    });
  });
});

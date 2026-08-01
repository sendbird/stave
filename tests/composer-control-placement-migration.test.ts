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

async function rehydrateWithPersistedSettings(
  settings: Record<string, unknown>,
) {
  const localStorage = createMemoryStorage();
  localStorage.setItem(
    "stave-store",
    JSON.stringify({ state: { settings }, version: 0 }),
  );
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
  await persistedStore.persist.rehydrate();

  return { useAppStore, localStorage };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("composer control placement setting", () => {
  test("defaults to an empty map, meaning every control stays on the toolbar", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({});
    expect(useAppStore.getState().settings.composerControlPlacements).toEqual(
      {},
    );
  });

  test("persists explicit placements through updateSettings", async () => {
    const { useAppStore, localStorage } =
      await rehydrateWithPersistedSettings({});

    useAppStore.getState().updateSettings({
      patch: { composerControlPlacements: { compare: "overflow" } },
    });

    const persisted = JSON.parse(
      localStorage.getItem("stave-store") ?? "{}",
    ) as { state?: { settings?: Record<string, unknown> } };
    expect(persisted.state?.settings?.composerControlPlacements).toEqual({
      compare: "overflow",
    });
  });

  test("normalizes a bogus placement written by a future or corrupt build", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      composerControlPlacements: { advisor: "sideways", review: "hidden" },
    });
    expect(useAppStore.getState().settings.composerControlPlacements).toEqual({
      review: "hidden",
    });
  });

  test("migrates codexFastModeVisible:false into the placement map", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      codexFastModeVisible: false,
    });
    const settings = useAppStore.getState().settings;
    expect(settings.composerControlPlacements).toEqual({ fast: "hidden" });
    expect(
      (settings as Record<string, unknown>).codexFastModeVisible,
    ).toBeUndefined();
  });

  test("migrates the older fastModeVisible key too", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      fastModeVisible: false,
    });
    expect(useAppStore.getState().settings.composerControlPlacements).toEqual({
      fast: "hidden",
    });
  });

  test("leaves the map untouched when the legacy flag was on", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      codexFastModeVisible: true,
    });
    expect(useAppStore.getState().settings.composerControlPlacements).toEqual(
      {},
    );
  });

  test("an explicit new-format entry wins over the legacy flag", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      codexFastModeVisible: false,
      composerControlPlacements: { fast: "toolbar", advisor: "overflow" },
    });
    // `fast: "toolbar"` normalizes away as the default, and the legacy flag
    // must not resurrect it as hidden.
    expect(useAppStore.getState().settings.composerControlPlacements).toEqual({
      advisor: "overflow",
    });
  });
});

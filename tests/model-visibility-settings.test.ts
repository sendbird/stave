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

describe("model visibility setting", () => {
  test("defaults to empty, meaning the selector shows current models only", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({});
    expect(useAppStore.getState().settings.modelVisibility).toEqual({});
  });

  test("collapses a persisted provider variant onto its selector row", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      modelVisibility: {
        cursor: { "gpt-5.4[context=272k,fast=true]": false },
        "claude-code": { "claude-opus-5[1m]": true },
      },
    });
    expect(useAppStore.getState().settings.modelVisibility).toEqual({
      cursor: { "gpt-5.4": false },
      "claude-code": { "claude-opus-5": true },
    });
  });

  test("drops entries a future or corrupt build could write", async () => {
    const { useAppStore } = await rehydrateWithPersistedSettings({
      modelVisibility: {
        legacy: { "old-model": true },
        codex: { "gpt-5.5": "yes" },
        kiro: { "kiro-model": false },
      },
    });
    expect(useAppStore.getState().settings.modelVisibility).toEqual({
      kiro: { "kiro-model": false },
    });
  });

  test("persists overrides written from Settings", async () => {
    const { useAppStore, localStorage } =
      await rehydrateWithPersistedSettings({});

    useAppStore.getState().updateSettings({
      patch: { modelVisibility: { codex: { "gpt-5.4": true } } },
    });

    const persisted = JSON.parse(
      localStorage.getItem("stave-store") ?? "{}",
    ) as { state?: { settings?: Record<string, unknown> } };
    expect(persisted.state?.settings?.modelVisibility).toEqual({
      codex: { "gpt-5.4": true },
    });
  });

  test("is reachable from settings search", async () => {
    const { settingDefinitions } = await import(
      "../src/components/layout/settings-dialog.registry"
    );
    const definition = settingDefinitions.find(
      (candidate) => candidate.key === "modelVisibility",
    );
    expect(definition?.sectionId).toBe("models");
    expect(definition?.fieldId).toBe("settings-field-model-visibility");
    expect(definition?.defaultValue).toEqual({});
  });
});

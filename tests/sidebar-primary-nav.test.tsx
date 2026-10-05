import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAppStorePersistenceOptions } from "@/store/app-store-persistence";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";

const initial = useAppStore.getInitialState();
const shortcuts = [
  "sidebarShowFleetView",
  "sidebarShowAgents",
  "sidebarShowResults",
  "sidebarShowAiUsage",
] as const;

const originalWindow = globalThis.window;
beforeEach(() => {
  globalThis.window = { api: {} } as Window & typeof globalThis;
});
afterEach(() => {
  useAppStore.setState(initial, true);
  globalThis.window = originalWindow;
});

describe("sidebar shortcut visibility", () => {
  test("updates each preference independently and can restore all shortcuts", () => {
    for (const key of shortcuts) {
      useAppStore.setState({ settings: initial.settings });
      useAppStore.getState().updateSettings({ patch: { [key]: false } });
      expect(useAppStore.getState().settings[key]).toBe(false);
      for (const otherKey of shortcuts) {
        if (otherKey !== key) expect(useAppStore.getState().settings[otherKey]).toBe(true);
      }
      useAppStore.getState().updateSettings({ patch: { [key]: true } });
      expect(useAppStore.getState().settings[key]).toBe(true);
    }
  });

  test("restores saved false values and defaults missing or invalid preferences to visible", () => {
    const options = createAppStorePersistenceOptions();
    const restore = (settings: Record<string, unknown>) => {
      const state = { ...initial, settings } as unknown as AppState;
      options.onRehydrateStorage()(state);
      return state;
    };
    const hidden = restore(Object.fromEntries(shortcuts.map((key) => [key, false])));
    const written = options.partialize(hidden);
    const reloaded = restore(JSON.parse(JSON.stringify(written.settings)));
    for (const key of shortcuts) expect(reloaded.settings[key]).toBe(false);
    for (const settings of [{}, Object.fromEntries(shortcuts.map((key) => [key, "false"]))]) {
      const state = restore(settings);
      for (const key of shortcuts) expect(state.settings[key]).toBe(true);
    }
  });
});

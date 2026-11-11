import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAppStorePersistenceOptions } from "@/store/app-store-persistence";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";

const originalWindow = globalThis.window;
beforeEach(() => {
  globalThis.window = { api: {} } as Window & typeof globalThis;
});
afterEach(() => {
  globalThis.window = originalWindow;
});

describe("retired sync settings", () => {
  test("rehydration drops the removed Martin sync toggles and keeps the rest", () => {
    const initial = useAppStore.getInitialState();
    const state = {
      ...initial,
      settings: {
        ...initial.settings,
        // Saved by releases up to 0.33.1.
        martinSync: {
          enabled: true,
          prOpened: true,
          taskCompleted: true,
          resourceLinks: true,
          turnSummaries: false,
        },
      },
    } as unknown as AppState;

    createAppStorePersistenceOptions().onRehydrateStorage()(state);

    expect(state.settings).not.toHaveProperty("martinSync");
    expect(state.settings.craneConnector).toEqual(initial.settings.craneConnector);
  });
});

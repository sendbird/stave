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

describe("retired task checkpoints", () => {
  test("rehydration drops the saved task checkpoint map and no longer persists it", () => {
    const initial = useAppStore.getInitialState();
    // Saved by releases up to 0.35.0.
    const state = { ...initial, taskCheckpointById: { task: "abc123" } } as unknown as AppState;
    const options = createAppStorePersistenceOptions();
    options.onRehydrateStorage()(state);
    expect(state).not.toHaveProperty("taskCheckpointById");
    expect(options.partialize(state)).not.toHaveProperty("taskCheckpointById");
  });
});

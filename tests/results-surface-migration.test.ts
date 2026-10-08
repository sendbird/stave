import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAppStorePersistenceOptions } from "@/store/app-store-persistence";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { AGENTS_APP_SURFACE } from "@/store/app-surface";
import { useAgentsViewStore } from "@/store/agents-view-store";

const originalWindow = globalThis.window;
beforeEach(() => {
  globalThis.window = { api: {} } as Window & typeof globalThis;
  useAgentsViewStore.setState({ activeTab: "agents" });
});
afterEach(() => {
  globalThis.window = originalWindow;
  useAgentsViewStore.setState({ activeTab: "agents" });
});

function rehydrate(activeAppSurface: unknown) {
  const options = createAppStorePersistenceOptions();
  const state = {
    ...useAppStore.getInitialState(),
    activeAppSurface,
  } as unknown as AppState;
  options.onRehydrateStorage()(state);
  return state;
}

// Registered as `results-surface-to-agents-tab` in config/temporary-migrations.json.
describe("persisted Results surface", () => {
  test("a profile that last had Agent performance open reopens Agents on the Performance tab", () => {
    const state = rehydrate({ kind: "results" });
    expect(state.activeAppSurface).toBe(AGENTS_APP_SURFACE);
    expect(useAgentsViewStore.getState().activeTab).toBe("performance");
  });

  test("is idempotent and leaves a saved Agents surface on its current tab", () => {
    const converted = rehydrate({ kind: "results" }).activeAppSurface;
    useAgentsViewStore.setState({ activeTab: "standards" });
    const again = rehydrate(converted);
    expect(again.activeAppSurface).toBe(AGENTS_APP_SURFACE);
    expect(useAgentsViewStore.getState().activeTab).toBe("standards");
  });
});

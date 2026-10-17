import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MAX_RETAINED_COMPARE_RUNS,
  type CompareRun,
} from "@/lib/compare-runs";
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

function persistedRun(
  index: number,
  status: CompareRun["status"],
): CompareRun {
  const at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    id: `run-${index}`,
    seedPrompt: `run ${index}`,
    baseWorkspaceId: "base",
    createdAt: at,
    updatedAt: at,
    status,
    variants: [],
  };
}

describe("persisted compare run history", () => {
  test("restores at most the cap of finished runs, newest first", () => {
    const total = MAX_RETAINED_COMPARE_RUNS + 5;
    const compareRunsById = Object.fromEntries(
      Array.from({ length: total }, (_, index) => [
        `run-${index}`,
        persistedRun(index, "completed"),
      ]),
    );
    const state = {
      ...useAppStore.getInitialState(),
      compareRunsById,
    } as unknown as AppState;

    createAppStorePersistenceOptions().onRehydrateStorage()(state);

    expect(Object.keys(state.compareRunsById)).toHaveLength(
      MAX_RETAINED_COMPARE_RUNS,
    );
    expect(state.compareRunsById["run-0"]).toBeUndefined();
    expect(state.compareRunsById[`run-${total - 1}`]).toBeDefined();
  });
});

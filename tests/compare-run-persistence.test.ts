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
  id: string,
  minute: number,
  decided: boolean,
): CompareRun {
  const at = new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
  return {
    id,
    seedPrompt: id,
    baseWorkspaceId: "base",
    createdAt: at,
    updatedAt: at,
    status: "completed",
    ...(decided ? { keptVariantId: `${id}:variant-1` } : {}),
    variants: [],
  };
}

describe("persisted compare run history", () => {
  test("restores every undecided run and only the newest decided runs up to the cap", () => {
    const decidedCount = MAX_RETAINED_COMPARE_RUNS + 10;
    const compareRunsById = Object.fromEntries([
      // Undecided runs are the oldest, so a plain recency cap would drop them.
      ...Array.from({ length: 5 }, (_, index) => [
        `undecided-${index}`,
        persistedRun(`undecided-${index}`, index, false),
      ]),
      ...Array.from({ length: decidedCount }, (_, index) => [
        `decided-${index}`,
        persistedRun(`decided-${index}`, 100 + index, true),
      ]),
    ]);
    const state = {
      ...useAppStore.getInitialState(),
      compareRunsById,
    } as unknown as AppState;

    createAppStorePersistenceOptions().onRehydrateStorage()(state);

    const restoredIds = Object.keys(state.compareRunsById);
    expect(restoredIds.filter((id) => id.startsWith("undecided-"))).toHaveLength(5);
    expect(restoredIds.filter((id) => id.startsWith("decided-"))).toHaveLength(
      MAX_RETAINED_COMPARE_RUNS,
    );
    expect(state.compareRunsById["decided-9"]).toBeUndefined();
    expect(state.compareRunsById[`decided-${decidedCount - 1}`]).toBeDefined();
  });
});

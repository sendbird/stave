import { describe, expect, test } from "bun:test";
import {
  initialPlansListState,
  reducePlansList,
  resolvePlansListView,
  type PlansListState,
} from "@/components/layout/workspace-plans-list-state";

const PLANS = { current: [".stave/context/plans/a.md", ".stave/context/plans/b.md"], legacy: [] };

function viewOf(state: PlansListState) {
  return resolvePlansListView({
    hasWorkspacePath: true,
    loading: state.loading,
    loadFailed: state.loadFailed,
    entryCount: state.filePaths.current.length + state.filePaths.legacy.length,
  });
}

describe("Plans list load state", () => {
  test("a failed refresh keeps the plans already shown and flags the failure", () => {
    let state = reducePlansList(initialPlansListState(true), { type: "load-succeeded", filePaths: PLANS });
    state = reducePlansList(state, { type: "load-started" });
    state = reducePlansList(state, { type: "load-failed" });
    expect(state.filePaths).toEqual(PLANS);
    expect(state.loadFailed).toBe(true);
    expect(viewOf(state)).toBe("list");
  });

  test("a failed first read shows the failure, never the empty state", () => {
    let state = initialPlansListState(true);
    expect(viewOf(state)).toBe("loading");
    state = reducePlansList(state, { type: "load-failed" });
    expect(viewOf(state)).toBe("failed");
    // Retrying keeps the failure on screen instead of flickering to a spinner.
    state = reducePlansList(state, { type: "load-started" });
    expect(viewOf(state)).toBe("failed");
  });

  test("only a successful read with no files shows the empty state", () => {
    let state = reducePlansList(initialPlansListState(true), { type: "load-failed" });
    state = reducePlansList(state, { type: "load-succeeded", filePaths: { current: [], legacy: [] } });
    expect(state.loadFailed).toBe(false);
    expect(viewOf(state)).toBe("empty");
  });

  test("removing a plan drops it from either folder", () => {
    const state = reducePlansList(
      { filePaths: { current: ["a.md"], legacy: ["old.md"] }, loading: false, loadFailed: false },
      { type: "plan-removed", filePath: "old.md" },
    );
    expect(state.filePaths).toEqual({ current: ["a.md"], legacy: [] });
  });

  test("without a workspace path the section is unavailable", () => {
    const state = reducePlansList(initialPlansListState(false), { type: "no-workspace" });
    expect(resolvePlansListView({ hasWorkspacePath: false, loading: state.loading, loadFailed: false, entryCount: 0 })).toBe("unavailable");
  });
});

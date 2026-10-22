import { describe, expect, test } from "bun:test";
import {
  initialPlansListState,
  reducePlansList,
  resolvePlansListView,
  selectPlansListRows,
  shouldOfferPlansSearch,
  type PlansListState,
} from "@/components/layout/workspace-plans-list-state";
import { buildWorkspacePlanListEntries, MAX_WORKSPACE_PLANS } from "@/lib/plans";

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

/** Twelve documents, newest first, as `buildWorkspacePlanListEntries` returns them uncut. */
const TWELVE = buildWorkspacePlanListEntries({
  currentFilePaths: [
    ...Array.from({ length: 10 }, (_, index) =>
      `.stave/context/plans/task00${String(index + 1).padStart(2, "0")}_2026-04-${String(index + 3).padStart(2, "0")}T01-00-00.md`),
    ".stave/context/plans/Billing-Retry-Design.md",
  ],
  legacyFilePaths: [".stave/plans/0b91ff2c_2026-04-01T01-00-00.md"],
  maxEntries: Number.POSITIVE_INFINITY,
});

describe("Plans list rows", () => {
  test("the uncut list keeps every document, newest first", () => {
    expect(TWELVE).toHaveLength(12);
    // A document named for its content has no time in its name, so it sorts after the timed ones.
    expect(TWELVE.at(-1)?.label).toBe("Billing-Retry-Design");
  });

  test("the ten most recent by default, with the total and how many the cut leaves out", () => {
    const view = selectPlansListRows({ entries: TWELVE, query: "", showAll: false });
    expect(view.rows).toHaveLength(MAX_WORKSPACE_PLANS);
    expect(view.rows).toEqual(TWELVE.slice(0, MAX_WORKSPACE_PLANS));
    expect(view).toMatchObject({ total: 12, hidden: 2, searching: false });
  });

  test("show all reaches the eleventh and twelfth documents", () => {
    const view = selectPlansListRows({ entries: TWELVE, query: "", showAll: true });
    expect(view.rows).toEqual(TWELVE);
    expect(view).toMatchObject({ total: 12, hidden: 0 });
  });

  test("search covers every document, not just the recent ten", () => {
    const view = selectPlansListRows({ entries: TWELVE, query: "retry", showAll: false });
    expect(view.rows.map((entry) => entry.label)).toEqual(["Billing-Retry-Design"]);
    expect(view).toMatchObject({ total: 12, matched: 1, searching: true, hidden: 0 });
  });

  test("every word must appear, in any case, in the name, file name or task reference", () => {
    const labels = (query: string) => selectPlansListRows({ entries: TWELVE, query, showAll: false }).rows.map((entry) => entry.filePath);
    expect(labels("  BILLING   design ")).toEqual([".stave/context/plans/Billing-Retry-Design.md"]);
    expect(labels("billing invoice")).toEqual([]);
    // A task reference, and the time that names a task document.
    expect(labels("0b91ff2c")).toEqual([".stave/plans/0b91ff2c_2026-04-01T01-00-00.md"]);
    expect(labels("2026-04-12")).toEqual([".stave/context/plans/task0010_2026-04-12T01-00-00.md"]);
  });

  test("a query with no match draws nothing and says so through matched", () => {
    const view = selectPlansListRows({ entries: TWELVE, query: "zzz", showAll: true });
    expect(view.rows).toEqual([]);
    expect(view).toMatchObject({ total: 12, matched: 0, searching: true });
  });

  test("ten or fewer documents need no search until a query is typed", () => {
    expect(shouldOfferPlansSearch({ total: 10, query: "" })).toBe(false);
    expect(shouldOfferPlansSearch({ total: 11, query: "" })).toBe(true);
    expect(shouldOfferPlansSearch({ total: 3, query: "retry" })).toBe(true);
    expect(shouldOfferPlansSearch({ total: 3, query: "   " })).toBe(false);
  });
});

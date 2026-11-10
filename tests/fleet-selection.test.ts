import { describe, expect, test } from "bun:test";
import { reconcileFleetSelection, selectAllFleetItems, toggleFleetSelection, type FleetSelection } from "../src/lib/fleet/selection";
import { groupFleetTaskRows } from "../src/lib/fleet/status-groups";
import type { FleetTaskRow } from "../src/lib/fleet/task-rows";
import { useFleetSelectionStore } from "../src/store/fleet-selection-store";
const empty = (): FleetSelection => ({ selectedKeys: new Set(), anchor: null });

describe("Fleet selection visible order", () => {
  test("range follows sorted visible rows in either direction", () => {
    const state = toggleFleetSelection(empty(), "c", ["a", "b", "c", "d"]);
    const result = toggleFleetSelection(state, "a", ["a", "b", "c", "d"], true);
    expect([...result.selectedKeys]).toEqual(["c", "a", "b"]);
    expect(result.anchor).toBe("c");
    const reordered = toggleFleetSelection(state, "a", ["c", "d", "b", "a"], true);
    expect([...reordered.selectedKeys]).toEqual(["c", "d", "b", "a"]);
  });
  test("filters preserve remaining selection and discard invisible anchor", () => {
    const state = { selectedKeys: new Set(["a", "b", "c"]), anchor: "a" };
    const result = reconcileFleetSelection(state, ["c", "b", "d"]);
    expect([...result.selectedKeys]).toEqual(["b", "c"]);
    expect(result.anchor).toBeNull();
    expect([...reconcileFleetSelection(result, ["a", "b", "c", "d"]).selectedKeys]).toEqual(["b", "c"]);
  });
  test("select all only admits visible keys and ignores absent click targets", () => {
    expect([...selectAllFleetItems(["b", "d"]).selectedKeys]).toEqual(["b", "d"]);
    const state = empty();
    expect(toggleFleetSelection(state, "a", ["b"])).toBe(state);
  });
  test("one store merges card scopes and group toggles only registered rows", () => {
    useFleetSelectionStore.setState({ selectedKeys: new Set(), anchor: null, scopes: new Map(), visibleTargets: [] });
    const item = (key: string) => ({ key, repositoryPath: "/tmp/repo", workspaceId: "workspace", taskId: key });
    const store = useFleetSelectionStore.getState();
    store.setRows("one", [item("a"), item("b")]);
    store.setRows("two", [item("c")]);
    store.selectGroup(["a", "c", "missing"]);
    expect([...useFleetSelectionStore.getState().selectedKeys]).toEqual(["a", "c"]);
    store.setRows("one", [item("b")]);
    expect([...useFleetSelectionStore.getState().selectedKeys]).toEqual(["c"]);
    store.selectAll();
    expect([...useFleetSelectionStore.getState().selectedKeys]).toEqual(["b", "c"]);
    store.removeScope("two");
    expect([...useFleetSelectionStore.getState().selectedKeys]).toEqual(["b"]);
    store.clear();
  });
});

test("status grouping conserves rows in priority order and repository grouping retains order", () => {
  const row = (key: string, lane: FleetTaskRow["rank"]["lane"], overrides: Partial<FleetTaskRow> = {}) => ({
    key, repositoryPath: key === "idle" ? "/tmp/second" : "/tmp/first", repositoryName: "Repository", task: { id: key, unread: false },
    activeTurnId: null, rank: { lane }, ...overrides,
  } as FleetTaskRow);
  const rows = [row("idle", "idle"), row("ended", "idle", { task: { id: "ended", archivedAt: "2026-11-16" } as FleetTaskRow["task"] }), row("review", "in-review"), row("working", "in-progress"), row("needs", "action-required")];
  expect(groupFleetTaskRows(rows, "status").map((group) => group.id)).toEqual(["needsYou", "working", "review", "idle", "ended"]);
  expect(groupFleetTaskRows(rows, "status").flatMap((group) => group.rows).length).toBe(rows.length);
  expect(groupFleetTaskRows(rows, "repository")[0]?.rows.map((item) => item.key)).toEqual(["idle"]);
  expect(groupFleetTaskRows(rows, "default")[0]?.rows).toBe(rows);
});

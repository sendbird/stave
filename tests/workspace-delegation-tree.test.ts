import { describe, expect, test } from "bun:test";
import {
  buildDelegatedWorkspaceTree,
  flattenDelegatedWorkspaceTree,
  listDelegatedDescendants,
  MAX_DELEGATED_WORKSPACE_INDENT,
  type DelegatedWorkspaceLink,
} from "@/lib/workspace-delegation-tree";
import { delegationWorkState, topLevelReorderSteps } from "@/components/layout/workspace-sidebar-nesting";

function link(child: string, parent: string, phase: DelegatedWorkspaceLink["phase"] = "running", createdAt = "2026-11-01T00:00:00.000Z"): DelegatedWorkspaceLink {
  return { childWorkspaceId: child, parentWorkspaceId: parent, parentTaskId: `task-${parent}`, childTaskId: `task-${child}`, phase, runId: `child-task:task-${parent}:${child}`, createdAt };
}
const items = (...ids: string[]) => ids.map((id) => ({ id }));
const shape = (entries: ReturnType<typeof flattenDelegatedWorkspaceTree<{ id: string }>>) =>
  entries.map((entry) => `${"  ".repeat(entry.depth)}${entry.item.id}${entry.descendantCount ? ` (${entry.descendantCount}${entry.collapsed ? ", collapsed" : ""})` : ""}`);

describe("delegated workspace nesting", () => {
  test("a child nests under its parent, after it, in the listed order", () => {
    const listed = items("default", "child-b", "parent", "other", "child-a");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [link("child-a", "parent"), link("child-b", "parent")] });
    expect(shape(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: {} }))).toEqual([
      "default", "parent (2)", "  child-b", "  child-a", "other",
    ]);
  });

  test("a grandchild nests under its own parent and the parent counts every nested row", () => {
    const listed = items("parent", "child", "grandchild", "great");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [link("child", "parent"), link("grandchild", "child"), link("great", "grandchild")] });
    const entries = flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: {} });
    expect(shape(entries)).toEqual(["parent (3)", "  child (2)", "    grandchild (1)", "      great"]);
    // Depth stays exact; indentation stops at the bound so deep chains stay readable.
    expect(entries.map((entry) => [entry.depth, entry.indent])).toEqual([[0, 0], [1, 1], [2, 2], [3, MAX_DELEGATED_WORKSPACE_INDENT]]);
    expect(entries.map((entry) => entry.parentId)).toEqual([null, "parent", "child", "grandchild"]);
    expect(entries[1]!.link?.phase).toBe("running");
    expect(entries[0]!.link).toBeNull();
  });

  test("collapsing a parent hides every row nested under it and keeps its count", () => {
    const listed = items("parent", "child", "grandchild", "other");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [link("child", "parent"), link("grandchild", "child")] });
    expect(shape(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: { parent: true } }))).toEqual(["parent (2, collapsed)", "other"]);
    expect(shape(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: { child: true } }))).toEqual(["parent (2)", "  child (1, collapsed)", "other"]);
    // A collapse flag on a row with nothing under it changes nothing.
    expect(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: { other: true } }).at(-1)!.collapsed).toBe(false);
  });

  test("an orphan (parent archived, deleted or in another repository) stays top-level", () => {
    // The ledger query already drops archived parents; a parent missing from this list is treated the same.
    const listed = items("default", "child");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [link("child", "archived-parent")] });
    expect(tree.parentById.size).toBe(0);
    expect(shape(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: {} }))).toEqual(["default", "child"]);
  });

  test("a detached delegation has no link, so its workspace is an ordinary top-level row", () => {
    // `listDelegatedWorkspaceLinks` leaves detached delegations out (see delegated-workspace-links.test.ts).
    const listed = items("parent", "released");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [] });
    expect(shape(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: {} }))).toEqual(["parent", "released"]);
  });

  test("a search that hides the parent shows the child top-level", () => {
    const all = items("parent", "child");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: all.map((item) => item.id), links: [link("child", "parent")] });
    expect(shape(flattenDelegatedWorkspaceTree({ items: items("child"), tree, collapsedById: {} }))).toEqual(["child"]);
  });

  test("the oldest link wins and a cycle is ignored", () => {
    const listed = items("a", "b", "c");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [link("b", "a"), link("b", "c"), link("a", "b"), link("c", "c")] });
    expect([...tree.parentById]).toEqual([["b", "a"]]);
    expect(shape(flattenDelegatedWorkspaceTree({ items: listed, tree, collapsedById: {} }))).toEqual(["a (1)", "  b", "c"]);
  });

  test("descendants list nearest first, so archiving reverses them to go deepest first", () => {
    const listed = items("parent", "child-1", "child-2", "grandchild");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: listed.map((item) => item.id), links: [link("child-1", "parent"), link("child-2", "parent"), link("grandchild", "child-1")] });
    expect(listDelegatedDescendants(tree, "parent")).toEqual(["child-1", "child-2", "grandchild"]);
    expect(listDelegatedDescendants(tree, "child-2")).toEqual([]);
  });

  test("keyboard reorder passes the neighbouring top-level row, not a nested one", () => {
    // Registry order interleaves a nested row between two top-level rows.
    const workspaces = items("default", "parent", "child", "other");
    const tree = buildDelegatedWorkspaceTree({ workspaceIds: workspaces.map((item) => item.id), links: [link("child", "parent")] });
    const entries = flattenDelegatedWorkspaceTree({ items: workspaces.map((item) => ({ ...item, name: item.id, isDefault: item.id === "default" })), tree, collapsedById: {} });
    expect(topLevelReorderSteps({ entries, workspaces, workspaceId: "other", direction: "up" })).toEqual({ steps: 2, position: 2, total: 3 });
    expect(topLevelReorderSteps({ entries, workspaces, workspaceId: "parent", direction: "down" })).toEqual({ steps: 2, position: 3, total: 3 });
    expect(topLevelReorderSteps({ entries, workspaces, workspaceId: "default", direction: "up" })).toBeNull();
  });

  test("a delegation phase maps onto the shared work states", () => {
    expect(["pending", "running", "waiting", "completed", "failed", "cancelled", "interrupted"].map((phase) => delegationWorkState(phase as DelegatedWorkspaceLink["phase"])))
      .toEqual(["queued", "working", "waiting", "ready", "failed", "stopped", "halted"]);
    expect(delegationWorkState(undefined)).toBeUndefined();
  });
});

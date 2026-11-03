import { describe, expect, test } from "bun:test";
import {
  countWorkGraphDescendants,
  countWorkGraphRows,
  nestWorkGraphTreeRows,
  type WorkGraphTreeRow,
} from "@/lib/work-graph/work-graph-tree";
import type { AgentNode } from "@/lib/work-graph/work-graph.types";

function row(key: string, depth: number, overrides: Partial<AgentNode> = {}, blocked = false): WorkGraphTreeRow {
  return {
    key,
    depth,
    blocked,
    hasChildren: false,
    workItemIds: [],
    node: {
      key,
      identitySource: "provider",
      parentKey: null,
      label: key,
      status: "running",
      startedAt: 0,
      updatedAt: 0,
      progress: [],
      ...overrides,
    },
  };
}

describe("agent tree branches", () => {
  test("nests depth-first rows under the row above them", () => {
    const branches = nestWorkGraphTreeRows(
      [row("a", 0), row("a1", 1), row("a1x", 2), row("a2", 1), row("b", 0)],
      (entry) => entry.key.toUpperCase(),
    );

    expect(branches.map((branch) => branch.id)).toEqual(["a", "b"]);
    expect(branches[0]!.label).toBe("A");
    expect(branches[0]!.children?.map((child) => child.id)).toEqual(["a1", "a2"]);
    expect(branches[0]!.children?.[0]!.children?.map((child) => child.id)).toEqual(["a1x"]);
    expect(branches[1]!.children).toBeUndefined();
    // The fold names everything it hides, not only the first level.
    expect(countWorkGraphDescendants(branches[0]!)).toBe(3);
    expect(countWorkGraphDescendants(branches[1]!)).toBe(0);
  });

  test("a row whose parent was filtered out attaches to the nearest open ancestor", () => {
    const branches = nestWorkGraphTreeRows([row("a", 0), row("deep", 3)], (entry) => entry.key);

    expect(branches.map((branch) => branch.id)).toEqual(["a"]);
    expect(branches[0]!.children?.map((child) => child.id)).toEqual(["deep"]);
  });

  test("counts a blocked row only as needing a person", () => {
    expect(
      countWorkGraphRows([
        row("live", 0),
        row("blocked", 0, {}, true),
        row("failed", 1, { status: "failed" }),
        row("done", 0, { status: "completed" }),
        row("stopped", 0, { status: "cancelled" }),
      ]),
    ).toEqual({ runningCount: 1, blockedCount: 1, failedCount: 1, completedCount: 2, maxDepth: 1 });
  });
});

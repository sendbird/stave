// src/lib/git-graph/graph-layout.test.ts
import { describe, expect, it } from "bun:test";
import { buildGraphLayout } from "./graph-layout";
import type { GraphCommit } from "./types";

function commit(hash: string, parents: string[]): GraphCommit {
  return { hash, parents, author: "A", authorDate: "", subject: hash, refs: [] };
}

describe("buildGraphLayout", () => {
  it("places a linear history in a single lane", () => {
    const layout = buildGraphLayout([
      commit("c", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    expect(layout.laneCount).toBe(1);
    expect(layout.nodes.map((n) => n.lane)).toEqual([0, 0, 0]);
    expect(layout.nodes.map((n) => n.row)).toEqual([0, 1, 2]);
  });

  it("opens a second lane for a branch and collapses it at the merge", () => {
    // m (merge) -> parents [a, b]; a -> [base]; b -> [base]; base -> []
    const layout = buildGraphLayout([
      commit("m", ["a", "b"]),
      commit("a", ["base"]),
      commit("b", ["base"]),
      commit("base", []),
    ]);
    expect(layout.laneCount).toBeGreaterThanOrEqual(2);
    const m = layout.nodes.find((n) => n.hash === "m")!;
    const b = layout.nodes.find((n) => n.hash === "b")!;
    expect(m.lane).toBe(0);
    expect(b.lane).toBe(1);
    // base collapses back to lane 0
    expect(layout.nodes.find((n) => n.hash === "base")!.lane).toBe(0);
  });

  it("emits one edge per parent relationship", () => {
    const layout = buildGraphLayout([
      commit("m", ["a", "b"]),
      commit("a", ["base"]),
      commit("b", ["base"]),
      commit("base", []),
    ]);
    // m->a, m->b, a->base, b->base = 4 edges
    expect(layout.edges).toHaveLength(4);
  });

  it("returns empty layout for empty input", () => {
    expect(buildGraphLayout([])).toEqual({ nodes: [], edges: [], laneCount: 0 });
  });
});

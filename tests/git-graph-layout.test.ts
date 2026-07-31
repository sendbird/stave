import { describe, expect, it } from "bun:test";
import { buildGraphLayout } from "@/lib/git-graph/graph-layout";
import type { GraphCommit } from "@/lib/git-graph/types";

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

  it("keeps the trunk in lane 0 when a feature branch reserves the fork parent first", () => {
    // newest-first: t2 (trunk tip) -> t1, f1 (feature) -> t0, t1 -> t0, t0 (root)
    const layout = buildGraphLayout([
      commit("t2", ["t1"]),
      commit("f1", ["t0"]),
      commit("t1", ["t0"]),
      commit("t0", []),
    ]);
    const byHash = new Map(layout.nodes.map((n) => [n.hash, n]));
    expect(byHash.get("t2")!.lane).toBe(0);
    expect(byHash.get("t1")!.lane).toBe(0);
    expect(byHash.get("t0")!.lane).toBe(0); // trunk must not zigzag into lane 1
    expect(byHash.get("f1")!.lane).toBe(1);
    // f1's edge travels in its own lane until the fork point
    const f1Edge = layout.edges.find((e) => e.fromRow === byHash.get("f1")!.row)!;
    expect(f1Edge.toLane).toBe(1);
    expect(f1Edge.toHash).toBe("t0");
  });

  it("emits toHash for every edge", () => {
    const layout = buildGraphLayout([
      commit("m", ["a", "b"]),
      commit("a", ["base"]),
      commit("b", ["base"]),
      commit("base", []),
    ]);
    expect(layout.edges.map((e) => e.toHash).sort()).toEqual([
      "a",
      "b",
      "base",
      "base",
    ]);
  });

  it("fans an octopus merge out to distinct travel lanes", () => {
    const layout = buildGraphLayout([
      commit("m", ["a", "b", "c"]),
      commit("a", []),
      commit("b", []),
      commit("c", []),
    ]);
    const mergeEdges = layout.edges.filter((e) => e.fromRow === 0);
    expect(mergeEdges.map((e) => e.toLane)).toEqual([0, 1, 2]);
    expect(layout.laneCount).toBe(3);
  });

  it("merges into an existing line when the second parent is already reserved", () => {
    const layout = buildGraphLayout([
      commit("a", ["p"]),
      commit("m", ["q", "p"]),
      commit("q", []),
      commit("p", []),
    ]);
    const mergeEdge = layout.edges.find(
      (e) => e.toHash === "p" && e.fromRow === 1,
    )!;
    expect(mergeEdge.fromLane).toBe(1);
    expect(mergeEdge.toLane).toBe(0); // joins the line a -> p already in lane 0
  });

  it("keeps an off-window parent's lane reserved and sizes laneCount by max index", () => {
    const layout = buildGraphLayout([
      commit("x", ["missing"]),
      commit("y", []),
    ]);
    const x = layout.nodes.find((n) => n.hash === "x")!;
    const y = layout.nodes.find((n) => n.hash === "y")!;
    expect(x.lane).toBe(0);
    // lane 0 is still reserved for "missing", so y must open lane 1 …
    expect(y.lane).toBe(1);
    expect(layout.edges[0]!.toHash).toBe("missing");
    // … and laneCount must cover lane index 1 even though only 1 lane is
    // occupied at that row (old code returned 1 here — the width bug).
    expect(layout.laneCount).toBe(2);
  });
});

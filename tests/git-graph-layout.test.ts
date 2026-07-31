import { describe, expect, it } from "bun:test";
import { buildGraphLayout } from "@/lib/git-graph/graph-layout";
import type { GraphCommit } from "@/lib/git-graph/types";

function commit(hash: string, parents: string[]): GraphCommit {
  return {
    hash,
    parents,
    author: "A",
    authorEmail: "",
    authorDate: "",
    committerDate: "",
    subject: hash,
    refs: [],
  };
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
    expect(buildGraphLayout([])).toEqual({
      nodes: [],
      edges: [],
      branches: [],
      laneCount: 0,
    });
  });

  it("keeps branch identity separate from the physical lane", () => {
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
    expect(byHash.get("t0")!.lane).toBe(0);
    expect(byHash.get("f1")!.lane).toBe(1);
    expect(byHash.get("f1")!.color).toBe(1);
    // The feature connector joins the physical lane of its parent without
    // changing the connector branch's colour.
    const f1Edge = layout.edges.find(
      (e) => e.fromRow === byHash.get("f1")!.row,
    )!;
    expect(f1Edge.toLane).toBe(0);
    expect(f1Edge.toHash).toBe("t0");
    expect(f1Edge.color).toBe(1);
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

  it("packs octopus parents into row-local connection points", () => {
    const layout = buildGraphLayout([
      commit("m", ["a", "b", "c"]),
      commit("a", []),
      commit("b", []),
      commit("c", []),
    ]);
    const mergeEdges = layout.edges.filter((e) => e.fromRow === 0);
    expect(mergeEdges.map((e) => e.toLane)).toEqual([0, 0, 0]);
    expect(mergeEdges.map((e) => e.color)).toEqual([0, 1, 2]);
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

  it("reserves an orphan root branch through the loaded window", () => {
    const layout = buildGraphLayout([
      commit("orphan", []),
      commit("tip", ["base"]),
      commit("base", []),
    ]);

    expect(layout.nodes.map((node) => node.lane)).toEqual([0, 1, 1]);
    expect(layout.branches[0]?.segments).toEqual([
      {
        fromRow: 0,
        fromLane: 0,
        toRow: 1,
        toLane: 0,
        lockedFirst: false,
        isCommitted: true,
      },
      {
        fromRow: 1,
        fromLane: 0,
        toRow: 2,
        toLane: 0,
        lockedFirst: false,
        isCommitted: true,
      },
    ]);
  });

  it("marks only the synthetic working-tree ancestry as uncommitted", () => {
    const layout = buildGraphLayout(
      [
        commit("working", ["head"]),
        commit("other", ["base"]),
        commit("head", ["base"]),
        commit("base", []),
      ],
      { uncommittedHash: "working" },
    );
    const segments = layout.branches.flatMap((branch) => branch.segments);
    expect(segments.some((segment) => !segment.isCommitted)).toBe(true);
    expect(segments.some((segment) => segment.isCommitted)).toBe(true);
    expect(
      segments
        .filter((segment) => !segment.isCommitted)
        .every((segment) => segment.fromRow < 2),
    ).toBe(true);
  });

  it("restores shared trunk segments to committed ancestry after a merge joins it", () => {
    const layout = buildGraphLayout(
      [
        commit("working", ["c3"]),
        commit("c1", ["c2", "c3"]),
        commit("c2", []),
        commit("c3", []),
      ],
      { uncommittedHash: "working" },
    );
    const trunk = layout.branches[0]?.segments;

    expect(trunk?.map((segment) => segment.isCommitted)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it("packs a synthetic history with overlapping branches and nested merges", () => {
    // This history is intentionally synthetic. It combines long-lived side
    // branches, sequential two-parent merges, an octopus merge, late joins,
    // and a branch created after an earlier colour becomes reusable.
    const topology: Array<[string, string[]]> = [
      ["tip", ["merge-release"]],
      ["experiment-2", ["experiment-1"]],
      ["merge-release", ["main-7", "release-2"]],
      ["docs-2", ["docs-1"]],
      ["main-7", ["merge-hotfix"]],
      ["release-2", ["release-1"]],
      ["merge-hotfix", ["main-6", "hotfix-2"]],
      ["feature-c-2", ["feature-c-1"]],
      ["main-6", ["merge-feature-b"]],
      ["hotfix-2", ["hotfix-1"]],
      ["merge-feature-b", ["main-5", "feature-b-3"]],
      ["release-1", ["release-base"]],
      ["experiment-1", ["experiment-base"]],
      ["feature-c-1", ["feature-c-base"]],
      ["main-5", ["merge-octopus"]],
      ["feature-b-3", ["feature-b-2"]],
      ["hotfix-1", ["hotfix-base"]],
      ["merge-octopus", ["main-4", "qa-2", "tooling-2"]],
      ["release-base", ["main-4"]],
      ["feature-b-2", ["feature-b-1"]],
      ["qa-2", ["qa-1"]],
      ["tooling-2", ["tooling-1"]],
      ["feature-b-1", ["feature-b-base"]],
      ["main-4", ["merge-feature-a"]],
      ["feature-b-base", ["main-3"]],
      ["qa-1", ["qa-base"]],
      ["tooling-1", ["tooling-base"]],
      ["merge-feature-a", ["main-3", "feature-a-2"]],
      ["docs-1", ["docs-base"]],
      ["hotfix-base", ["main-3"]],
      ["feature-c-base", ["main-3"]],
      ["experiment-base", ["main-2"]],
      ["qa-base", ["main-2"]],
      ["tooling-base", ["main-2"]],
      ["feature-a-2", ["feature-a-1"]],
      ["main-3", ["main-2"]],
      ["docs-base", ["main-2"]],
      ["feature-a-1", ["feature-a-base"]],
      ["feature-a-base", ["main-2"]],
      ["main-2", ["main-1"]],
      ["main-1", ["root"]],
      ["root", []],
    ];
    const commits = topology.map(([hash, parents]) => commit(hash, parents));
    const layout = buildGraphLayout(commits);

    expect(layout.laneCount).toBe(9);
    expect(
      layout.nodes.map((node) => [node.hash, node.lane, node.color]),
    ).toEqual([
      ["tip", 0, 0],
      ["experiment-2", 1, 1],
      ["merge-release", 0, 0],
      ["docs-2", 3, 3],
      ["main-7", 0, 0],
      ["release-2", 2, 2],
      ["merge-hotfix", 0, 0],
      ["feature-c-2", 5, 5],
      ["main-6", 0, 0],
      ["hotfix-2", 4, 4],
      ["merge-feature-b", 0, 0],
      ["release-1", 2, 2],
      ["experiment-1", 1, 1],
      ["feature-c-1", 5, 5],
      ["main-5", 0, 0],
      ["feature-b-3", 6, 6],
      ["hotfix-1", 4, 4],
      ["merge-octopus", 0, 0],
      ["release-base", 2, 2],
      ["feature-b-2", 6, 6],
      ["qa-2", 7, 7],
      ["tooling-2", 8, 8],
      ["feature-b-1", 6, 6],
      ["main-4", 0, 0],
      ["feature-b-base", 5, 6],
      ["qa-1", 6, 7],
      ["tooling-1", 7, 8],
      ["merge-feature-a", 0, 0],
      ["docs-1", 2, 3],
      ["hotfix-base", 3, 4],
      ["feature-c-base", 4, 5],
      ["experiment-base", 1, 1],
      ["qa-base", 6, 7],
      ["tooling-base", 7, 8],
      ["feature-a-2", 8, 2],
      ["main-3", 0, 0],
      ["docs-base", 2, 3],
      ["feature-a-1", 5, 2],
      ["feature-a-base", 5, 2],
      ["main-2", 0, 0],
      ["main-1", 0, 0],
      ["root", 0, 0],
    ]);
    expect(layout.branches.map((branch) => branch.color)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 2,
    ]);
    expect(layout.branches).toHaveLength(10);

    const byHash = new Map(layout.nodes.map((node) => [node.hash, node]));
    const octopusRow = byHash.get("merge-octopus")?.row;
    expect(
      layout.edges
        .filter((edge) => edge.fromRow === octopusRow)
        .map((edge) => [edge.toHash, edge.toLane, edge.color]),
    ).toEqual([
      ["main-4", 0, 0],
      ["qa-2", 7, 7],
      ["tooling-2", 8, 8],
    ]);

    expect(
      layout.branches[0]?.segments.every(
        (segment) => segment.fromLane === 0 && segment.toLane === 0,
      ),
    ).toBe(true);
    expect(layout.branches[7]?.segments).toContainEqual({
      fromRow: 17,
      fromLane: 0,
      toRow: 18,
      toLane: 7,
      lockedFirst: true,
      isCommitted: true,
    });
    expect(layout.branches[8]?.segments).toContainEqual({
      fromRow: 17,
      fromLane: 0,
      toRow: 18,
      toLane: 8,
      lockedFirst: true,
      isCommitted: true,
    });
    expect(layout.branches[9]?.segments).toContainEqual({
      fromRow: 27,
      fromLane: 0,
      toRow: 28,
      toLane: 8,
      lockedFirst: true,
      isCommitted: true,
    });
    expect(layout.branches[9]?.color).toBe(layout.branches[2]?.color);
  });
});

import { describe, expect, it } from "bun:test";
import { buildGraphBranchPaths, graphLaneX } from "@/lib/git-graph/edge-path";
import type { GraphSegment } from "@/lib/git-graph/types";

const GEOMETRY = { laneWidth: 14, rowHeight: 28 };

function segment(
  fromRow: number,
  fromLane: number,
  toRow: number,
  toLane: number,
  isCommitted = true,
): GraphSegment {
  return {
    fromRow,
    fromLane,
    toRow,
    toLane,
    lockedFirst: fromLane < toLane,
    isCommitted,
  };
}

describe("buildGraphBranchPaths", () => {
  it("centres lane zero within the first lane-width cell", () => {
    expect(graphLaneX(0, 14)).toBe(7);
    expect(graphLaneX(2, 14)).toBe(35);
  });

  it("collapses consecutive vertical segments", () => {
    expect(
      buildGraphBranchPaths(
        [segment(0, 0, 1, 0), segment(1, 0, 2, 0)],
        GEOMETRY,
      ),
    ).toEqual([{ d: "M 7 14 L 7 70", isCommitted: true }]);
  });

  it("uses Git Graph's 0.8-row rounded transition geometry", () => {
    expect(buildGraphBranchPaths([segment(0, 0, 1, 1)], GEOMETRY)).toEqual([
      {
        d: "M 7 14 C 7 36.4, 21 19.6, 21 42",
        isCommitted: true,
      },
    ]);
  });

  it("keeps merge connectors in one path so shadows stay behind the branch", () => {
    expect(
      buildGraphBranchPaths(
        [
          segment(0, 0, 1, 0),
          segment(1, 0, 2, 0),
          segment(0, 2, 1, 1),
          segment(1, 1, 2, 0),
        ],
        GEOMETRY,
      ),
    ).toEqual([
      {
        d: "M 7 14 L 7 70 M 35 14 C 35 36.4, 21 19.6, 21 42 C 21 64.4, 7 47.6, 7 70",
        isCommitted: true,
      },
    ]);
  });

  it("splits the uncommitted portion before the committed ancestry", () => {
    expect(
      buildGraphBranchPaths(
        [segment(0, 0, 1, 0, false), segment(1, 0, 2, 0, true)],
        GEOMETRY,
      ),
    ).toEqual([
      { d: "M 7 14 L 7 42", isCommitted: false },
      { d: "M 7 42 L 7 70", isCommitted: true },
    ]);
  });
});

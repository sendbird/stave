import { describe, expect, it } from "bun:test";
import {
  buildEdgePath,
  buildUnresolvedEdgePath,
} from "@/lib/git-graph/edge-path";

// LANE_WIDTH = 14, ROW_HEIGHT = 28 → lane x centers: 7, 21, 35 …; row y centers: 14, 42, 70, 98 …
const GEOM = { laneWidth: 14, rowHeight: 28 };

describe("buildEdgePath", () => {
  it("draws a straight vertical line when all lanes match", () => {
    const d = buildEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 0,
      toLane: 0,
      toRow: 3,
    });
    expect(d).toBe("M 7 14 L 7 98");
  });

  it("confines a merge fan-out bend to the first row, then runs vertical (top bend)", () => {
    const d = buildEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 1,
      toLane: 1,
      toRow: 3,
    });
    // bend ends at y=42 (one ROW_HEIGHT below the node), the rest is vertical
    expect(d).toBe("M 7 14 C 7 28, 21 28, 21 42 L 21 98");
  });

  it("confines a fork join bend to the last row (bottom bend)", () => {
    const d = buildEdgePath({
      ...GEOM,
      fromLane: 1,
      fromRow: 0,
      travelLane: 1,
      toLane: 0,
      toRow: 3,
    });
    // vertical until y=70 (one ROW_HEIGHT above the parent), then bend in
    expect(d).toBe("M 21 14 L 21 70 C 21 84, 7 84, 7 98");
  });

  it("draws both bends with no vertical segment when the span is exactly 2 rows", () => {
    const d = buildEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 2,
      toLane: 1,
      toRow: 2,
    });
    expect(d).toBe("M 7 14 C 7 28, 35 28, 35 42 C 35 56, 21 56, 21 70");
  });

  it("falls back to a single bend for a 1-row edge that would need two bends", () => {
    const d = buildEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 2,
      toLane: 1,
      toRow: 1,
    });
    expect(d).toBe("M 7 14 C 7 28, 21 28, 21 42");
  });

  it("draws a plain 1-row bend for a single-lane change", () => {
    const d = buildEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 1,
      toLane: 1,
      toRow: 1,
    });
    expect(d).toBe("M 7 14 C 7 28, 21 28, 21 42");
  });
});

describe("buildUnresolvedEdgePath", () => {
  it("extends straight to the canvas bottom in the travel lane", () => {
    const d = buildUnresolvedEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 0,
      bottomY: 280,
    });
    expect(d).toBe("M 7 14 L 7 280");
  });

  it("bends into the travel lane first when it differs", () => {
    const d = buildUnresolvedEdgePath({
      ...GEOM,
      fromLane: 0,
      fromRow: 0,
      travelLane: 1,
      bottomY: 280,
    });
    expect(d).toBe("M 7 14 C 7 28, 21 28, 21 42 L 21 280");
  });
});

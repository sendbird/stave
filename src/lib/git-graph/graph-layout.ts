// src/lib/git-graph/graph-layout.ts
import type { GraphCommit, GraphEdge, GraphLayout, GraphNode } from "./types";

interface Lane {
  hash: string | null; // parent hash this lane is currently reserved for
  color: number;
}

function leftmostFreeLane(lanes: Lane[]): number {
  for (let i = 0; i < lanes.length; i += 1) {
    const lane = lanes[i];
    if (lane !== undefined && lane.hash === null) {
      return i;
    }
  }
  const newIndex = lanes.length;
  lanes.push({ hash: null, color: newIndex });
  return newIndex;
}

function getLane(lanes: Lane[], index: number): Lane {
  const lane = lanes[index];
  if (lane === undefined) {
    throw new Error(`Lane ${index} is out of bounds (lanes.length=${lanes.length})`);
  }
  return lane;
}

/**
 * Pure lane-layout algorithm (vscode-git-graph style line-following).
 *
 * Single forward pass over commits (newest-first, --date-order).
 *
 * Invariants:
 * - An edge's `toLane` is the lane the line TRAVELS in; that lane stays
 *   reserved for the parent hash until the parent's row, so no other node
 *   can be placed on the vertical segment.
 * - The FIRST parent always reserves the commit's own lane (never adopts an
 *   existing reservation in another lane). This keeps the trunk stable in
 *   lane 0 and lets branch lines run vertically until their fork point.
 * - Several lanes may be reserved for the same parent; at the parent's row
 *   the leftmost wins and the others collapse (their edges bend into the
 *   winner's lane over the final row — drawn by the canvas).
 * - laneCount = maxLaneIndex + 1 (holes included) so the SVG gutter is
 *   always wide enough.
 */
export function buildGraphLayout(commits: GraphCommit[]): GraphLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], laneCount: 0 };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lanes: Lane[] = [];
  let maxLaneIndex = 0;

  for (let row = 0; row < commits.length; row += 1) {
    const commit = commits[row];
    if (commit === undefined) continue;

    // 1. The commit lands on the leftmost lane reserved for its hash,
    //    else on the leftmost free lane.
    let lane = lanes.findIndex((l) => l.hash === commit.hash);
    if (lane === -1) {
      lane = leftmostFreeLane(lanes);
    }
    const color = getLane(lanes, lane).color;

    // 2. Collapse every OTHER lane reserved for this hash (fork-point join).
    for (let i = 0; i < lanes.length; i += 1) {
      const l = lanes[i];
      if (l !== undefined && i !== lane && l.hash === commit.hash) {
        lanes[i] = { hash: null, color: i };
      }
    }

    // 3. Clear the commit's own lane (re-reserved by the first parent below).
    lanes[lane] = { hash: null, color };

    nodes.push({ hash: commit.hash, row, lane, color });
    maxLaneIndex = Math.max(maxLaneIndex, lane);

    // 4. Reserve travel lanes for parents and emit edges.
    for (let pi = 0; pi < commit.parents.length; pi += 1) {
      const parentHash = commit.parents[pi];
      if (parentHash === undefined) continue;

      let travelLane: number;
      if (pi === 0) {
        // First parent ALWAYS travels in the commit's own lane, even when
        // another lane already reserved this parent (trunk stability).
        travelLane = lane;
        lanes[lane] = { hash: parentHash, color };
      } else {
        const existing = lanes.findIndex((l) => l.hash === parentHash);
        if (existing !== -1) {
          // Merge edge joins the line already heading to this parent.
          travelLane = existing;
        } else {
          travelLane = leftmostFreeLane(lanes);
          lanes[travelLane] = { hash: parentHash, color: travelLane };
        }
      }

      maxLaneIndex = Math.max(maxLaneIndex, travelLane);

      edges.push({
        fromRow: row,
        fromLane: lane,
        toLane: travelLane,
        toHash: parentHash,
        color: getLane(lanes, travelLane).color,
      });
    }
  }

  return { nodes, edges, laneCount: maxLaneIndex + 1 };
}

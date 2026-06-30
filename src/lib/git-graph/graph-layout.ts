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
 * Pure lane-layout algorithm.
 *
 * Single forward pass over commits (newest-first, --date-order).
 * Assigns each commit a lane + color and emits edges to parents.
 *
 * Algorithm:
 * - Maintain `lanes: Lane[]` where each slot holds the parent hash a lane is
 *   "waiting to place" (a child has reserved that lane for this parent).
 * - For each commit at `row`:
 *   1. Find the leftmost lane reserved for this commit's hash; if none, allocate
 *      the leftmost free lane. That is the commit's lane.
 *   2. The commit's color is the color assigned to that lane.
 *   3. Clear every OTHER lane also reserved for this hash (merge-target collapse).
 *   4. For each parent: the first parent reuses the commit's lane; additional
 *      parents take new leftmost-free lanes. Reserve those lanes for the parent
 *      hash, carrying the lane's color (new lanes get fresh color = lane index).
 *   5. Emit an edge from the commit to each parent's reserved lane.
 * - laneCount = max number of simultaneously occupied lanes across all rows.
 */
export function buildGraphLayout(commits: GraphCommit[]): GraphLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], laneCount: 0 };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lanes: Lane[] = [];
  let laneCount = 0;

  for (let row = 0; row < commits.length; row += 1) {
    const commit = commits[row];
    if (commit === undefined) continue;

    // Step 1: find the leftmost lane reserved for this commit, else allocate one.
    let lane = lanes.findIndex((l) => l.hash === commit.hash);
    if (lane === -1) {
      lane = leftmostFreeLane(lanes);
    }
    const color = getLane(lanes, lane).color;

    // Step 3: clear OTHER lanes also reserved for this hash (merge-target collapse).
    for (let i = 0; i < lanes.length; i += 1) {
      const l = lanes[i];
      if (l !== undefined && i !== lane && l.hash === commit.hash) {
        lanes[i] = { hash: null, color: i };
      }
    }

    // Clear the commit's own lane (will be re-reserved by parents below).
    lanes[lane] = { hash: null, color };

    nodes.push({ hash: commit.hash, row, lane, color });

    // Step 4: reserve lanes for parents.
    for (let pi = 0; pi < commit.parents.length; pi += 1) {
      const parentHash = commit.parents[pi];
      if (parentHash === undefined) continue;

      // If a lane is already reserved for this parent, keep it.
      const existing = lanes.findIndex((l) => l.hash === parentHash);
      let parentLane: number;

      if (existing !== -1) {
        parentLane = existing;
      } else if (pi === 0) {
        // First parent reuses the commit's lane.
        parentLane = lane;
        lanes[lane] = { hash: parentHash, color };
      } else {
        // Additional parents take new leftmost-free lanes.
        parentLane = leftmostFreeLane(lanes);
        lanes[parentLane] = { hash: parentHash, color: parentLane };
      }

      const parentLaneColor = getLane(lanes, parentLane).color;

      // Step 5: emit edge.
      edges.push({
        fromRow: row,
        fromLane: lane,
        toRow: row + 1, // visual hop placeholder; canvas resolves actual row by hash
        toLane: parentLane,
        color: parentLaneColor,
      });
    }

    // Measure occupied lanes AFTER reserving parents.
    const occupied = lanes.filter((l) => l.hash !== null).length;
    laneCount = Math.max(laneCount, occupied);
  }

  // Ensure at least 1 lane for non-empty input (e.g. single root commit with no parents).
  if (laneCount === 0 && commits.length > 0) {
    laneCount = 1;
  }

  return { nodes, edges, laneCount };
}

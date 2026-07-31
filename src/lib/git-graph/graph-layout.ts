import type {
  GraphBranch,
  GraphCommit,
  GraphEdge,
  GraphLayout,
  GraphNode,
  GraphSegment,
} from "./types";

interface ActiveLine {
  branch: GraphBranch;
  /** The next commit this line is waiting to reach. */
  targetHash: string | null;
  /** Lane occupied at the current visible row. */
  lane: number;
  /** Style used while the line crosses rows without reaching a commit. */
  isCommitted: boolean;
}

interface EdgeDraft {
  fromRow: number;
  fromLane: number;
  toHash: string;
  branchId: number;
  color: number;
}

interface ConnectorDraft {
  line: ActiveLine;
  fromLane: number;
  isCommitted: boolean;
}

export interface BuildGraphLayoutOptions {
  /**
   * Synthetic commit used by the renderer for uncommitted changes. Segments
   * leaving this vertex are rendered with the uncommitted line style.
   */
  uncommittedHash?: string;
}

function firstAvailableColor(lines: ActiveLine[]): number {
  const occupied = new Set(lines.map((line) => line.branch.color));
  let color = 0;
  while (occupied.has(color)) {
    color += 1;
  }
  return color;
}

function addBranch(
  branches: GraphBranch[],
  activeLines: ActiveLine[],
  targetHash: string | null,
  lane: number,
  isCommitted: boolean,
): ActiveLine {
  const branch: GraphBranch = {
    id: branches.length,
    color: firstAvailableColor(activeLines),
    segments: [],
  };
  branches.push(branch);
  return { branch, targetHash, lane, isCommitted };
}

function segment(
  fromRow: number,
  fromLane: number,
  toLane: number,
  lockedFirst: boolean,
  isCommitted: boolean,
): GraphSegment {
  return {
    fromRow,
    fromLane,
    toRow: fromRow + 1,
    toLane,
    lockedFirst,
    isCommitted,
  };
}

/**
 * Lay out newest-first commits as a set of logical branches and row-sized
 * drawing segments.
 *
 * Active lines reserve lanes until their target commit is reached, including
 * targets outside the loaded page. When several lines reach the same commit,
 * they converge on the left-most reserved lane and the remaining lanes are
 * compacted on the following row.
 *
 * Input follows the graph-log contract: hashes are unique, and commits are in
 * newest-first order with each loaded child preceding its loaded parents.
 */
export function buildGraphLayout(
  commits: GraphCommit[],
  options: BuildGraphLayoutOptions = {},
): GraphLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], branches: [], laneCount: 0 };
  }

  const nodes: GraphNode[] = [];
  const branches: GraphBranch[] = [];
  const edgeDrafts: EdgeDraft[] = [];
  const nodeByHash = new Map<string, GraphNode>();
  const lastLaneByBranch = new Map<number, number>();
  let activeLines: ActiveLine[] = [];
  let laneCount = 0;

  for (let row = 0; row < commits.length; row += 1) {
    const commit = commits[row]!;
    const sourceIsCommitted = commit.hash !== options.uncommittedHash;
    const matchingLines = activeLines.filter(
      (line) => line.targetHash === commit.hash,
    );

    let lineWasCreatedForCommit = false;
    let commitLine = matchingLines[0];
    if (!commitLine) {
      commitLine = addBranch(
        branches,
        activeLines,
        null,
        activeLines.length,
        sourceIsCommitted,
      );
      activeLines.push(commitLine);
      lineWasCreatedForCommit = true;
    }

    const node: GraphNode = {
      hash: commit.hash,
      row,
      lane: commitLine.lane,
      color: commitLine.branch.color,
    };
    nodes.push(node);
    if (!nodeByHash.has(commit.hash)) {
      nodeByHash.set(commit.hash, node);
    }
    lastLaneByBranch.set(commitLine.branch.id, node.lane);
    laneCount = Math.max(laneCount, activeLines.length, node.lane + 1);

    const linesEndingHere = new Set<ActiveLine>();
    for (const matchedLine of matchingLines) {
      if (matchedLine !== commitLine) {
        linesEndingHere.add(matchedLine);
      }
    }

    if (commit.parents.length === 0) {
      commitLine.targetHash = null;
      // A root reached by an existing ancestry line closes that line. A root
      // discovered on its own has no known lower boundary, so it reserves its
      // lane through the rest of the loaded window.
      if (!lineWasCreatedForCommit) {
        linesEndingHere.add(commitLine);
      }
    } else {
      commitLine.targetHash = commit.parents[0]!;
      commitLine.isCommitted = sourceIsCommitted;
      edgeDrafts.push({
        fromRow: row,
        fromLane: node.lane,
        toHash: commit.parents[0]!,
        branchId: commitLine.branch.id,
        color: commitLine.branch.color,
      });
    }

    const nextLines = activeLines.filter((line) => !linesEndingHere.has(line));
    const linesStartingAtNode = new Set<ActiveLine>();
    const connectors: ConnectorDraft[] = [];
    const restoreCommittedAfterRow = new Set<ActiveLine>();

    for (
      let parentIndex = 1;
      parentIndex < commit.parents.length;
      parentIndex += 1
    ) {
      const parentHash = commit.parents[parentIndex]!;
      let parentLine = nextLines.find((line) => line.targetHash === parentHash);

      if (!parentLine) {
        parentLine = addBranch(
          branches,
          nextLines,
          parentHash,
          node.lane,
          sourceIsCommitted,
        );
        nextLines.push(parentLine);
        linesStartingAtNode.add(parentLine);
        lastLaneByBranch.set(parentLine.branch.id, node.lane);
      } else {
        connectors.push({
          line: parentLine,
          fromLane: node.lane,
          isCommitted: sourceIsCommitted,
        });
        if (sourceIsCommitted) {
          restoreCommittedAfterRow.add(parentLine);
        }
      }

      edgeDrafts.push({
        fromRow: row,
        fromLane: node.lane,
        toHash: parentHash,
        branchId: parentLine.branch.id,
        color: parentLine.branch.color,
      });
    }

    laneCount = Math.max(laneCount, nextLines.length);

    if (row + 1 < commits.length) {
      const nextHash = commits[row + 1]!.hash;
      const firstNextMatch = nextLines.findIndex(
        (line) => line.targetHash === nextHash,
      );
      const destinationByLine = new Map<ActiveLine, number>();

      for (let index = 0; index < nextLines.length; index += 1) {
        const line = nextLines[index]!;
        const toLane =
          firstNextMatch !== -1 && line.targetHash === nextHash
            ? firstNextMatch
            : index;
        destinationByLine.set(line, toLane);
        line.branch.segments.push(
          segment(
            row,
            line.lane,
            toLane,
            linesStartingAtNode.has(line),
            line.isCommitted,
          ),
        );
        line.lane = toLane;
        lastLaneByBranch.set(line.branch.id, toLane);
        laneCount = Math.max(laneCount, line.lane + 1);
      }

      // A parent that already owns a line gets a separate connector from the
      // merge node. Its existing vertical path remains intact for this row.
      for (const connector of connectors) {
        const toLane = destinationByLine.get(connector.line);
        if (toLane === undefined) {
          continue;
        }
        connector.line.branch.segments.push(
          segment(row, connector.fromLane, toLane, true, connector.isCommitted),
        );
      }

      for (const line of restoreCommittedAfterRow) {
        line.isCommitted = true;
      }
    }

    activeLines = nextLines;
  }

  const edges: GraphEdge[] = edgeDrafts.map((draft) => ({
    fromRow: draft.fromRow,
    fromLane: draft.fromLane,
    toLane:
      nodeByHash.get(draft.toHash)?.lane ??
      lastLaneByBranch.get(draft.branchId) ??
      draft.fromLane,
    toHash: draft.toHash,
    color: draft.color,
  }));

  return { nodes, edges, branches, laneCount };
}

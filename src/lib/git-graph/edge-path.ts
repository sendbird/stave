// src/lib/git-graph/edge-path.ts
//
// Pure SVG path builders for git-graph edges (vscode-git-graph style):
// bends are confined to a single row height; everything else is a straight
// vertical line in the edge's travel lane. No React — unit-testable alone.

function laneCenterX(lane: number, laneWidth: number): number {
  return lane * laneWidth + laneWidth / 2;
}

function rowCenterY(row: number, rowHeight: number): number {
  return row * rowHeight + rowHeight / 2;
}

/** Cubic bezier turning from (x1, y1) to (x2, y1 + rowHeight) within one row. */
function bend(x1: number, y1: number, x2: number, rowHeight: number): string {
  const yMid = y1 + rowHeight / 2;
  const y2 = y1 + rowHeight;
  return `C ${x1} ${yMid}, ${x2} ${yMid}, ${x2} ${y2}`;
}

export interface EdgePathArgs {
  fromLane: number;
  fromRow: number;
  /** Lane the edge travels in (GraphEdge.toLane). */
  travelLane: number;
  /** The parent node's final lane. */
  toLane: number;
  /** The parent node's row. */
  toRow: number;
  laneWidth: number;
  rowHeight: number;
}

/**
 * Edge path from a commit node to its parent node.
 *
 * Segments (each bend spans exactly ONE row):
 *   1. top bend    — fromLane → travelLane, in the row below the commit
 *   2. vertical    — straight line down the travel lane
 *   3. bottom bend — travelLane → toLane, in the row above the parent
 */
export function buildEdgePath(args: EdgePathArgs): string {
  const { fromLane, fromRow, travelLane, toLane, toRow, laneWidth, rowHeight } =
    args;
  const x1 = laneCenterX(fromLane, laneWidth);
  const y1 = rowCenterY(fromRow, rowHeight);
  const x2 = laneCenterX(toLane, laneWidth);
  const y2 = rowCenterY(toRow, rowHeight);
  const xT = laneCenterX(travelLane, laneWidth);

  if (fromLane === travelLane && travelLane === toLane) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const rowSpan = toRow - fromRow;
  const needsTopBend = fromLane !== travelLane;
  const needsBottomBend = travelLane !== toLane;

  // Not enough rows for two one-row bends: single bend across the span.
  if (rowSpan < 2 && needsTopBend && needsBottomBend) {
    const yMid = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${yMid}, ${x2} ${yMid}, ${x2} ${y2}`;
  }

  const parts: string[] = [`M ${x1} ${y1}`];
  let cursorY = y1;

  if (needsTopBend) {
    parts.push(bend(x1, cursorY, xT, rowHeight));
    cursorY += rowHeight;
  }

  const verticalEndY = needsBottomBend ? y2 - rowHeight : y2;
  if (verticalEndY > cursorY) {
    parts.push(`L ${xT} ${verticalEndY}`);
  }

  if (needsBottomBend) {
    parts.push(bend(xT, y2 - rowHeight, x2, rowHeight));
  }

  return parts.join(" ");
}

export interface UnresolvedEdgePathArgs {
  fromLane: number;
  fromRow: number;
  travelLane: number;
  /** Bottom y of the canvas (totalRows * rowHeight). */
  bottomY: number;
  laneWidth: number;
  rowHeight: number;
}

/**
 * Edge whose parent is outside the loaded window: bend into the travel lane
 * (if needed) then run straight to the bottom of the canvas, signalling the
 * line continues past "Load more".
 */
export function buildUnresolvedEdgePath(args: UnresolvedEdgePathArgs): string {
  const { fromLane, fromRow, travelLane, bottomY, laneWidth, rowHeight } = args;
  const x1 = laneCenterX(fromLane, laneWidth);
  const y1 = rowCenterY(fromRow, rowHeight);
  const xT = laneCenterX(travelLane, laneWidth);

  const parts: string[] = [`M ${x1} ${y1}`];
  let cursorY = y1;
  if (fromLane !== travelLane) {
    parts.push(bend(x1, y1, xT, rowHeight));
    cursorY += rowHeight;
  }
  if (bottomY > cursorY) {
    parts.push(`L ${xT} ${bottomY}`);
  }
  return parts.join(" ");
}

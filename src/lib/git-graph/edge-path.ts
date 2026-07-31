import type { GraphSegment } from "./types";

export interface GraphPathGeometry {
  laneWidth: number;
  rowHeight: number;
  /** Optional distance from the SVG edge to the centre of lane zero. */
  offsetX?: number;
}

export interface GraphPathPart {
  d: string;
  isCommitted: boolean;
}

interface GridPoint {
  row: number;
  lane: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface PathLeg {
  kind: "line" | "curve";
  from: PixelPoint;
  to: PixelPoint;
}

interface SegmentRun {
  isCommitted: boolean;
  segments: GraphSegment[];
}

export function graphLaneX(
  lane: number,
  laneWidth: number,
  offsetX = laneWidth / 2,
): number {
  return lane * laneWidth + offsetX;
}

function coordinate(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function segmentStart(segment: GraphSegment): GridPoint {
  return { row: segment.fromRow, lane: segment.fromLane };
}

function segmentEnd(segment: GraphSegment): GridPoint {
  return { row: segment.toRow, lane: segment.toLane };
}

function sameGridPoint(left: GridPoint, right: GridPoint): boolean {
  return left.row === right.row && left.lane === right.lane;
}

function toPixelPoint(
  point: GridPoint,
  geometry: Required<GraphPathGeometry>,
): PixelPoint {
  return {
    x: graphLaneX(point.lane, geometry.laneWidth, geometry.offsetX),
    y: point.row * geometry.rowHeight + geometry.rowHeight / 2,
  };
}

function groupByCommitState(segments: GraphSegment[]): SegmentRun[] {
  const runs: SegmentRun[] = [];

  for (const segment of segments) {
    const current = runs.at(-1);
    if (!current || current.isCommitted !== segment.isCommitted) {
      runs.push({
        isCommitted: segment.isCommitted,
        segments: [segment],
      });
      continue;
    }
    current.segments.push(segment);
  }

  return runs;
}

function splitConnectedChains(segments: GraphSegment[]): GraphSegment[][] {
  const chains: GraphSegment[][] = [];

  for (const segment of segments) {
    const chain = chains.at(-1);
    const previous = chain?.at(-1);
    if (
      !chain ||
      !previous ||
      !sameGridPoint(segmentEnd(previous), segmentStart(segment))
    ) {
      chains.push([segment]);
      continue;
    }
    chain.push(segment);
  }

  return chains;
}

function collapseVerticalLegs(
  segments: GraphSegment[],
  geometry: Required<GraphPathGeometry>,
): PathLeg[] {
  const legs: PathLeg[] = [];

  for (const segment of segments) {
    const from = toPixelPoint(segmentStart(segment), geometry);
    const to = toPixelPoint(segmentEnd(segment), geometry);
    const kind = from.x === to.x ? "line" : "curve";
    const previous = legs.at(-1);

    if (
      kind === "line" &&
      previous?.kind === "line" &&
      previous.to.x === from.x &&
      previous.to.y === from.y
    ) {
      previous.to = to;
      continue;
    }

    legs.push({ kind, from, to });
  }

  return legs;
}

function serializeChain(
  segments: GraphSegment[],
  geometry: Required<GraphPathGeometry>,
): string {
  const legs = collapseVerticalLegs(segments, geometry);
  const first = legs[0];
  if (!first) {
    return "";
  }

  const commands = [
    `M ${coordinate(first.from.x)} ${coordinate(first.from.y)}`,
  ];

  for (const leg of legs) {
    if (leg.kind === "line") {
      commands.push(`L ${coordinate(leg.to.x)} ${coordinate(leg.to.y)}`);
      continue;
    }

    const middleY = (leg.from.y + leg.to.y) / 2;
    commands.push(
      `C ${coordinate(leg.from.x)} ${coordinate(middleY)}, ${coordinate(
        leg.to.x,
      )} ${coordinate(middleY)}, ${coordinate(leg.to.x)} ${coordinate(
        leg.to.y,
      )}`,
    );
  }

  return commands.join(" ");
}

/**
 * Convert ordered row segments into open SVG paths.
 *
 * Lane changes use a symmetric cubic Bezier with both control points on the
 * row midpoint. This keeps a vertical tangent at each node while producing a
 * smooth transition between lanes. Disconnected connectors retain separate
 * move commands but share one paint group so the existing shadow and branch
 * strokes are composited consistently.
 */
export function buildGraphBranchPaths(
  segments: GraphSegment[],
  geometry: GraphPathGeometry,
): GraphPathPart[] {
  const resolvedGeometry: Required<GraphPathGeometry> = {
    laneWidth: geometry.laneWidth,
    rowHeight: geometry.rowHeight,
    offsetX: geometry.offsetX ?? geometry.laneWidth / 2,
  };

  return groupByCommitState(segments).map((run) => ({
    d: splitConnectedChains(run.segments)
      .map((chain) => serializeChain(chain, resolvedGeometry))
      .filter(Boolean)
      .join(" "),
    isCommitted: run.isCommitted,
  }));
}

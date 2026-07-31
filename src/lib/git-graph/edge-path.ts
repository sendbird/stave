/*
 * Portions adapted from Git Graph for Visual Studio Code v1.4.6.
 * Copyright (c) 2019-present, mhutchie. See NOTICE and
 * licenses/vscode-git-graph-MIT.txt.
 */
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

export function graphLaneX(
  lane: number,
  laneWidth: number,
  offsetX = laneWidth / 2,
): number {
  return lane * laneWidth + offsetX;
}

function rowCenterY(row: number, rowHeight: number): number {
  return row * rowHeight + rowHeight / 2;
}

function coordinate(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function samePoint(
  left: { row: number; lane: number },
  right: { row: number; lane: number },
) {
  return left.row === right.row && left.lane === right.lane;
}

/**
 * Convert one branch's row-by-row layout into rounded SVG path parts.
 *
 * Rounded transitions use vertical control points at 80% of the row span,
 * matching Git Graph's default curve geometry. Consecutive vertical segments
 * are collapsed into one command, while discontinuous merge connectors are
 * appended with another move command to the same SVG path. Keeping every
 * committed subpath of a branch together preserves Git Graph's shadow and
 * foreground paint order at joins and crossings.
 */
export function buildGraphBranchPaths(
  segments: GraphSegment[],
  geometry: GraphPathGeometry,
): GraphPathPart[] {
  const { laneWidth, rowHeight, offsetX = laneWidth / 2 } = geometry;
  const parts: GraphPathPart[] = [];
  let commands: string[] = [];
  let committed = true;
  let previous: GraphSegment | null = null;
  let lastCommandWasVertical = false;

  const flush = () => {
    if (commands.length > 1) {
      parts.push({ d: commands.join(" "), isCommitted: committed });
    }
    commands = [];
    previous = null;
    lastCommandWasVertical = false;
  };

  for (const segment of segments) {
    const isContinuous =
      previous !== null &&
      samePoint(
        { row: previous.toRow, lane: previous.toLane },
        { row: segment.fromRow, lane: segment.fromLane },
      );
    if (commands.length === 0 || committed !== segment.isCommitted) {
      flush();
      committed = segment.isCommitted;
      commands.push(
        `M ${coordinate(
          graphLaneX(segment.fromLane, laneWidth, offsetX),
        )} ${coordinate(rowCenterY(segment.fromRow, rowHeight))}`,
      );
    } else if (!isContinuous) {
      commands.push(
        `M ${coordinate(
          graphLaneX(segment.fromLane, laneWidth, offsetX),
        )} ${coordinate(rowCenterY(segment.fromRow, rowHeight))}`,
      );
      lastCommandWasVertical = false;
    }

    const x1 = graphLaneX(segment.fromLane, laneWidth, offsetX);
    const x2 = graphLaneX(segment.toLane, laneWidth, offsetX);
    const y1 = rowCenterY(segment.fromRow, rowHeight);
    const y2 = rowCenterY(segment.toRow, rowHeight);
    if (x1 === x2) {
      const lineCommand = `L ${coordinate(x2)} ${coordinate(y2)}`;
      if (lastCommandWasVertical && isContinuous) {
        commands[commands.length - 1] = lineCommand;
      } else {
        commands.push(lineCommand);
      }
      lastCommandWasVertical = true;
    } else {
      const controlOffset = (y2 - y1) * 0.8;
      commands.push(
        `C ${coordinate(x1)} ${coordinate(
          y1 + controlOffset,
        )}, ${coordinate(x2)} ${coordinate(
          y2 - controlOffset,
        )}, ${coordinate(x2)} ${coordinate(y2)}`,
      );
      lastCommandWasVertical = false;
    }
    previous = segment;
  }
  flush();

  return parts;
}

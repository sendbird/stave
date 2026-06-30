import * as React from "react";
import type { GraphCommit, GraphEdge, GraphNode } from "@/lib/git-graph/types";
import { buildGraphLayout } from "@/lib/git-graph/graph-layout";
import { GitGraphRow, ROW_HEIGHT, LANE_WIDTH } from "./GitGraphRow";
import type { GraphRef } from "@/lib/git-graph/types";

// ---------------------------------------------------------------------------
// Theme-derived lane palette
// ---------------------------------------------------------------------------
// The default theme's --chart-1…5 are all hue ~130 (green family), which
// makes adjacent lanes look identical.  We mix the chart tokens with semantic
// colour tokens that carry distinct hues across ALL built-in themes:
//
//   var(--chart-1)   → primary data colour (green in default, varies by theme)
//   var(--destructive) → red/orange   (hue ~27 in all themes)
//   var(--warning)   → amber/yellow   (hue ~84 in all themes)
//   var(--success)   → teal-green     (hue ~156 in all themes — distinct from
//                                      chart-1's ~130)
//   var(--chart-2)   → second chart colour (distinct in all non-default themes;
//                      slightly lighter green in default — acceptable as 5th lane)
//
// Referencing CSS variables (not hex) ensures the palette adapts to
// light/dark/custom themes at render time.
const LANE_PALETTE: readonly string[] = [
  "var(--chart-1)",
  "var(--destructive)",
  "var(--warning)",
  "var(--success)",
  "var(--chart-2)",
];

function laneColor(colorIndex: number): string {
  return LANE_PALETTE[colorIndex % LANE_PALETTE.length] ?? LANE_PALETTE[0] ?? "var(--primary)";
}

// ---------------------------------------------------------------------------
// SVG path helpers
// ---------------------------------------------------------------------------

/**
 * Build an SVG path from (fromLane, fromRow) to (toLane, toRow).
 *
 * Co-ordinates are centre-of-cell:
 *   x = lane * LANE_WIDTH + LANE_WIDTH / 2
 *   y = row  * ROW_HEIGHT + ROW_HEIGHT / 2
 *
 * For straight vertical edges (same lane) we use a plain L command.
 * For diagonal edges (different lanes) we draw:
 *   - a short vertical segment from the source node down a fraction of the gap
 *   - then a cubic bezier curve to the destination
 * This produces the smooth single-bend expected by the spec.
 */
function buildEdgePath(
  fromLane: number,
  fromRow: number,
  toLane: number,
  toRow: number,
): string {
  const x1 = fromLane * LANE_WIDTH + LANE_WIDTH / 2;
  const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
  const x2 = toLane * LANE_WIDTH + LANE_WIDTH / 2;
  const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

  if (fromLane === toLane) {
    // Straight vertical segment
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Bezier bend: control points placed at 1/3 and 2/3 of the vertical span
  const dy = y2 - y1;
  const cp1y = y1 + dy * 0.33;
  const cp2y = y1 + dy * 0.67;
  return `M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// SVG edge renderer — resolves parent rows from node map (not edge.toRow)
// ---------------------------------------------------------------------------

interface SvgLayerProps {
  edges: GraphEdge[];
  nodes: GraphNode[];
  /** hash → GraphNode look-up built from layout.nodes */
  nodeByHash: ReadonlyMap<string, GraphNode>;
  /** hash → GraphCommit look-up for ref/HEAD detection */
  commitByHash: ReadonlyMap<string, GraphCommit>;
  /** commit list so we can resolve parent hash → parentNode */
  commits: GraphCommit[];
  laneCount: number;
  totalRows: number;
}

function SvgLayer({
  edges,
  nodes,
  nodeByHash,
  commitByHash,
  commits,
  laneCount,
  totalRows,
}: SvgLayerProps) {
  const svgWidth = laneCount * LANE_WIDTH;
  const svgHeight = totalRows * ROW_HEIGHT;

  // Build a map from row → parent-hash at that edge destination.
  // GraphEdge does NOT carry the parent hash — we need it to look up the real
  // destination row.  Reconstruct: edge i at row R corresponds to commit R's
  // i-th parent (they are emitted in parent order by buildGraphLayout).

  // Build: commit row → commit for quick lookup
  const commitByRow = React.useMemo(() => {
    const m = new Map<number, GraphCommit>();
    commits.forEach((c, idx) => m.set(idx, c));
    return m;
  }, [commits]);

  // For each edge, find the parent's actual node row via nodeByHash.
  // edgePaths groups by color string for batched <path> elements.
  const pathsByColor = React.useMemo(() => {
    const map = new Map<string, string[]>();

    // Group edges by (fromRow, fromLane) → parentIndex (order emitted)
    // The algorithm emits parents in order per commit row. We track
    // "how many edges have we seen from each fromRow so far" to index parents.
    const parentIndexForRow = new Map<number, number>();

    for (const edge of edges) {
      const { fromRow, fromLane, toLane, color } = edge;

      // Determine parent index for this fromRow
      const pIdx = parentIndexForRow.get(fromRow) ?? 0;
      parentIndexForRow.set(fromRow, pIdx + 1);

      // Look up the parent hash from the commit
      const commit = commitByRow.get(fromRow);
      const parentHash = commit?.parents[pIdx];

      let toRow: number;
      if (parentHash !== undefined) {
        // Resolve actual destination row from node map
        const parentNode = nodeByHash.get(parentHash);
        if (parentNode !== undefined) {
          toRow = parentNode.row;
        } else {
          // Parent not in the loaded window — draw a short stub downward
          toRow = fromRow + 1;
        }
      } else {
        // Fallback: edge.toRow was a visual-hop placeholder, use stub
        toRow = fromRow + 1;
      }

      const pathD = buildEdgePath(fromLane, fromRow, toLane, toRow);
      const colorStr = laneColor(color);
      const existing = map.get(colorStr);
      if (existing) {
        existing.push(pathD);
      } else {
        map.set(colorStr, [pathD]);
      }
    }

    return map;
  }, [edges, commitByRow, nodeByHash]);

  const NODE_RADIUS = 4;

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: svgWidth,
        height: svgHeight,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {/* Edges */}
      {Array.from(pathsByColor.entries()).map(([color, paths]) => (
        <g key={color}>
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              opacity={0.85}
            />
          ))}
        </g>
      ))}

      {/* Nodes (circles), rendered on top of edges */}
      {nodes.map((node) => {
        const cx = node.lane * LANE_WIDTH + LANE_WIDTH / 2;
        const cy = node.row * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = laneColor(node.color);
        // HEAD node: detected via refs containing isHead===true, NOT by row index
        const commit = commitByHash.get(node.hash);
        const isHead = commit?.refs.some((r) => r.isHead) ?? false;
        return (
          <g key={node.hash}>
            {isHead && (
              <circle
                cx={cx}
                cy={cy}
                r={NODE_RADIUS + 2}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                opacity={0.7}
              />
            )}
            <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GitGraphCanvas — public component
// ---------------------------------------------------------------------------

export interface GitGraphCanvasProps {
  commits: GraphCommit[];
  selectedHash?: string | null;
  onSelect: (hash: string) => void;
  onCommitContextMenu: (e: React.MouseEvent, hash: string) => void;
  onRefContextMenu: (e: React.MouseEvent, hash: string, ref: GraphRef) => void;
}

export function GitGraphCanvas({
  commits,
  selectedHash,
  onSelect,
  onCommitContextMenu,
  onRefContextMenu,
}: GitGraphCanvasProps) {
  const layout = React.useMemo(() => buildGraphLayout(commits), [commits]);

  // Build a hash → node map so SvgLayer can resolve parent rows
  const nodeByHash = React.useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const node of layout.nodes) {
      m.set(node.hash, node);
    }
    return m;
  }, [layout.nodes]);

  // Build a hash → commit map so SvgLayer can detect HEAD via refs.isHead
  const commitByHash = React.useMemo(() => {
    const m = new Map<string, GraphCommit>();
    for (const commit of commits) {
      m.set(commit.hash, commit);
    }
    return m;
  }, [commits]);

  const totalRows = commits.length;
  const svgWidth = layout.laneCount * LANE_WIDTH;
  const totalHeight = totalRows * ROW_HEIGHT;

  return (
    <div
      role="grid"
      aria-label="Git graph"
      style={{ position: "relative", width: "100%", height: totalHeight }}
    >
      {/* Absolutely-positioned SVG behind the rows */}
      <SvgLayer
        edges={layout.edges}
        nodes={layout.nodes}
        nodeByHash={nodeByHash}
        commitByHash={commitByHash}
        commits={commits}
        laneCount={Math.max(layout.laneCount, 1)}
        totalRows={totalRows}
      />

      {/* Rows — positioned over the SVG */}
      {commits.map((commit, idx) => (
        <div
          key={commit.hash}
          style={{
            position: "absolute",
            top: idx * ROW_HEIGHT,
            left: 0,
            right: 0,
            height: ROW_HEIGHT,
          }}
        >
          <GitGraphRow
            commit={commit}
            laneCount={layout.laneCount}
            isSelected={commit.hash === selectedHash}
            onClick={onSelect}
            onContextMenu={onCommitContextMenu}
            onRefContextMenu={onRefContextMenu}
          />
        </div>
      ))}
    </div>
  );
}

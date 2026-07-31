import * as React from "react";
import type { GraphCommit, GraphEdge, GraphNode } from "@/lib/git-graph/types";
import { buildGraphLayout } from "@/lib/git-graph/graph-layout";
import {
  buildEdgePath,
  buildUnresolvedEdgePath,
} from "@/lib/git-graph/edge-path";
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
// SVG edge renderer — resolves parent nodes by edge.toHash
// ---------------------------------------------------------------------------

interface SvgLayerProps {
  edges: GraphEdge[];
  nodes: GraphNode[];
  /** hash → GraphNode look-up built from layout.nodes */
  nodeByHash: ReadonlyMap<string, GraphNode>;
  /** hash → GraphCommit look-up for ref/HEAD detection */
  commitByHash: ReadonlyMap<string, GraphCommit>;
  laneCount: number;
  totalRows: number;
}

function SvgLayer({
  edges,
  nodes,
  nodeByHash,
  commitByHash,
  laneCount,
  totalRows,
}: SvgLayerProps) {
  const svgWidth = laneCount * LANE_WIDTH;
  const svgHeight = totalRows * ROW_HEIGHT;

  // Group path strings by color for batched <path> elements.
  const pathsByColor = React.useMemo(() => {
    const map = new Map<string, string[]>();

    for (const edge of edges) {
      const parentNode = nodeByHash.get(edge.toHash);
      const pathD = parentNode
        ? buildEdgePath({
            fromLane: edge.fromLane,
            fromRow: edge.fromRow,
            travelLane: edge.toLane,
            toLane: parentNode.lane,
            toRow: parentNode.row,
            laneWidth: LANE_WIDTH,
            rowHeight: ROW_HEIGHT,
          })
        : buildUnresolvedEdgePath({
            fromLane: edge.fromLane,
            fromRow: edge.fromRow,
            travelLane: edge.toLane,
            bottomY: svgHeight,
            laneWidth: LANE_WIDTH,
            rowHeight: ROW_HEIGHT,
          });
      const colorStr = laneColor(edge.color);
      const existing = map.get(colorStr);
      if (existing) {
        existing.push(pathD);
      } else {
        map.set(colorStr, [pathD]);
      }
    }

    return map;
  }, [edges, nodeByHash, svgHeight]);

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
        laneCount={layout.laneCount}
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

# Git Graph Menu Separation + Line Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Git Graph entry point out of the Source Control panel into a dedicated RightRail button, and rework the graph line geometry so bends are confined to a single row (vscode-git-graph style) instead of long shallow S-curves.

**Architecture:** The layout algorithm (`buildGraphLayout`) becomes line-following: the first parent always reserves the commit's own lane (trunk stability), edges record the lane they travel in (`toLane`) plus the parent hash (`toHash`), and that lane stays reserved until the parent's row so vertical segments never cross other nodes. A new pure module `edge-path.ts` builds 3-segment SVG paths (top bend → vertical → bottom bend, each bend exactly one `ROW_HEIGHT`). Entry point moves to a hardcoded RightRail button (like Lens/Terminal) reusing the existing `openGitGraph()` store action; a command palette entry is added.

**Tech Stack:** React + TypeScript, Zustand, SVG, `bun test` (bun:test), `bun run typecheck` (tsc).

**Spec:** `docs/superpowers/specs/2026-07-31-git-graph-menu-and-lines-design.md`

## Global Constraints

- Run everything with Bun: `bun test <files>`, `bun run typecheck`. Never npm/yarn.
- Scope every check to this worktree (`/Users/heath.sinn/Workspace/stave/.stave/workspaces/fix__git-graph--19g58ey`). Never run repo-wide globs that walk into sibling worktrees.
- Commits follow Conventional Commits, message in English, each ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Do NOT change the lane color palette (`LANE_PALETTE` CSS variables) or any theme tokens.
- No new dependencies.
- `ROW_HEIGHT = 28`, `LANE_WIDTH = 14` (exported from `src/components/git-graph/GitGraphRow.tsx`) stay unchanged.
- Non-goals (do not touch): virtualization, Zustand slice for graph data, IPC/data flow, `GitGraphView.tsx` toolbar behavior.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/git-graph/types.ts` | Modify | `GraphEdge`: drop `toRow`, add `toHash` |
| `src/lib/git-graph/graph-layout.ts` | Rewrite | Line-following lane assignment |
| `src/lib/git-graph/edge-path.ts` | Create | Pure SVG path builders (no React) |
| `src/components/git-graph/GitGraphCanvas.tsx` | Modify | Render via edge-path module + `toHash` lookup |
| `src/components/layout/RightRail.tsx` | Modify | Add Git Graph rail button |
| `src/components/layout/WorkspaceChangesPanel.tsx` | Modify | Remove 2 "Open Git Graph" buttons |
| `src/components/layout/command-palette-registry.ts` | Modify | `view.open-git-graph` command + handler type |
| `src/components/layout/AppShell.tsx` | Modify | Wire palette handler |
| `tests/git-graph-layout.test.ts` | Modify | New layout cases |
| `tests/git-graph-edge-path.test.ts` | Create | Path string cases |
| `tests/command-palette*.test.ts` | Modify | Fixture + new command assertion |

---

### Task 1: Line-following lane layout (`graph-layout.ts` + `types.ts`)

**Files:**
- Modify: `src/lib/git-graph/types.ts:33-39` (GraphEdge)
- Modify: `src/lib/git-graph/graph-layout.ts` (full rewrite of `buildGraphLayout`)
- Test: `tests/git-graph-layout.test.ts`

**Interfaces:**
- Consumes: `GraphCommit` (unchanged).
- Produces: `GraphEdge = { fromRow, fromLane, toLane, toHash, color }` where `toLane` is the **travel lane** (reserved until the parent's row) and `toHash` is the parent commit hash. `GraphLayout.laneCount === maxLaneIndex + 1`. Task 3 relies on exactly these fields.

- [ ] **Step 1: Add the failing tests**

Append inside `describe("buildGraphLayout", ...)` in `tests/git-graph-layout.test.ts` (keep the existing 4 tests — they must still pass):

```ts
  it("keeps the trunk in lane 0 when a feature branch reserves the fork parent first", () => {
    // newest-first: t2 (trunk tip) -> t1, f1 (feature) -> t0, t1 -> t0, t0 (root)
    const layout = buildGraphLayout([
      commit("t2", ["t1"]),
      commit("f1", ["t0"]),
      commit("t1", ["t0"]),
      commit("t0", []),
    ]);
    const byHash = new Map(layout.nodes.map((n) => [n.hash, n]));
    expect(byHash.get("t2")!.lane).toBe(0);
    expect(byHash.get("t1")!.lane).toBe(0);
    expect(byHash.get("t0")!.lane).toBe(0); // trunk must not zigzag into lane 1
    expect(byHash.get("f1")!.lane).toBe(1);
    // f1's edge travels in its own lane until the fork point
    const f1Edge = layout.edges.find((e) => e.fromRow === byHash.get("f1")!.row)!;
    expect(f1Edge.toLane).toBe(1);
    expect(f1Edge.toHash).toBe("t0");
  });

  it("emits toHash for every edge", () => {
    const layout = buildGraphLayout([
      commit("m", ["a", "b"]),
      commit("a", ["base"]),
      commit("b", ["base"]),
      commit("base", []),
    ]);
    expect(layout.edges.map((e) => e.toHash).sort()).toEqual([
      "a",
      "b",
      "base",
      "base",
    ]);
  });

  it("fans an octopus merge out to distinct travel lanes", () => {
    const layout = buildGraphLayout([
      commit("m", ["a", "b", "c"]),
      commit("a", []),
      commit("b", []),
      commit("c", []),
    ]);
    const mergeEdges = layout.edges.filter((e) => e.fromRow === 0);
    expect(mergeEdges.map((e) => e.toLane)).toEqual([0, 1, 2]);
    expect(layout.laneCount).toBe(3);
  });

  it("merges into an existing line when the second parent is already reserved", () => {
    const layout = buildGraphLayout([
      commit("a", ["p"]),
      commit("m", ["q", "p"]),
      commit("q", []),
      commit("p", []),
    ]);
    const mergeEdge = layout.edges.find(
      (e) => e.toHash === "p" && e.fromRow === 1,
    )!;
    expect(mergeEdge.fromLane).toBe(1);
    expect(mergeEdge.toLane).toBe(0); // joins the line a -> p already in lane 0
  });

  it("keeps an off-window parent's lane reserved and sizes laneCount by max index", () => {
    const layout = buildGraphLayout([
      commit("x", ["missing"]),
      commit("y", []),
    ]);
    const x = layout.nodes.find((n) => n.hash === "x")!;
    const y = layout.nodes.find((n) => n.hash === "y")!;
    expect(x.lane).toBe(0);
    // lane 0 is still reserved for "missing", so y must open lane 1 …
    expect(y.lane).toBe(1);
    expect(layout.edges[0]!.toHash).toBe("missing");
    // … and laneCount must cover lane index 1 even though only 1 lane is
    // occupied at that row (old code returned 1 here — the width bug).
    expect(layout.laneCount).toBe(2);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bun test tests/git-graph-layout.test.ts`
Expected: the 5 new tests FAIL (`toHash` is `undefined` / trunk lane assertions fail / `laneCount` is 1 in the off-window case). The 4 pre-existing tests still pass.

- [ ] **Step 3: Change `GraphEdge` in `src/lib/git-graph/types.ts`**

Replace the existing `GraphEdge` interface (lines 33-39) with:

```ts
export interface GraphEdge {
  fromRow: number;
  fromLane: number;
  /** Lane the edge travels in — reserved for the parent until its row. */
  toLane: number;
  /** Parent commit hash; the renderer resolves the destination node by hash. */
  toHash: string;
  color: number;
}
```

(`toRow` is removed. Verified: nothing outside `graph-layout.ts` reads `edge.toRow` — `GitGraphCanvas.tsx` destructures only `fromRow, fromLane, toLane, color`.)

- [ ] **Step 4: Rewrite `buildGraphLayout` in `src/lib/git-graph/graph-layout.ts`**

Keep `Lane`, `leftmostFreeLane`, `getLane` as-is. Replace the doc comment and `buildGraphLayout` body with:

```ts
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
```

(The old `laneCount === 0` floor is gone: non-empty input always yields `maxLaneIndex >= 0` → `laneCount >= 1`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/git-graph-layout.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: clean. (`GitGraphCanvas.tsx` never reads `edge.toRow`, so removing the field compiles; the canvas keeps working with its old resolution logic until Task 3.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/git-graph/types.ts src/lib/git-graph/graph-layout.ts tests/git-graph-layout.test.ts
git commit -m "feat(git-graph): rework lane layout for stable trunk and travel-lane edges

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure edge-path module (`edge-path.ts`)

**Files:**
- Create: `src/lib/git-graph/edge-path.ts`
- Test: `tests/git-graph-edge-path.test.ts` (create)

**Interfaces:**
- Consumes: nothing (pure math).
- Produces (Task 3 imports these exact signatures):
  - `buildEdgePath(args: { fromLane: number; fromRow: number; travelLane: number; toLane: number; toRow: number; laneWidth: number; rowHeight: number }): string`
  - `buildUnresolvedEdgePath(args: { fromLane: number; fromRow: number; travelLane: number; bottomY: number; laneWidth: number; rowHeight: number }): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/git-graph-edge-path.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/git-graph-edge-path.test.ts`
Expected: FAIL — module `@/lib/git-graph/edge-path` does not exist.

- [ ] **Step 3: Implement `src/lib/git-graph/edge-path.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/git-graph-edge-path.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/git-graph/edge-path.ts tests/git-graph-edge-path.test.ts
git commit -m "feat(git-graph): add pure edge path builders with single-row bends

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire the renderer to travel lanes + `toHash` (`GitGraphCanvas.tsx`)

**Files:**
- Modify: `src/components/git-graph/GitGraphCanvas.tsx`

**Interfaces:**
- Consumes: `buildEdgePath` / `buildUnresolvedEdgePath` from Task 2, `GraphEdge.toHash`/`toLane` from Task 1.
- Produces: no API change — `GitGraphCanvas` props are untouched.

- [ ] **Step 1: Replace the local path helper with imports**

In `src/components/git-graph/GitGraphCanvas.tsx`:
- Delete the entire local `buildEdgePath` function (lines 40-74) and its doc comment.
- Add the import:

```ts
import {
  buildEdgePath,
  buildUnresolvedEdgePath,
} from "@/lib/git-graph/edge-path";
```

- [ ] **Step 2: Rewrite `SvgLayer`'s edge resolution**

Replace `SvgLayerProps` (drop the now-unneeded `commits` member) and the `commitByRow` + `pathsByColor` memos. The section header comment (lines 76-78) becomes `// SVG edge renderer — resolves parent nodes by edge.toHash`. New code:

```ts
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
    const bottomY = totalRows * ROW_HEIGHT;

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
            bottomY,
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
  }, [edges, nodeByHash, totalRows]);
```

Everything from `const NODE_RADIUS = 4;` down (the returned SVG markup) stays unchanged.

- [ ] **Step 3: Clean up `GitGraphCanvas`**

- Remove the `commits={commits}` prop from the `<SvgLayer …>` call site.
- Delete the unused local `const svgWidth = layout.laneCount * LANE_WIDTH;` (line 267 area) — `totalHeight` stays.
- Update the `buildGraphLayout` docstring reference in the SvgLayer comment block if it still mentions edge-order reconstruction.

- [ ] **Step 4: Typecheck + tests**

Run: `bun run typecheck && bun test tests/git-graph-layout.test.ts tests/git-graph-edge-path.test.ts`
Expected: clean typecheck, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/git-graph/GitGraphCanvas.tsx
git commit -m "refactor(git-graph): render edges via travel lanes and toHash lookup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: RightRail entry button + remove Source Control buttons

**Files:**
- Modify: `src/components/layout/RightRail.tsx`
- Modify: `src/components/layout/WorkspaceChangesPanel.tsx` (lines 9, 649, 900-911, 1185-1193)

**Interfaces:**
- Consumes: existing store action `openGitGraph()` (`src/store/app-store-editor-actions.ts:291`, tab id \`git-graph:${workspaceId}\`), store fields `activeEditorTabId`, `activeWorkspaceId`.
- Produces: rail button labeled "Git Graph". No new exports.

- [ ] **Step 1: Add the rail button in `RightRail.tsx`**

1. Change the lucide import (line 1) to:

```ts
import { GitGraph, Globe, TerminalSquare } from "lucide-react";
```

2. Extend the `useShallow` selector tuple with three members (append after `state.setLayout`):

```ts
          state.activeEditorTabId,
          state.activeWorkspaceId,
          state.openGitGraph,
```

and the destructuring accordingly:

```ts
  const [
    hasProject,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    activeSurfaceKind,
    setLayout,
    activeEditorTabId,
    activeWorkspaceId,
    openGitGraph,
  ] = useAppStore(
```

3. Below `const terminalActive = …` add:

```ts
  const gitGraphActive = activeEditorTabId === `git-graph:${activeWorkspaceId}`;
```

4. Insert this button between the `RIGHT_RAIL_PANEL_IDS.map(...)` block and the Lens `<Tooltip>` (i.e. after line 103):

```tsx
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                size="sm"
                variant={gitGraphActive ? "default" : "ghost"}
                disabled={!hasProject}
                className={cn(
                  RAIL_BUTTON_CLASS,
                  !gitGraphActive && RAIL_BUTTON_INACTIVE_CLASS,
                )}
                onClick={() => openGitGraph()}
                aria-label="Git Graph"
              >
                <GitGraph className={RAIL_ICON_CLASS} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Git Graph</TooltipContent>
          </Tooltip>
```

- [ ] **Step 2: Remove the two buttons from `WorkspaceChangesPanel.tsx`**

- Delete the header button (lines 901-911): the `<Button … aria-label="Open Git Graph" …><GitGraph className="size-3.5" /></Button>` element inside `<div className="flex shrink-0 items-center gap-1">`. Keep the container and the Refresh button that follows.
- Delete the History-tab button (lines 1185-1193): the full-width `<Button … onClick={() => openGitGraph()}>…Open Git Graph</Button>` element.
- Delete `const openGitGraph = useAppStore((s) => s.openGitGraph);` (line 649).
- Remove `GitGraph,` from the lucide import (line 9).

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: clean. If an unused-import lint error appears for `GitGraph` anywhere, remove that import too.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/RightRail.tsx src/components/layout/WorkspaceChangesPanel.tsx
git commit -m "feat(layout): move git graph entry to a dedicated right rail button

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Command palette entry `view.open-git-graph`

**Files:**
- Modify: `src/components/layout/command-palette-registry.ts` (imports line 1-24, handlers interface line 114-151, view descriptors near line 690)
- Modify: `src/components/layout/AppShell.tsx` (commands object, line 1055+)
- Test: `tests/command-palette.test.ts` (+ fixtures in `tests/command-palette-navigation.test.ts`, `tests/command-palette-scripts.test.ts` if they build a `commands` object — check with `grep -l "openLens: () => {}" tests/`)

**Interfaces:**
- Consumes: `openGitGraph()` store action.
- Produces: `CommandPaletteCommandHandlers.openGitGraph: () => void;` — every fixture constructing the handlers object must include it.

- [ ] **Step 1: Add the failing test**

In `tests/command-palette.test.ts`, inside the `"builds grouped core and dynamic actions"` test (after the existing `navigation.*` assertions), add:

```ts
    expect(actions.some((item) => item.id === "view.open-git-graph")).toBe(
      true,
    );
```

Run: `bun test tests/command-palette.test.ts`
Expected: FAIL (`view.open-git-graph` not found).

- [ ] **Step 2: Register the command**

In `src/components/layout/command-palette-registry.ts`:

1. Add `GitGraph,` to the lucide import block (alphabetical, after `GitBranch,`).
2. Add to `CommandPaletteCommandHandlers` (after `openFleetView: () => void;`):

```ts
  openGitGraph: () => void;
```

3. Insert this descriptor right after the `view.show-lens` entry (after its closing `},` near line 690 — `shortcut` is optional, omit it):

```ts
  {
    id: "view.open-git-graph",
    title: "Open Git Graph",
    description: "Open the commit graph for the active workspace.",
    group: "view",
    icon: GitGraph,
    keywords: ["git", "graph", "commits", "log", "branches", "history"],
    build: (args) => ({
      id: "view.open-git-graph",
      title: "Open Git Graph",
      subtitle: "Open the commit graph in an editor tab.",
      group: "view",
      icon: GitGraph,
      keywords: ["git", "graph", "commits", "log", "branches", "history"],
      run: args.commands.openGitGraph,
      source: "core",
    }),
  },
```

- [ ] **Step 3: Wire the handler in `AppShell.tsx`**

In the `commands: { … }` object (line 1055+), after `openFleetView: () => openFleetView(),` add:

```ts
        openGitGraph: () => useAppStore.getState().openGitGraph(),
```

(This matches the `useAppStore.getState()` pattern already used by `toggleChangesPanel` in the same object.)

- [ ] **Step 4: Update test fixtures**

Run: `grep -rln "openLens: () => {}" tests/` — in every listed file, add next to `openLens: () => {}`:

```ts
      openGitGraph: () => {},
```

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test tests/command-palette.test.ts tests/command-palette-navigation.test.ts tests/command-palette-scripts.test.ts && bun run typecheck`
Expected: all PASS, clean typecheck. If typecheck flags other fixture objects missing `openGitGraph`, add the stub there too.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/command-palette-registry.ts src/components/layout/AppShell.tsx tests/command-palette.test.ts tests/command-palette-navigation.test.ts tests/command-palette-scripts.test.ts
git commit -m "feat(palette): add open git graph command

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full focused test sweep + typecheck**

Run:
```bash
bun run typecheck
bun test tests/git-graph-layout.test.ts tests/git-graph-edge-path.test.ts tests/git-graph-log.test.ts tests/git-graph-tag-args.test.ts tests/command-palette.test.ts tests/command-palette-navigation.test.ts tests/command-palette-scripts.test.ts
```
Expected: everything PASS.

- [ ] **Step 2: Visual smoke check**

Launch the app (`bun run dev` or the project's run skill) and verify by eye:
1. RightRail shows the Git Graph icon between the panel icons and Lens; clicking opens the `Git Graph` editor tab; the button highlights while that tab is active.
2. Source Control panel no longer shows either "Open Git Graph" button (header + History tab).
3. In a repo with branches/merges: long edges are vertical with bends confined to one row near fork/merge points; trunk stays in the leftmost lane; no line passes through an unrelated commit node; the graph gutter no longer overlaps commit subjects.
4. Command palette lists "Open Git Graph" and it works.

- [ ] **Step 3: Report completion**

Summarize the diff and hand back for review (no push/PR unless requested).

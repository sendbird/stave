import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Loader } from "@/components/ui/loader";
import { buildGraphBranchPaths, graphLaneX } from "@/lib/git-graph/edge-path";
import { buildGraphLayout } from "@/lib/git-graph/graph-layout";
import type {
  GraphBranch,
  GraphCommit,
  GraphNode,
  GraphRef,
  GraphWorkingTreeSummary,
} from "@/lib/git-graph/types";
import {
  GitGraphRow,
  GitGraphWorkingTreeRow,
  LANE_WIDTH,
  ROW_HEIGHT,
  graphGridTemplate,
  type GitGraphColumnWidths,
} from "./GitGraphRow";
import type { GitGraphColumnVisibility } from "./GitGraphToolbar";
import {
  WORKING_TREE_SELECTION,
  type GitGraphSelection,
} from "./useGitGraphData";

// Stave-authored colours balanced for light and dark editor surfaces.
export const GIT_GRAPH_LANE_PALETTE = [
  "#2B6FE8",
  "#D43F82",
  "#258A52",
  "#C45A22",
  "#8662D6",
  "#D94848",
  "#16869E",
  "#B457C4",
  "#5F8D2B",
  "#A87412",
  "#596ED9",
  "#1D8572",
] as const;
const OVERSCAN_ROWS = 10;
const WORKING_TREE_LAYOUT_HASH = "__stave_working_tree__";

function laneColor(colorIndex: number): string {
  return (
    GIT_GRAPH_LANE_PALETTE[colorIndex % GIT_GRAPH_LANE_PALETTE.length] ??
    GIT_GRAPH_LANE_PALETTE[0]
  );
}

function hasWorkingTreeChanges(summary: GraphWorkingTreeSummary): boolean {
  return (
    summary.staged + summary.unstaged + summary.untracked + summary.conflicts >
    0
  );
}

interface GraphSvgProps {
  branches: GraphBranch[];
  nodes: GraphNode[];
  commits: GraphCommit[];
  laneCount: number;
  graphWidth: number;
  workingTreeVisible: boolean;
  workingTreeSelected: boolean;
  selectedHash: string | null;
  searchMatches: ReadonlySet<string>;
  headHash: string | null;
  visibleStart: number;
  visibleEnd: number;
}

const GraphSvg = memo(function GraphSvg({
  branches,
  nodes,
  commits,
  laneCount,
  graphWidth,
  workingTreeVisible,
  workingTreeSelected,
  selectedHash,
  searchMatches,
  headHash,
  visibleStart,
  visibleEnd,
}: GraphSvgProps) {
  const commitByHash = useMemo(
    () => new Map(commits.map((commit) => [commit.hash, commit])),
    [commits],
  );
  const totalHeight = nodes.length * ROW_HEIGHT;
  const renderStart = Math.max(0, visibleStart - 1);
  const renderEnd = Math.min(nodes.length, visibleEnd + 1);
  const visibleNodes = useMemo(
    () =>
      nodes.filter((node) => node.row >= renderStart && node.row < renderEnd),
    [nodes, renderEnd, renderStart],
  );
  const branchPaths = useMemo(
    () =>
      branches
        .map((branch) => ({
          branch,
          paths: buildGraphBranchPaths(
            branch.segments.filter(
              (segment) =>
                Math.max(segment.fromRow, segment.toRow) >= renderStart &&
                Math.min(segment.fromRow, segment.toRow) < renderEnd,
            ),
            {
              laneWidth: LANE_WIDTH,
              rowHeight: ROW_HEIGHT,
            },
          ),
        }))
        .filter(({ paths }) => paths.some((path) => path.d)),
    [branches, renderEnd, renderStart],
  );
  const nodeRadius = 4;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible"
      width={Math.max(graphWidth, (laneCount + 1) * LANE_WIDTH)}
      height={totalHeight}
    >
      {branchPaths.flatMap(({ branch, paths }) =>
        paths.map((path, pathIndex) => {
          const stroke = path.isCommitted ? laneColor(branch.color) : "#808080";
          return (
            <g key={`${branch.id}:${pathIndex}`}>
              <path
                d={path.d}
                stroke="var(--editor)"
                strokeWidth={4}
                strokeOpacity={0.75}
                fill="none"
              />
              <path d={path.d} stroke={stroke} strokeWidth={2} fill="none" />
            </g>
          );
        }),
      )}

      {visibleNodes.map((node) => {
        if (node.hash === WORKING_TREE_LAYOUT_HASH) {
          if (!workingTreeVisible) {
            return null;
          }
          const cx = graphLaneX(node.lane, LANE_WIDTH);
          const cy = node.row * ROW_HEIGHT + ROW_HEIGHT / 2;
          return (
            <g key={node.hash}>
              {workingTreeSelected ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={nodeRadius + 3}
                  fill="var(--editor)"
                  stroke="var(--ring)"
                  strokeWidth={2}
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={nodeRadius}
                fill="var(--editor)"
                stroke="#808080"
                strokeWidth={2}
              />
            </g>
          );
        }

        const cx = graphLaneX(node.lane, LANE_WIDTH);
        const cy = node.row * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = laneColor(node.color);
        const commit = commitByHash.get(node.hash);
        const isHead =
          !workingTreeVisible &&
          (node.hash === headHash ||
            (commit?.refs.some((graphRef) => graphRef.isHead) ?? false));
        const selected = selectedHash === node.hash;
        const searchMatch = searchMatches.has(node.hash);
        return (
          <g key={node.hash}>
            {selected || searchMatch ? (
              <circle
                cx={cx}
                cy={cy}
                r={nodeRadius + (selected ? 3 : 2)}
                fill="var(--editor)"
                stroke={selected ? "var(--ring)" : "var(--warning)"}
                strokeWidth={selected ? 2 : 1.5}
              />
            ) : null}
            <circle
              cx={cx}
              cy={cy}
              r={nodeRadius}
              fill={isHead ? "var(--editor)" : color}
              stroke={isHead ? color : "var(--editor)"}
              strokeWidth={isHead ? 2 : 1}
              strokeOpacity={isHead ? 1 : 0.75}
            />
          </g>
        );
      })}
    </svg>
  );
});

function useVirtualRows(args: {
  scrollElement: HTMLDivElement | null;
  rowCount: number;
}) {
  const [viewport, setViewport] = useState({
    height: 0,
    width: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  useLayoutEffect(() => {
    const element = args.scrollElement;
    if (!element) {
      return;
    }
    const update = () =>
      setViewport({
        height: element.clientHeight,
        width: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
      });
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [args.scrollElement]);

  const start = Math.max(
    0,
    Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
  );
  const visibleRows = Math.ceil(viewport.height / ROW_HEIGHT);
  const end = Math.min(args.rowCount, start + visibleRows + OVERSCAN_ROWS * 2);
  return {
    start,
    end,
    viewportWidth: viewport.width,
    scrollLeft: viewport.scrollLeft,
  };
}

function ResizeHandle({
  column,
  width,
  onWidthChange,
}: {
  column: keyof GitGraphColumnWidths;
  width: number;
  onWidthChange: (column: keyof GitGraphColumnWidths, width: number) => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const minWidth = column === "hash" ? 68 : 88;
      const maxWidth = column === "hash" ? 180 : 320;
      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, width + moveEvent.clientX - startX),
        );
        onWidthChange(column, next);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
        cleanupRef.current = null;
      };
      cleanupRef.current?.();
      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup, { once: true });
    },
    [column, onWidthChange, width],
  );

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column} column`}
      className="absolute -left-1 top-0 h-full w-2 cursor-col-resize touch-none hover:bg-primary/30"
      onPointerDown={onPointerDown}
    />
  );
}

export interface GitGraphCanvasHandle {
  scrollToHash: (hash: string) => void;
  scrollToWorkingTree: () => void;
  focus: () => void;
}

export interface GitGraphCanvasProps {
  commits: GraphCommit[];
  headHash: string | null;
  workingTree: GraphWorkingTreeSummary;
  selection: GitGraphSelection;
  searchMatches: ReadonlySet<string>;
  searchQuery: string;
  columns: GitGraphColumnVisibility;
  columnWidths: GitGraphColumnWidths;
  hasMore: boolean;
  loadingMore: boolean;
  onSelectCommit: (hash: string) => void;
  onSelectWorkingTree: () => void;
  onCommitContextMenu: (event: MouseEvent, hash: string) => void;
  onRefContextMenu: (
    event: MouseEvent,
    hash: string,
    graphRef: GraphRef,
  ) => void;
  onRefDoubleClick: (graphRef: GraphRef) => void;
  onColumnWidthChange: (
    column: keyof GitGraphColumnWidths,
    width: number,
  ) => void;
  onEndReached: () => void;
}

export const GitGraphCanvas = forwardRef<
  GitGraphCanvasHandle,
  GitGraphCanvasProps
>(function GitGraphCanvas(
  {
    commits,
    headHash,
    workingTree,
    selection,
    searchMatches,
    searchQuery,
    columns,
    columnWidths,
    hasMore,
    loadingMore,
    onSelectCommit,
    onSelectWorkingTree,
    onCommitContextMenu,
    onRefContextMenu,
    onRefDoubleClick,
    onColumnWidthChange,
    onEndReached,
  },
  forwardedRef,
) {
  const workingTreeVisible = hasWorkingTreeChanges(workingTree);
  const layoutCommits = useMemo<GraphCommit[]>(
    () =>
      workingTreeVisible
        ? [
            {
              hash: WORKING_TREE_LAYOUT_HASH,
              parents: headHash ? [headHash] : [],
              author: "",
              authorEmail: "",
              authorDate: "",
              committerDate: "",
              subject: "Uncommitted changes",
              refs: [],
            },
            ...commits,
          ]
        : commits,
    [commits, headHash, workingTreeVisible],
  );
  const layout = useMemo(
    () =>
      buildGraphLayout(layoutCommits, {
        uncommittedHash: workingTreeVisible
          ? WORKING_TREE_LAYOUT_HASH
          : undefined,
      }),
    [layoutCommits, workingTreeVisible],
  );
  const rowOffset = workingTreeVisible ? 1 : 0;
  const rowCount = layoutCommits.length;
  const graphWidth = Math.max(32, (layout.laneCount + 1) * LANE_WIDTH);
  const longestRefLength = commits.reduce(
    (longest, commit) =>
      Math.max(longest, ...commit.refs.map((graphRef) => graphRef.name.length)),
    0,
  );
  const visibleColumnsWidth =
    (columns.author ? columnWidths.author : 0) +
    (columns.date ? columnWidths.date : 0) +
    (columns.hash ? columnWidths.hash : 0);
  const minWidth =
    Math.max(440, graphWidth + 260 + Math.min(420, longestRefLength * 7)) +
    visibleColumnsWidth;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const virtualRows = useVirtualRows({ scrollElement, rowCount });

  const setScrollRef = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element;
    setScrollElement(element);
  }, []);

  const scrollToRow = useCallback((row: number) => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const top = row * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (
      top < element.scrollTop ||
      bottom > element.scrollTop + element.clientHeight
    ) {
      element.scrollTo({
        top: Math.max(0, top - element.clientHeight / 2 + ROW_HEIGHT / 2),
        behavior: "smooth",
      });
    }
  }, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToHash(hash) {
        const index = commits.findIndex((commit) => commit.hash === hash);
        if (index !== -1) {
          scrollToRow(index + rowOffset);
        }
      },
      scrollToWorkingTree() {
        if (workingTreeVisible) {
          scrollToRow(0);
        }
      },
      focus() {
        scrollRef.current?.focus();
      },
    }),
    [commits, rowOffset, scrollToRow, workingTreeVisible],
  );

  useEffect(() => {
    if (
      hasMore &&
      !loadingMore &&
      virtualRows.end >= Math.max(0, rowCount - 12)
    ) {
      onEndReached();
    }
  }, [hasMore, loadingMore, onEndReached, rowCount, virtualRows.end]);

  const selectedHash = selection?.kind === "commit" ? selection.hash : null;
  const visibleIndexes = [];
  for (let index = virtualRows.start; index < virtualRows.end; index += 1) {
    visibleIndexes.push(index);
  }

  return (
    <div
      role="grid"
      aria-label="Commit graph"
      aria-rowcount={rowCount + 1}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-editor"
    >
      <div className="h-8 shrink-0 overflow-hidden border-b border-border/65 bg-editor-muted/45">
        <div
          role="row"
          className="grid h-full items-center text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
          style={{
            width: Math.max(minWidth, virtualRows.viewportWidth),
            transform: `translateX(${-virtualRows.scrollLeft}px)`,
            gridTemplateColumns: graphGridTemplate({
              columns,
              widths: columnWidths,
            }),
          }}
        >
          <div role="columnheader" className="px-3">
            Graph / Description
          </div>
          {columns.author ? (
            <div
              role="columnheader"
              className="relative h-full border-l border-border/40 px-2.5 py-2"
            >
              <ResizeHandle
                column="author"
                width={columnWidths.author}
                onWidthChange={onColumnWidthChange}
              />
              Author
            </div>
          ) : null}
          {columns.date ? (
            <div
              role="columnheader"
              className="relative h-full border-l border-border/40 px-2.5 py-2"
            >
              <ResizeHandle
                column="date"
                width={columnWidths.date}
                onWidthChange={onColumnWidthChange}
              />
              Date
            </div>
          ) : null}
          {columns.hash ? (
            <div
              role="columnheader"
              className="relative h-full border-l border-border/40 px-2.5 py-2"
            >
              <ResizeHandle
                column="hash"
                width={columnWidths.hash}
                onWidthChange={onColumnWidthChange}
              />
              Commit
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={setScrollRef}
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        <div
          className="relative w-full"
          style={{ height: rowCount * ROW_HEIGHT, minWidth }}
        >
          <GraphSvg
            branches={layout.branches}
            nodes={layout.nodes}
            commits={commits}
            laneCount={layout.laneCount}
            graphWidth={graphWidth}
            workingTreeVisible={workingTreeVisible}
            workingTreeSelected={selection?.kind === WORKING_TREE_SELECTION}
            selectedHash={selectedHash}
            searchMatches={searchMatches}
            headHash={headHash}
            visibleStart={virtualRows.start}
            visibleEnd={virtualRows.end}
          />

          {visibleIndexes.map((rowIndex) => {
            if (workingTreeVisible && rowIndex === 0) {
              return (
                <div
                  key={WORKING_TREE_SELECTION}
                  className="absolute left-0 right-0"
                  style={{ top: 0, height: ROW_HEIGHT }}
                >
                  <GitGraphWorkingTreeRow
                    summary={workingTree}
                    graphWidth={graphWidth}
                    columns={columns}
                    columnWidths={columnWidths}
                    isSelected={selection?.kind === WORKING_TREE_SELECTION}
                    onClick={onSelectWorkingTree}
                  />
                </div>
              );
            }
            const commitIndex = rowIndex - rowOffset;
            const commit = commits[commitIndex];
            if (!commit) {
              return null;
            }
            return (
              <div
                key={commit.hash}
                className="absolute left-0 right-0"
                style={{
                  top: rowIndex * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                }}
              >
                <GitGraphRow
                  commit={commit}
                  graphWidth={graphWidth}
                  columns={columns}
                  columnWidths={columnWidths}
                  isSelected={selectedHash === commit.hash}
                  isSearchMatch={searchMatches.has(commit.hash)}
                  searchQuery={searchQuery}
                  onClick={onSelectCommit}
                  onContextMenu={onCommitContextMenu}
                  onRefContextMenu={onRefContextMenu}
                  onRefDoubleClick={onRefDoubleClick}
                />
              </div>
            );
          })}
        </div>
        {loadingMore ? (
          <div className="sticky bottom-2 ml-auto mr-2 flex w-max items-center gap-1.5 rounded-md border border-border/70 bg-popover/95 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
            <Loader aria-hidden size="xs" variant="scan" />
            Loading more commits…
          </div>
        ) : null}
      </div>
    </div>
  );
});

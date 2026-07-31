import * as React from "react";
import { GitBranch, Tag } from "lucide-react";
import type {
  GraphCommit,
  GraphRef,
  GraphRefType,
  GraphWorkingTreeSummary,
} from "@/lib/git-graph/types";
import { cn } from "@/lib/utils";
import type { GitGraphColumnVisibility } from "./GitGraphToolbar";

export const ROW_HEIGHT = 24;
export const LANE_WIDTH = 16;

export interface GitGraphColumnWidths {
  author: number;
  date: number;
  hash: number;
}

function formatRelativeDate(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return iso;
  }
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const absoluteSeconds = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absoluteSeconds < 60) {
    return formatter.format(seconds, "second");
  }
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) {
    return formatter.format(days, "day");
  }
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) {
    return formatter.format(months, "month");
  }
  return formatter.format(Math.round(months / 12), "year");
}

export function graphGridTemplate(args: {
  columns: GitGraphColumnVisibility;
  widths: GitGraphColumnWidths;
}): string {
  return [
    "minmax(22rem, 1fr)",
    args.columns.author ? `${args.widths.author}px` : null,
    args.columns.date ? `${args.widths.date}px` : null,
    args.columns.hash ? `${args.widths.hash}px` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

const REF_STYLES: Record<GraphRefType, string> = {
  head: "border-primary/35 bg-primary/12 text-primary",
  localBranch: "border-success/35 bg-success/10 text-success",
  remoteBranch: "border-info/35 bg-info/10 text-info",
  tag: "border-warning/40 bg-warning/12 text-warning",
};

function HighlightText({ value, query }: { value: string; query: string }) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return value;
  }
  const index = value.toLocaleLowerCase().indexOf(normalizedQuery);
  if (index === -1) {
    return value;
  }
  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded-sm bg-warning/30 px-0.5 text-inherit">
        {value.slice(index, index + normalizedQuery.length)}
      </mark>
      {value.slice(index + normalizedQuery.length)}
    </>
  );
}

function RefLabel({
  graphRef,
  onContextMenu,
  onDoubleClick,
}: {
  graphRef: GraphRef;
  onContextMenu: (event: React.MouseEvent, graphRef: GraphRef) => void;
  onDoubleClick: (graphRef: GraphRef) => void;
}) {
  const Icon = graphRef.type === "tag" ? Tag : GitBranch;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-[10px] font-medium leading-none",
        REF_STYLES[graphRef.type],
        graphRef.isHead && "ring-1 ring-primary/30",
      )}
      title={graphRef.isHead ? `${graphRef.name} (HEAD)` : graphRef.name}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(graphRef);
      }}
      onContextMenu={(event) => {
        event.stopPropagation();
        onContextMenu(event, graphRef);
      }}
    >
      <Icon className="size-2.5" />
      {graphRef.name}
      {graphRef.isHead ? (
        <span className="text-[8px] font-semibold uppercase tracking-wide">
          head
        </span>
      ) : null}
    </span>
  );
}

export interface GitGraphRowProps {
  commit: GraphCommit;
  graphWidth: number;
  columns: GitGraphColumnVisibility;
  columnWidths: GitGraphColumnWidths;
  isSelected: boolean;
  isSearchMatch: boolean;
  searchQuery: string;
  onClick: (hash: string) => void;
  onContextMenu: (event: React.MouseEvent, hash: string) => void;
  onRefContextMenu: (
    event: React.MouseEvent,
    hash: string,
    graphRef: GraphRef,
  ) => void;
  onRefDoubleClick: (graphRef: GraphRef) => void;
}

export const GitGraphRow = React.memo(function GitGraphRow({
  commit,
  graphWidth,
  columns,
  columnWidths,
  isSelected,
  isSearchMatch,
  searchQuery,
  onClick,
  onContextMenu,
  onRefContextMenu,
  onRefDoubleClick,
}: GitGraphRowProps) {
  return (
    <div
      role="row"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "grid cursor-default select-none items-center border-b border-border/30 text-xs outline-none transition-colors",
        "hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
        isSelected && "bg-accent/65 text-accent-foreground",
        isSearchMatch && !isSelected && "bg-warning/8",
      )}
      style={{
        height: ROW_HEIGHT,
        gridTemplateColumns: graphGridTemplate({
          columns,
          widths: columnWidths,
        }),
      }}
      onClick={() => onClick(commit.hash)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(commit.hash);
        }
      }}
      onContextMenu={(event) => onContextMenu(event, commit.hash)}
      data-commit-hash={commit.hash}
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-1.5 pr-3">
        <span
          className="shrink-0"
          style={{ width: graphWidth }}
          aria-hidden="true"
        />
        <span
          className="min-w-[5rem] flex-1 truncate font-medium text-foreground"
          title={commit.subject}
        >
          <HighlightText value={commit.subject} query={searchQuery} />
        </span>
        {commit.refs.length > 0 ? (
          <span className="flex shrink-0 items-center gap-1">
            {commit.refs.map((graphRef) => (
              <RefLabel
                key={`${graphRef.type}:${graphRef.name}`}
                graphRef={graphRef}
                onDoubleClick={onRefDoubleClick}
                onContextMenu={(event, ref) =>
                  onRefContextMenu(event, commit.hash, ref)
                }
              />
            ))}
          </span>
        ) : null}
      </div>
      {columns.author ? (
        <div
          role="gridcell"
          className="truncate border-l border-border/25 px-2.5 text-muted-foreground"
          title={
            commit.authorEmail
              ? `${commit.author} <${commit.authorEmail}>`
              : commit.author
          }
        >
          <HighlightText value={commit.author} query={searchQuery} />
        </div>
      ) : null}
      {columns.date ? (
        <div
          role="gridcell"
          className="truncate border-l border-border/25 px-2.5 text-muted-foreground tabular-nums"
          title={commit.authorDate}
        >
          {formatRelativeDate(commit.authorDate)}
        </div>
      ) : null}
      {columns.hash ? (
        <div
          role="gridcell"
          className="truncate border-l border-border/25 px-2.5 font-mono text-[10px] text-muted-foreground"
          title={commit.hash}
        >
          <HighlightText value={commit.hash.slice(0, 8)} query={searchQuery} />
        </div>
      ) : null}
    </div>
  );
});

export function GitGraphWorkingTreeRow({
  summary,
  graphWidth,
  columns,
  columnWidths,
  isSelected,
  onClick,
}: {
  summary: GraphWorkingTreeSummary;
  graphWidth: number;
  columns: GitGraphColumnVisibility;
  columnWidths: GitGraphColumnWidths;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total =
    summary.staged + summary.unstaged + summary.untracked + summary.conflicts;
  return (
    <div
      role="row"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "grid cursor-default select-none items-center border-b border-border/45 bg-editor-muted/35 text-xs outline-none hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
        isSelected && "bg-accent/65",
      )}
      style={{
        height: ROW_HEIGHT,
        gridTemplateColumns: graphGridTemplate({
          columns,
          widths: columnWidths,
        }),
      }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      data-working-tree-row=""
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-2 pr-3">
        <span
          className="shrink-0"
          style={{ width: graphWidth }}
          aria-hidden="true"
        />
        <span className="font-medium text-foreground">Uncommitted changes</span>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {total} {total === 1 ? "change" : "changes"}
        </span>
        {summary.conflicts > 0 ? (
          <span className="text-[10px] font-medium text-destructive">
            {summary.conflicts} conflicts
          </span>
        ) : null}
      </div>
      {columns.author ? (
        <div role="gridcell" className="border-l border-border/25 px-2.5" />
      ) : null}
      {columns.date ? (
        <div role="gridcell" className="border-l border-border/25 px-2.5" />
      ) : null}
      {columns.hash ? (
        <div role="gridcell" className="border-l border-border/25 px-2.5" />
      ) : null}
    </div>
  );
}

import * as React from "react";
import { GitBranch, Tag } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import type {
  GraphCommit,
  GraphRef,
  GraphWorkingTreeSummary,
} from "@/lib/git-graph/types";
import type { GitGraphColumnVisibility } from "./GitGraphToolbar";
import {
  gitGraphRefTypeStyles,
  gitGraphRowStyles as styles,
} from "./git-graph-row.styles";

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
      <mark className={sx(styles.highlightMark)}>
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
      className={sx(
        styles.refLabel,
        gitGraphRefTypeStyles[graphRef.type],
        graphRef.isHead && styles.refHead,
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
      <Icon className={sx(styles.refIcon)} />
      {graphRef.name}
      {graphRef.isHead ? (
        <span className={sx(styles.refHeadTag)}>head</span>
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
      className={sx(
        styles.row,
        transition.colors,
        focusRing.ring,
        focusRing.ringInset,
        isSelected && styles.rowSelected,
        isSearchMatch && !isSelected && styles.rowSearchMatch,
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
      <div role="gridcell" className={sx(styles.leadCell)}>
        <span
          className={sx(styles.laneSpacer)}
          style={{ width: graphWidth }}
          aria-hidden="true"
        />
        <span className={sx(styles.subject)} title={commit.subject}>
          <HighlightText value={commit.subject} query={searchQuery} />
        </span>
        {commit.refs.length > 0 ? (
          <span className={sx(styles.refList)}>
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
          className={sx(styles.cell)}
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
          className={sx(styles.cell, styles.cellDate)}
          title={commit.authorDate}
        >
          {formatRelativeDate(commit.authorDate)}
        </div>
      ) : null}
      {columns.hash ? (
        <div
          role="gridcell"
          className={sx(styles.cell, styles.cellHash)}
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
      className={sx(
        styles.workingTreeRow,
        focusRing.ring,
        focusRing.ringInset,
        isSelected && styles.workingTreeRowSelected,
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
      <div role="gridcell" className={sx(styles.workingTreeLeadCell)}>
        <span
          className={sx(styles.laneSpacer)}
          style={{ width: graphWidth }}
          aria-hidden="true"
        />
        <span className={sx(styles.workingTreeLabel)}>Uncommitted changes</span>
        <span className={sx(styles.workingTreeBadge)}>
          {total} {total === 1 ? "change" : "changes"}
        </span>
        {summary.conflicts > 0 ? (
          <span className={sx(styles.workingTreeConflicts)}>
            {summary.conflicts} conflicts
          </span>
        ) : null}
      </div>
      {columns.author ? (
        <div role="gridcell" className={sx(styles.emptyCell)} />
      ) : null}
      {columns.date ? (
        <div role="gridcell" className={sx(styles.emptyCell)} />
      ) : null}
      {columns.hash ? (
        <div role="gridcell" className={sx(styles.emptyCell)} />
      ) : null}
    </div>
  );
}

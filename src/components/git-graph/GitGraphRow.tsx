import * as React from "react";
import type { GraphCommit, GraphRef, GraphRefType } from "@/lib/git-graph/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ROW_HEIGHT = 28;
export const LANE_WIDTH = 14;

// Map ref type to a badge variant meaningful in context
const REF_VARIANT_MAP: Record<GraphRefType, "default" | "secondary" | "success" | "outline"> = {
  head: "default",
  localBranch: "success",
  remoteBranch: "secondary",
  tag: "outline",
};

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

export interface GitGraphRowProps {
  commit: GraphCommit;
  laneCount: number;
  isSelected: boolean;
  onClick: (hash: string) => void;
  onContextMenu: (e: React.MouseEvent, hash: string) => void;
  onRefContextMenu: (e: React.MouseEvent, hash: string, ref: GraphRef) => void;
}

export const GitGraphRow = React.memo(function GitGraphRow({
  commit,
  laneCount,
  isSelected,
  onClick,
  onContextMenu,
  onRefContextMenu,
}: GitGraphRowProps) {
  const spacerWidth = laneCount * LANE_WIDTH;

  return (
    <div
      role="row"
      aria-selected={isSelected}
      className={cn(
        "flex items-center gap-1.5 px-2 text-xs cursor-pointer select-none overflow-hidden",
        "hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent text-accent-foreground",
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onClick(commit.hash)}
      onContextMenu={(e) => onContextMenu(e, commit.hash)}
    >
      {/* Left spacer to clear the SVG lane column */}
      <div style={{ width: spacerWidth, flexShrink: 0 }} aria-hidden="true" />

      {/* Subject — grows to fill leftover space, yields to ref badges first */}
      <span
        className="flex-1 truncate font-medium text-foreground min-w-[6rem]"
        title={commit.subject}
      >
        {commit.subject}
      </span>

      {/* Ref badges — sized to their full name; only shrink when the row runs out of room */}
      {commit.refs.length > 0 && (
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {commit.refs.map((ref) => (
            <Badge
              key={`${ref.type}:${ref.name}`}
              variant={REF_VARIANT_MAP[ref.type] ?? "outline"}
              className="cursor-pointer text-[10px] h-4 px-1.5 min-w-0 shrink"
              title={ref.name}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.stopPropagation();
                onRefContextMenu(e, commit.hash, ref);
              }}
            >
              {/* Inner span keeps text-overflow working — the badge itself is a
                  flex container, where `text-ellipsis` has no effect. */}
              <span className="min-w-0 truncate">{ref.name}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Author */}
      <span
        className="text-muted-foreground shrink-0 hidden sm:block max-w-[80px] truncate"
        title={commit.author}
      >
        {commit.author}
      </span>

      {/* Date */}
      <span
        className="text-muted-foreground shrink-0 tabular-nums"
        title={commit.authorDate}
      >
        {formatRelativeDate(commit.authorDate)}
      </span>
    </div>
  );
});

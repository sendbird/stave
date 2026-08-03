import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  GitBranch,
  LoaderCircle,
  LocateFixed,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import type {
  GraphRepositoryRef,
  GraphWorkingTreeSummary,
} from "@/lib/git-graph/types";
import { MAX_GRAPH_SELECTED_REFS } from "@/lib/git-graph/types";
import { cn } from "@/lib/utils";

export interface GitGraphColumnVisibility {
  author: boolean;
  date: boolean;
  hash: boolean;
}

interface GitGraphToolbarProps {
  head: string | null;
  availableRefs: GraphRepositoryRef[];
  selectedRefs: string[];
  workingTree: GraphWorkingTreeSummary;
  workingTreeAvailable: boolean;
  loadedCount: number;
  hasMore: boolean;
  loading: boolean;
  fetching: boolean;
  searchQuery: string;
  matchPosition: number;
  matchCount: number;
  columns: GitGraphColumnVisibility;
  onSelectedRefsChange: (refs: string[]) => void;
  onSearchQueryChange: (query: string) => void;
  onPreviousMatch: () => void;
  onNextMatch: () => void;
  onLocateHead: () => void;
  onFetch: () => void;
  onRefresh: () => void;
  onColumnsChange: (columns: GitGraphColumnVisibility) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

function BranchFilter({
  head,
  availableRefs,
  selectedRefs,
  onSelectedRefsChange,
}: Pick<
  GitGraphToolbarProps,
  "head" | "availableRefs" | "selectedRefs" | "onSelectedRefsChange"
>) {
  const localRefs = availableRefs.filter((ref) => ref.type === "localBranch");
  const remoteRefs = availableRefs.filter((ref) => ref.type === "remoteBranch");
  const headRef = localRefs.find((ref) => ref.isHead);
  const refByRevision = new Map(
    availableRefs.map((ref) => [ref.revision, ref]),
  );
  const selected = new Set(selectedRefs);
  const selectionLimitReached = selectedRefs.length >= MAX_GRAPH_SELECTED_REFS;
  const label =
    selectedRefs.length === 0
      ? "All branches"
      : selectedRefs.length === 1
        ? (refByRevision.get(selectedRefs[0] ?? "")?.name ?? selectedRefs[0])
        : `${selectedRefs.length} branches`;

  function toggleRef(name: string, checked: boolean) {
    const next = new Set(selectedRefs);
    if (checked) {
      if (next.size >= MAX_GRAPH_SELECTED_REFS) {
        return;
      }
      next.add(name);
    } else {
      next.delete(name);
    }
    onSelectedRefsChange(Array.from(next));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full min-w-0 max-w-56 justify-start gap-1.5 px-2.5 text-xs @min-[30rem]/git-graph-toolbar:w-auto"
            aria-label={`Branch filter: ${label}`}
          />
        }
      >
        <GitBranch className="size-3.5 text-primary" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>History scope</DropdownMenuLabel>
        {selectionLimitReached ? (
          <DropdownMenuLabel className="text-[10px] font-normal text-warning">
            Select up to {MAX_GRAPH_SELECTED_REFS} branches.
          </DropdownMenuLabel>
        ) : null}
        <DropdownMenuItem onSelect={() => onSelectedRefsChange([])}>
          All local and remote branches
        </DropdownMenuItem>
        {head && headRef ? (
          <DropdownMenuItem
            onSelect={() => onSelectedRefsChange([headRef.revision])}
          >
            Current branch · {head}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {localRefs.length > 0 ? (
          <>
            <DropdownMenuLabel>Local branches</DropdownMenuLabel>
            {localRefs.map((ref) => (
              <DropdownMenuCheckboxItem
                key={`local:${ref.name}`}
                checked={selected.has(ref.revision)}
                disabled={selectionLimitReached && !selected.has(ref.revision)}
                onCheckedChange={(checked) =>
                  toggleRef(ref.revision, checked === true)
                }
              >
                <span className="truncate">{ref.name}</span>
                {ref.isHead ? (
                  <span className="ml-auto text-[10px] font-medium text-primary">
                    HEAD
                  </span>
                ) : null}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
        {remoteRefs.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Remote branches</DropdownMenuLabel>
            {remoteRefs.map((ref) => (
              <DropdownMenuCheckboxItem
                key={`remote:${ref.name}`}
                checked={selected.has(ref.revision)}
                disabled={selectionLimitReached && !selected.has(ref.revision)}
                onCheckedChange={(checked) =>
                  toggleRef(ref.revision, checked === true)
                }
              >
                <span className="truncate">{ref.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkingTreeStatus({
  summary,
  available,
}: {
  summary: GraphWorkingTreeSummary;
  available: boolean;
}) {
  if (!available) {
    return (
      <span
        className="flex items-center gap-1 text-[10px] text-warning"
        title="Working tree status is too large or unavailable."
        role="status"
        aria-label="Working tree status unavailable"
      >
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        <span className="hidden @min-[62rem]/git-graph-toolbar:inline">
          status unavailable
        </span>
      </span>
    );
  }
  const entries = [
    { label: "staged", value: summary.staged, className: "text-success" },
    { label: "changed", value: summary.unstaged, className: "text-warning" },
    { label: "untracked", value: summary.untracked, className: "text-info" },
    {
      label: "conflicts",
      value: summary.conflicts,
      className: "text-destructive",
    },
  ].filter((entry) => entry.value > 0);

  if (entries.length === 0) {
    return (
      <span className="hidden text-[10px] text-muted-foreground @min-[62rem]/git-graph-toolbar:inline">
        clean
      </span>
    );
  }

  return (
    <span className="hidden items-center gap-1.5 @min-[62rem]/git-graph-toolbar:flex">
      {entries.map((entry) => (
        <span
          key={entry.label}
          className={cn("text-[10px] tabular-nums", entry.className)}
          title={`${entry.value} ${entry.label}`}
        >
          {entry.value} {entry.label}
        </span>
      ))}
    </span>
  );
}

export function GitGraphToolbar({
  head,
  availableRefs,
  selectedRefs,
  workingTree,
  workingTreeAvailable,
  loadedCount,
  hasMore,
  loading,
  fetching,
  searchQuery,
  matchPosition,
  matchCount,
  columns,
  onSelectedRefsChange,
  onSearchQueryChange,
  onPreviousMatch,
  onNextMatch,
  onLocateHead,
  onFetch,
  onRefresh,
  onColumnsChange,
  searchInputRef,
}: GitGraphToolbarProps) {
  return (
    <div
      className="@container/git-graph-toolbar grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-b border-border/75 bg-editor px-2.5 py-1.5 @min-[30rem]/git-graph-toolbar:grid-cols-[minmax(0,auto)_minmax(7rem,1fr)_auto]"
      data-testid="git-graph-toolbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        <BranchFilter
          head={head}
          availableRefs={availableRefs}
          selectedRefs={selectedRefs}
          onSelectedRefsChange={onSelectedRefsChange}
        />
        <WorkingTreeStatus
          summary={workingTree}
          available={workingTreeAvailable}
        />
      </div>

      <div className="relative col-span-2 row-start-2 min-w-0 @min-[30rem]/git-graph-toolbar:col-span-1 @min-[30rem]/git-graph-toolbar:col-start-2 @min-[30rem]/git-graph-toolbar:row-start-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className={cn(
            "h-8 rounded-md bg-background/60 pl-8 text-xs",
            searchQuery ? "pr-36" : "pr-16",
          )}
          placeholder="Find commits, authors, refs…"
          aria-label="Find commits"
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {searchQuery ? (
            <span className="mr-0.5 text-[10px] tabular-nums text-muted-foreground">
              {matchCount > 0 ? `${matchPosition}/${matchCount}` : "No matches"}
            </span>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="size-6"
            disabled={matchCount === 0}
            onClick={onPreviousMatch}
            aria-label="Previous search match"
          >
            <ChevronUp className="size-3" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="size-6"
            disabled={matchCount === 0}
            onClick={onNextMatch}
            aria-label="Next search match"
          >
            <ChevronDown className="size-3" />
          </Button>
          {searchQuery ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-6"
              onClick={() => onSearchQueryChange("")}
              aria-label="Clear commit search"
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <TooltipProvider>
        <div className="col-start-2 row-start-1 flex items-center gap-0.5 @min-[30rem]/git-graph-toolbar:col-start-3">
          <span className="mr-1 hidden text-[10px] tabular-nums text-muted-foreground @min-[48rem]/git-graph-toolbar:inline">
            {loadedCount}
            {hasMore ? "+" : ""} commits
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-8"
                  onClick={onLocateHead}
                  aria-label="Locate HEAD"
                />
              }
            >
              <LocateFixed className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Locate HEAD (Ctrl/Cmd H)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-8"
                  disabled={fetching}
                  onClick={onFetch}
                  aria-label="Fetch all remotes"
                />
              }
            >
              {fetching ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>Fetch all remotes</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-8"
                        aria-label="Choose visible graph columns"
                      />
                    }
                  />
                }
              >
                <Columns3 className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Visible columns</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {(
                [
                  ["author", "Author"],
                  ["date", "Date"],
                  ["hash", "Commit"],
                ] as const
              ).map(([column, label]) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={columns[column]}
                  onCheckedChange={(checked) =>
                    onColumnsChange({
                      ...columns,
                      [column]: checked === true,
                    })
                  }
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-8"
                  disabled={loading}
                  onClick={onRefresh}
                  aria-label="Refresh commit graph"
                />
              }
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
            </TooltipTrigger>
            <TooltipContent>Refresh (Ctrl/Cmd R)</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  GitBranch,
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
  Loader,
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
import { sx } from "@/components/ads/utils/stylex";
import { gitGraphToolbarStyles as styles } from "./git-graph-toolbar.styles";

export interface GitGraphColumnVisibility {
  author: boolean;
  date: boolean;
  hash: boolean;
}

export function shouldSeparateRemoteBranches(args: {
  localBranchCount: number;
  remoteBranchCount: number;
}) {
  return args.localBranchCount > 0 && args.remoteBranchCount > 0;
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
            xstyle={styles.branchTrigger}
            aria-label={`Branch filter: ${label}`}
          />
        }
      >
        <GitBranch className={sx(styles.branchIcon)} />
        <span className={sx(styles.branchLabel)}>{label}</span>
        <ChevronDown className={sx(styles.chevronMuted)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={sx(styles.branchMenu)}>
        <DropdownMenuLabel>History scope</DropdownMenuLabel>
        {selectionLimitReached ? (
          <DropdownMenuLabel className={sx(styles.limitLabel)}>
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
                <span className={sx(styles.truncate)}>{ref.name}</span>
                {ref.isHead ? (
                  <span className={sx(styles.headBadge)}>HEAD</span>
                ) : null}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
        {remoteRefs.length > 0 ? (
          <>
            {shouldSeparateRemoteBranches({
              localBranchCount: localRefs.length,
              remoteBranchCount: remoteRefs.length,
            }) ? (
              <DropdownMenuSeparator />
            ) : null}
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
                <span className={sx(styles.truncate)}>{ref.name}</span>
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
        className={sx(styles.statusUnavailable)}
        title="Working tree status is too large or unavailable."
        role="status"
        aria-label="Working tree status unavailable"
      >
        <AlertTriangle className={sx(styles.statusIcon)} aria-hidden="true" />
        <span className={sx(styles.statusUnavailableText)}>
          status unavailable
        </span>
      </span>
    );
  }
  const entries = [
    { label: "staged", value: summary.staged, tone: styles.statusEntryStaged },
    {
      label: "changed",
      value: summary.unstaged,
      tone: styles.statusEntryChanged,
    },
    {
      label: "untracked",
      value: summary.untracked,
      tone: styles.statusEntryUntracked,
    },
    {
      label: "conflicts",
      value: summary.conflicts,
      tone: styles.statusEntryConflicts,
    },
  ].filter((entry) => entry.value > 0);

  if (entries.length === 0) {
    return <span className={sx(styles.statusClean)}>clean</span>;
  }

  return (
    <span className={sx(styles.statusEntries)}>
      {entries.map((entry) => (
        <span
          key={entry.label}
          className={sx(styles.statusEntry, entry.tone)}
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
    <div className={sx(styles.root)} data-testid="git-graph-toolbar">
      <div className={sx(styles.leftGroup)}>
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

      <div className={sx(styles.searchWrap)}>
        <Search className={sx(styles.searchIcon)} />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          xstyle={[
            styles.searchInput,
            searchQuery
              ? styles.searchInputWithMatches
              : styles.searchInputNoMatches,
          ]}
          placeholder="Find commits, authors, refs…"
          aria-label="Find commits"
        />
        <div className={sx(styles.searchControls)}>
          {searchQuery ? (
            <span className={sx(styles.matchCount)}>
              {matchCount > 0 ? `${matchPosition}/${matchCount}` : "No matches"}
            </span>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            xstyle={styles.iconButtonSm}
            disabled={matchCount === 0}
            onClick={onPreviousMatch}
            aria-label="Previous search match"
          >
            <ChevronUp className={sx(styles.iconGlyphSm)} />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            xstyle={styles.iconButtonSm}
            disabled={matchCount === 0}
            onClick={onNextMatch}
            aria-label="Next search match"
          >
            <ChevronDown className={sx(styles.iconGlyphSm)} />
          </Button>
          {searchQuery ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              xstyle={styles.iconButtonSm}
              onClick={() => onSearchQueryChange("")}
              aria-label="Clear commit search"
            >
              <X className={sx(styles.iconGlyphSm)} />
            </Button>
          ) : null}
        </div>
      </div>

      <TooltipProvider>
        <div className={sx(styles.rightGroup)}>
          <span className={sx(styles.commitCount)}>
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
                  xstyle={styles.iconButtonMd}
                  onClick={onLocateHead}
                  aria-label="Locate HEAD"
                />
              }
            >
              <LocateFixed className={sx(styles.iconGlyphMd)} />
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
                  xstyle={styles.iconButtonMd}
                  disabled={fetching}
                  onClick={onFetch}
                  aria-label="Fetch all remotes"
                />
              }
            >
              {fetching ? (
                <Loader aria-hidden size="xs" variant="scan" />
              ) : (
                <Download className={sx(styles.iconGlyphMd)} />
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
                        xstyle={styles.iconButtonMd}
                        aria-label="Choose visible graph columns"
                      />
                    }
                  />
                }
              >
                <Columns3 className={sx(styles.iconGlyphMd)} />
              </TooltipTrigger>
              <TooltipContent>Visible columns</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className={sx(styles.columnsMenu)}>
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
                  xstyle={styles.iconButtonMd}
                  disabled={loading}
                  onClick={onRefresh}
                  aria-label="Refresh commit graph"
                />
              }
            >
              <RefreshCw
                className={sx(
                  styles.iconGlyphMd,
                  loading && styles.refreshSpin,
                )}
              />
            </TooltipTrigger>
            <TooltipContent>Refresh (Ctrl/Cmd R)</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

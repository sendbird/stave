import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AlertCircle, GitGraph, LoaderCircle, X } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { findGraphCommitMatches } from "@/lib/git-graph/search";
import { formatSourceControlDiffPath } from "@/lib/source-control-diff";
import type { GraphFileChange, GraphRef } from "@/lib/git-graph/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { CommitContextMenu } from "./CommitContextMenu";
import { CommitDetailPanel } from "./CommitDetailPanel";
import { GitGraphCanvas, type GitGraphCanvasHandle } from "./GitGraphCanvas";
import {
  GitGraphToolbar,
  type GitGraphColumnVisibility,
} from "./GitGraphToolbar";
import { RefContextMenu } from "./RefContextMenu";
import type { GitGraphColumnWidths } from "./GitGraphRow";
import {
  checkoutBranch,
  checkoutCommit,
  cherryPickCommit,
  createBranchFrom,
  createTag,
  deleteBranch,
  deleteTag,
  fetchAllRemotes,
  loadCommitDiff,
  loadWorkingTreeDiff,
  mergeBranch,
  pushBranch,
  rebaseBranch,
  renameBranch,
  resetCommit,
  revertCommit,
} from "./git-graph-actions";
import { WORKING_TREE_SELECTION, useGitGraphData } from "./useGitGraphData";

const PREFERENCES_KEY = "stave:git-graph-preferences:v1";
const DEFAULT_COLUMNS: GitGraphColumnVisibility = {
  author: true,
  date: true,
  hash: true,
};
const DEFAULT_COLUMN_WIDTHS: GitGraphColumnWidths = {
  author: 150,
  date: 118,
  hash: 82,
};

interface GitGraphPreferences {
  columns: GitGraphColumnVisibility;
  columnWidths: GitGraphColumnWidths;
  detailWidth: number;
  detailHeight: number;
}

const DEFAULT_PREFERENCES: GitGraphPreferences = {
  columns: DEFAULT_COLUMNS,
  columnWidths: DEFAULT_COLUMN_WIDTHS,
  detailWidth: 370,
  detailHeight: 270,
};

function boundedPreference(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function readPreferences(): GitGraphPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(PREFERENCES_KEY) ?? "{}",
    ) as Partial<GitGraphPreferences>;
    return {
      columns: {
        author:
          typeof stored.columns?.author === "boolean"
            ? stored.columns.author
            : DEFAULT_COLUMNS.author,
        date:
          typeof stored.columns?.date === "boolean"
            ? stored.columns.date
            : DEFAULT_COLUMNS.date,
        hash:
          typeof stored.columns?.hash === "boolean"
            ? stored.columns.hash
            : DEFAULT_COLUMNS.hash,
      },
      columnWidths: {
        author: boundedPreference(
          stored.columnWidths?.author,
          DEFAULT_COLUMN_WIDTHS.author,
          88,
          320,
        ),
        date: boundedPreference(
          stored.columnWidths?.date,
          DEFAULT_COLUMN_WIDTHS.date,
          88,
          320,
        ),
        hash: boundedPreference(
          stored.columnWidths?.hash,
          DEFAULT_COLUMN_WIDTHS.hash,
          68,
          180,
        ),
      },
      detailWidth: boundedPreference(
        stored.detailWidth,
        DEFAULT_PREFERENCES.detailWidth,
        220,
        1_000,
      ),
      detailHeight: boundedPreference(
        stored.detailHeight,
        DEFAULT_PREFERENCES.detailHeight,
        220,
        800,
      ),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persistPreferences(preferences: GitGraphPreferences) {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional; private browsing and storage policies may
    // reject localStorage writes without affecting graph functionality.
  }
}

interface GitGraphViewProps {
  workspaceCwd: string | undefined;
}

interface ActionResult {
  ok: boolean;
  stderr?: string;
}

function workingTreeDirty(args: {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
}) {
  return args.staged + args.unstaged + args.untracked + args.conflicts > 0;
}

function operationError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function exactRevision(graphRef: GraphRef) {
  return graphRef.revision ?? graphRef.name;
}

function checkoutRevision(
  graphRef: GraphRef,
  repositoryRefs: readonly GraphRef[],
) {
  if (graphRef.type !== "remoteBranch") {
    return graphRef.type === "localBranch"
      ? graphRef.name
      : exactRevision(graphRef);
  }
  const remotePrefix = graphRef.remote
    ? `${graphRef.remote}/`
    : `${graphRef.name.split("/")[0] ?? ""}/`;
  const localName = graphRef.name.startsWith(remotePrefix)
    ? graphRef.name.slice(remotePrefix.length)
    : graphRef.name;
  return repositoryRefs.some(
    (candidate) =>
      candidate.type === "localBranch" && candidate.name === localName,
  )
    ? localName
    : exactRevision(graphRef);
}

export function GitGraphView({ workspaceCwd }: GitGraphViewProps) {
  const {
    graph,
    selectedRefs,
    selection,
    details,
    workingTreeFiles,
    loading,
    loadingMore,
    detailsLoading,
    error,
    setError,
    setSelectedRefs,
    reload,
    loadMore,
    selectCommit,
    selectWorkingTree,
    clearSelection,
  } = useGitGraphData(workspaceCwd);
  const [preferences, setPreferences] = useState(readPreferences);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [detailLocation, setDetailLocation] = useState<"right" | "bottom">(
    "right",
  );
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const [commitMenu, setCommitMenu] = useState<{
    x: number;
    y: number;
    hash: string;
    subject: string;
  } | null>(null);
  const [refMenu, setRefMenu] = useState<{
    x: number;
    y: number;
    ref: GraphRef;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<GitGraphCanvasHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const mutationInFlightRef = useRef(false);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);

  useEffect(() => {
    persistPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const update = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setRootSize({ width, height });
      setDetailLocation(width < 820 ? "bottom" : "right");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const searchMatchHashes = useMemo(
    () => findGraphCommitMatches(graph.commits, searchQuery),
    [graph.commits, searchQuery],
  );
  const searchMatches = useMemo(
    () => new Set(searchMatchHashes),
    [searchMatchHashes],
  );
  const activeMatchHash =
    searchMatchHashes.length > 0
      ? searchMatchHashes[
          Math.min(activeMatchIndex, searchMatchHashes.length - 1)
        ]
      : null;

  useEffect(() => {
    setActiveMatchIndex(0);
    const firstMatch = searchMatchHashes[0];
    if (firstMatch) {
      canvasRef.current?.scrollToHash(firstMatch);
    }
  }, [searchMatchHashes]);

  const selectedCommit = useMemo(() => {
    if (selection?.kind !== "commit") {
      return null;
    }
    return (
      graph.commits.find((commit) => commit.hash === selection.hash) ?? null
    );
  }, [graph.commits, selection]);
  const effectiveDetailWidth =
    rootSize.width > 0
      ? Math.min(preferences.detailWidth, Math.max(320, rootSize.width * 0.62))
      : preferences.detailWidth;
  const effectiveDetailHeight =
    rootSize.height > 0
      ? Math.min(
          preferences.detailHeight,
          Math.max(220, rootSize.height * 0.65),
        )
      : preferences.detailHeight;

  const runMutation = useCallback(
    async (
      label: string,
      operation: () => Promise<ActionResult>,
      options: { reload?: boolean } = {},
    ): Promise<boolean> => {
      if (mutationInFlightRef.current) {
        return false;
      }
      mutationInFlightRef.current = true;
      setPendingAction(label);
      setError("");
      try {
        const result = await operation();
        if (!result.ok) {
          const message = result.stderr || `${label} failed.`;
          setError(message);
          toast.error(label, { description: message });
          return false;
        }
        toast.success(label);
        if (options.reload !== false) {
          await reload();
        }
        return true;
      } catch (requestFailure) {
        const message = operationError(requestFailure, `${label} failed.`);
        setError(message);
        toast.error(label, { description: message });
        return false;
      } finally {
        mutationInFlightRef.current = false;
        setPendingAction("");
      }
    },
    [reload, setError],
  );

  const handleFetch = useCallback(async () => {
    if (!workspaceCwd || fetching) {
      return;
    }
    setFetching(true);
    try {
      await runMutation("Fetched all remotes", () =>
        fetchAllRemotes(workspaceCwd),
      );
    } finally {
      setFetching(false);
    }
  }, [fetching, runMutation, workspaceCwd]);

  const handleOpenFile = useCallback(
    async (file: GraphFileChange) => {
      if (!workspaceCwd || !selection) {
        return;
      }
      try {
        const result =
          selection.kind === WORKING_TREE_SELECTION
            ? await loadWorkingTreeDiff(
                workspaceCwd,
                formatSourceControlDiffPath({
                  path: file.path,
                  oldPath: file.oldPath,
                }),
              )
            : await loadCommitDiff(
                workspaceCwd,
                selection.hash,
                file.path,
                file.oldPath,
              );
        if (!result.ok) {
          setError(result.stderr || "Failed to load file diff.");
          return;
        }
        const revision =
          selection.kind === WORKING_TREE_SELECTION
            ? "working-tree"
            : selection.hash;
        openDiffInEditor({
          editorTabId: `git-graph-diff:${revision}:${encodeURIComponent(file.path)}`,
          filePath: file.path,
          oldContent: result.oldContent ?? "",
          newContent: result.newContent ?? "",
        });
      } catch (requestFailure) {
        setError(operationError(requestFailure, "Failed to load file diff."));
      }
    },
    [openDiffInEditor, selection, setError, workspaceCwd],
  );

  const locateHash = useCallback(
    (hash: string | null) => {
      if (!hash) {
        setError("HEAD is not available in this repository.");
        return;
      }
      if (!graph.commits.some((commit) => commit.hash === hash)) {
        setError(
          "HEAD is outside the loaded history. Clear the branch filter or load more commits.",
        );
        return;
      }
      canvasRef.current?.scrollToHash(hash);
    },
    [graph.commits, setError],
  );

  const navigateSearch = useCallback(
    (direction: -1 | 1) => {
      if (searchMatchHashes.length === 0) {
        return;
      }
      const next =
        (activeMatchIndex + direction + searchMatchHashes.length) %
        searchMatchHashes.length;
      setActiveMatchIndex(next);
      const hash = searchMatchHashes[next];
      if (hash) {
        canvasRef.current?.scrollToHash(hash);
        void selectCommit(hash);
      }
    },
    [activeMatchIndex, searchMatchHashes, selectCommit],
  );

  const navigateRows = useCallback(
    (direction: -1 | 1, followParent: boolean, alternate: boolean) => {
      if (followParent && selection?.kind === "commit") {
        const commit = graph.commits.find(
          (candidate) => candidate.hash === selection.hash,
        );
        const relatedHash =
          direction === 1
            ? commit?.parents[alternate ? 1 : 0]
            : graph.commits.find((candidate) =>
                candidate.parents
                  .slice(alternate ? 1 : 0, alternate ? 2 : 1)
                  .includes(selection.hash),
              )?.hash;
        if (relatedHash) {
          canvasRef.current?.scrollToHash(relatedHash);
          void selectCommit(relatedHash);
        }
        canvasRef.current?.focus();
        return;
      }

      const rows = [
        ...(workingTreeDirty(graph.workingTree)
          ? [WORKING_TREE_SELECTION]
          : []),
        ...graph.commits.map((commit) => commit.hash),
      ];
      if (rows.length === 0) {
        return;
      }
      const currentKey =
        selection?.kind === WORKING_TREE_SELECTION
          ? WORKING_TREE_SELECTION
          : selection?.kind === "commit"
            ? selection.hash
            : null;
      const currentIndex = currentKey ? rows.indexOf(currentKey) : -1;
      const nextIndex = Math.min(
        rows.length - 1,
        Math.max(0, currentIndex === -1 ? 0 : currentIndex + direction),
      );
      const next = rows[nextIndex];
      if (next === WORKING_TREE_SELECTION) {
        canvasRef.current?.scrollToWorkingTree();
        void selectWorkingTree();
      } else if (next) {
        canvasRef.current?.scrollToHash(next);
        void selectCommit(next);
      }
      canvasRef.current?.focus();
    },
    [
      graph.commits,
      graph.workingTree,
      selectCommit,
      selectWorkingTree,
      selection,
    ],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }
    if (modifier && event.key.toLocaleLowerCase() === "r") {
      event.preventDefault();
      void reload();
      return;
    }
    if (modifier && event.key.toLocaleLowerCase() === "h") {
      event.preventDefault();
      locateHash(graph.headHash);
      return;
    }
    const target = event.target;
    const isTextInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isTextInput) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      navigateRows(event.key === "ArrowUp" ? -1 : 1, modifier, event.shiftKey);
    }
  }

  function openCommitContextMenu(event: MouseEvent, hash: string) {
    event.preventDefault();
    const commit = graph.commits.find((candidate) => candidate.hash === hash);
    setCommitMenu({
      x: event.clientX,
      y: event.clientY,
      hash,
      subject: commit?.subject ?? "",
    });
  }

  function openRefContextMenu(
    event: MouseEvent,
    _hash: string,
    graphRef: GraphRef,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setRefMenu({ x: event.clientX, y: event.clientY, ref: graphRef });
  }

  const handleRefCheckout = useCallback(
    async (graphRef: GraphRef) => {
      if (!workspaceCwd) {
        return;
      }
      await runMutation(`Checked out ${graphRef.name}`, () =>
        checkoutBranch(
          workspaceCwd,
          checkoutRevision(graphRef, graph.availableRefs),
        ),
      );
    },
    [graph.availableRefs, runMutation, workspaceCwd],
  );

  function startDetailResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize =
      detailLocation === "right" ? effectiveDetailWidth : effectiveDetailHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const delta =
        detailLocation === "right"
          ? startX - moveEvent.clientX
          : startY - moveEvent.clientY;
      const max =
        detailLocation === "right"
          ? Math.max(320, root.clientWidth * 0.62)
          : Math.max(220, root.clientHeight * 0.65);
      const next = Math.round(Math.min(max, Math.max(220, startSize + delta)));
      setPreferences((current) =>
        detailLocation === "right"
          ? { ...current, detailWidth: next }
          : { ...current, detailHeight: next },
      );
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup, { once: true });
  }

  const showEmpty =
    !loading &&
    graph.commits.length === 0 &&
    !workingTreeDirty(graph.workingTree);

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-editor text-editor-foreground"
      onKeyDown={handleKeyDown}
      data-testid="git-graph-view"
    >
      <GitGraphToolbar
        head={graph.head}
        availableRefs={graph.availableRefs}
        selectedRefs={selectedRefs}
        workingTree={graph.workingTree}
        workingTreeAvailable={graph.workingTreeAvailable}
        loadedCount={graph.commits.length}
        hasMore={graph.hasMore}
        loading={loading}
        fetching={fetching}
        searchQuery={searchQuery}
        matchPosition={
          activeMatchHash
            ? Math.min(activeMatchIndex + 1, searchMatchHashes.length)
            : 0
        }
        matchCount={searchMatchHashes.length}
        columns={preferences.columns}
        onSelectedRefsChange={setSelectedRefs}
        onSearchQueryChange={setSearchQuery}
        onPreviousMatch={() => navigateSearch(-1)}
        onNextMatch={() => navigateSearch(1)}
        onLocateHead={() => locateHash(graph.headHash)}
        onFetch={() => void handleFetch()}
        onRefresh={() => void reload()}
        onColumnsChange={(columns) =>
          setPreferences((current) => ({ ...current, columns }))
        }
        searchInputRef={searchInputRef}
      />

      {error ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {error}
          </p>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="size-5 text-destructive"
            onClick={() => setError("")}
            aria-label="Dismiss commit graph error"
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      {loading && graph.commits.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
            <p className="text-xs">Reading repository history…</p>
          </div>
        </div>
      ) : showEmpty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            <GitGraph className="size-8 text-muted-foreground/45" />
            <p className="text-sm font-medium text-foreground">
              No commits found
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              This repository has no commits in the selected branch scope.
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 overflow-hidden",
            detailLocation === "bottom" && "flex-col",
          )}
        >
          <GitGraphCanvas
            ref={canvasRef}
            commits={graph.commits}
            headHash={graph.headHash}
            workingTree={graph.workingTree}
            selection={selection}
            searchMatches={searchMatches}
            searchQuery={searchQuery}
            columns={preferences.columns}
            columnWidths={preferences.columnWidths}
            hasMore={graph.hasMore}
            loadingMore={loadingMore}
            onSelectCommit={(hash) => void selectCommit(hash)}
            onSelectWorkingTree={() => void selectWorkingTree()}
            onCommitContextMenu={openCommitContextMenu}
            onRefContextMenu={openRefContextMenu}
            onRefDoubleClick={(graphRef) => void handleRefCheckout(graphRef)}
            onColumnWidthChange={(column, width) =>
              setPreferences((current) => ({
                ...current,
                columnWidths: {
                  ...current.columnWidths,
                  [column]: width,
                },
              }))
            }
            onEndReached={() => void loadMore()}
          />

          {selection ? (
            <>
              <div
                role="separator"
                aria-orientation={
                  detailLocation === "right" ? "vertical" : "horizontal"
                }
                aria-label="Resize commit details"
                className={cn(
                  "z-10 shrink-0 touch-none bg-border/65 transition-colors hover:bg-primary/45",
                  detailLocation === "right"
                    ? "w-1 cursor-col-resize"
                    : "h-1 cursor-row-resize",
                )}
                onPointerDown={startDetailResize}
              />
              <div
                className="min-h-0 min-w-0 shrink-0 overflow-hidden"
                style={
                  detailLocation === "right"
                    ? { width: effectiveDetailWidth }
                    : { height: effectiveDetailHeight }
                }
              >
                <CommitDetailPanel
                  selection={selection}
                  commit={selectedCommit}
                  details={details}
                  workingTree={graph.workingTree}
                  workingTreeFiles={workingTreeFiles}
                  loading={detailsLoading}
                  onOpenFile={(file) => void handleOpenFile(file)}
                  onClose={clearSelection}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {pendingAction ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-md border border-border/70 bg-popover px-2.5 py-1.5 text-[10px] text-popover-foreground shadow-md">
          <LoaderCircle className="size-3 animate-spin" />
          {pendingAction}…
        </div>
      ) : null}

      <CommitContextMenu
        anchor={commitMenu}
        onClose={() => setCommitMenu(null)}
        onCopyHash={(hash) => void navigator.clipboard.writeText(hash)}
        onCheckout={(hash) => {
          if (workspaceCwd) {
            void runMutation("Checked out commit", () =>
              checkoutCommit(workspaceCwd, hash),
            );
          }
        }}
        onCreateBranch={async (hash, name) => {
          if (workspaceCwd) {
            await runMutation(`Created branch ${name}`, () =>
              createBranchFrom(workspaceCwd, name, hash),
            );
          }
        }}
        onCreateTag={async (hash, name) => {
          if (workspaceCwd) {
            await runMutation(`Created tag ${name}`, () =>
              createTag(workspaceCwd, name, hash),
            );
          }
        }}
        onCherryPick={async (hash) => {
          if (workspaceCwd) {
            await runMutation("Cherry-picked commit", () =>
              cherryPickCommit(workspaceCwd, hash),
            );
          }
        }}
        onRevert={async (hash) => {
          if (workspaceCwd) {
            await runMutation("Reverted commit", () =>
              revertCommit(workspaceCwd, hash),
            );
          }
        }}
        onReset={async (hash, mode) => {
          if (workspaceCwd) {
            await runMutation(`${mode} reset complete`, () =>
              resetCommit(workspaceCwd, hash, mode),
            );
          }
        }}
      />

      <RefContextMenu
        anchor={refMenu}
        onClose={() => setRefMenu(null)}
        currentBranch={graph.head ?? ""}
        worktreePathByBranch={graph.worktreePathByBranch}
        worktreePathsAvailable={graph.worktreePathsAvailable}
        workspacePath={workspaceCwd}
        onCheckout={handleRefCheckout}
        onRename={async (graphRef, newName) => {
          if (workspaceCwd) {
            const succeeded = await runMutation(
              `Renamed branch to ${newName}`,
              () => renameBranch(workspaceCwd, graphRef.name, newName),
              { reload: false },
            );
            if (succeeded) {
              const previousRevision = exactRevision(graphRef);
              setSelectedRefs(
                selectedRefs.map((revision) =>
                  revision === previousRevision
                    ? `refs/heads/${newName}`
                    : revision,
                ),
              );
            }
          }
        }}
        onDelete={async (graphRef, force) => {
          if (!workspaceCwd) {
            return;
          }
          const succeeded = await runMutation(
            `Deleted ${graphRef.name}`,
            () =>
              graphRef.type === "tag"
                ? deleteTag(workspaceCwd, graphRef.name)
                : deleteBranch(workspaceCwd, graphRef.name, force),
            { reload: false },
          );
          if (succeeded) {
            const deletedRevision = exactRevision(graphRef);
            setSelectedRefs(
              selectedRefs.filter((revision) => revision !== deletedRevision),
            );
          }
        }}
        onMergeInto={async (graphRef) => {
          if (workspaceCwd) {
            await runMutation(`Merged ${graphRef.name}`, () =>
              mergeBranch(workspaceCwd, exactRevision(graphRef)),
            );
          }
        }}
        onRebaseOnto={async (graphRef) => {
          if (workspaceCwd) {
            await runMutation(`Rebased onto ${graphRef.name}`, () =>
              rebaseBranch(workspaceCwd, exactRevision(graphRef)),
            );
          }
        }}
        onPush={async (graphRef, force) => {
          if (workspaceCwd) {
            await runMutation(`Pushed ${graphRef.name}`, () =>
              pushBranch(workspaceCwd, exactRevision(graphRef), force),
            );
          }
        }}
        onCopyName={(graphRef) =>
          void navigator.clipboard.writeText(graphRef.name)
        }
      />
    </div>
  );
}

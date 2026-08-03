import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphCommitDetails,
  GraphFileChange,
  GraphResult,
} from "@/lib/git-graph/types";
import { MAX_GRAPH_SELECTED_REFS } from "@/lib/git-graph/types";
import {
  loadCommitDetails,
  loadGraph,
  loadWorkingTree,
} from "./git-graph-actions";

export const WORKING_TREE_SELECTION = "working-tree" as const;

export type GitGraphSelection =
  | { kind: "commit"; hash: string }
  | { kind: typeof WORKING_TREE_SELECTION }
  | null;

const INITIAL_PAGE_SIZE = 300;
const NEXT_PAGE_SIZE = 100;
const FILTER_RELOAD_DEBOUNCE_MS = 150;
export const MAX_GRAPH_LOADED_COMMITS = 2_000;
const GRAPH_CACHE_LIMIT = 8;
const DETAILS_CACHE_LIMIT = 100;

export type GitGraphRequestOwner = symbol;

export function claimGitGraphRequest(
  ownerRef: { current: GitGraphRequestOwner | null },
  options: { replace?: boolean } = {},
): GitGraphRequestOwner | null {
  if (ownerRef.current && !options.replace) {
    return null;
  }
  const owner = Symbol("git-graph-request");
  ownerRef.current = owner;
  return owner;
}

export function releaseGitGraphRequest(
  ownerRef: { current: GitGraphRequestOwner | null },
  owner: GitGraphRequestOwner,
): boolean {
  if (ownerRef.current !== owner) {
    return false;
  }
  ownerRef.current = null;
  return true;
}

function emptyGraphResult(): GraphResult {
  return {
    ok: true,
    commits: [],
    head: null,
    headHash: null,
    availableRefs: [],
    workingTree: {
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
    },
    workingTreeAvailable: true,
    worktreePathByBranch: {},
    worktreePathsAvailable: true,
    hasMore: false,
    stderr: "",
  };
}

interface CachedGraphView {
  queryKey: string;
  graph: GraphResult;
  selection: GitGraphSelection;
}

const graphCache = new Map<string, CachedGraphView>();
const detailsCache = new Map<string, GraphCommitDetails>();

function readLruCache<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value === undefined) {
    return undefined;
  }
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function writeLruCache<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  limit: number,
) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
  }
}
const WORKING_TREE_CONFLICT_CODES = new Set([
  "DD",
  "AU",
  "UD",
  "UA",
  "DU",
  "AA",
  "UU",
]);

function normalizeRefs(refs: string[]): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, MAX_GRAPH_SELECTED_REFS);
}

function graphQueryKey(refs: string[]): string {
  return refs.join("\0");
}

function requestError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function resolveWorkingTreeStatus(args: {
  code: string;
  indexStatus?: string;
  workingTreeStatus?: string;
}): string {
  if (args.code === "??") {
    return "?";
  }
  if (args.code === "!!") {
    return "I";
  }
  if (WORKING_TREE_CONFLICT_CODES.has(args.code)) {
    return "!";
  }
  const working = args.workingTreeStatus?.trim();
  if (working) {
    return working;
  }
  const staged = args.indexStatus?.trim();
  if (staged) {
    return staged;
  }
  return args.code.trim().charAt(0) || "M";
}

export function reconcileGitGraphSelection(
  currentSelection: GitGraphSelection,
  graph: GraphResult,
): GitGraphSelection {
  if (currentSelection?.kind === "commit") {
    return graph.commits.some((commit) => commit.hash === currentSelection.hash)
      ? currentSelection
      : null;
  }
  if (currentSelection?.kind === WORKING_TREE_SELECTION) {
    const summary = graph.workingTree;
    const hasChanges =
      summary.staged +
        summary.unstaged +
        summary.untracked +
        summary.conflicts >
      0;
    return graph.workingTreeAvailable && hasChanges ? currentSelection : null;
  }
  return null;
}

export interface GitGraphReloadEffects {
  /** Abandon any in-flight details request tied to the dropped selection. */
  invalidateDetails: boolean;
  /** Clear details, working-tree files, and the details spinner. */
  clearSelectionState: boolean;
  /** Refetch the working-tree file list for a selection that survived. */
  refetchWorkingTree: boolean;
}

/**
 * Working-tree files live outside `detailsCache`, so a working-tree selection
 * that survives a reload (or a remount restoring it from `graphCache`) must
 * refetch its file list or the details panel renders an empty change set.
 */
export function resolveGitGraphReloadEffects(args: {
  previousSelection: GitGraphSelection;
  nextSelection: GitGraphSelection;
}): GitGraphReloadEffects {
  if (!args.nextSelection) {
    return {
      invalidateDetails: Boolean(args.previousSelection),
      clearSelectionState: true,
      refetchWorkingTree: false,
    };
  }
  return {
    invalidateDetails: false,
    clearSelectionState: false,
    refetchWorkingTree: args.nextSelection.kind === WORKING_TREE_SELECTION,
  };
}

export function useGitGraphData(workspaceCwd: string | undefined) {
  const cached = workspaceCwd
    ? readLruCache(graphCache, workspaceCwd)
    : undefined;
  const [selectedRefs, setSelectedRefsState] = useState<string[]>(() =>
    cached ? cached.queryKey.split("\0").filter(Boolean) : [],
  );
  const [graph, setGraph] = useState<GraphResult>(
    () => cached?.graph ?? emptyGraphResult(),
  );
  const [selection, setSelection] = useState<GitGraphSelection>(
    () => cached?.selection ?? null,
  );
  const [details, setDetails] = useState<GraphCommitDetails | null>(() => {
    if (!workspaceCwd || cached?.selection?.kind !== "commit") {
      return null;
    }
    return (
      readLruCache(
        detailsCache,
        `${workspaceCwd}:${cached.selection.hash}`,
      ) ?? null
    );
  });
  const [workingTreeFiles, setWorkingTreeFiles] = useState<GraphFileChange[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const graphRequestRef = useRef(0);
  const graphRequestOwnerRef = useRef<GitGraphRequestOwner | null>(null);
  const detailsRequestRef = useRef(0);
  const selectionRef = useRef(selection);
  const loadMoreBlockedRef = useRef(false);
  const initialReloadScheduledRef = useRef(false);

  const selectedRefKey = useMemo(
    () => graphQueryKey(selectedRefs),
    [selectedRefs],
  );

  const cacheCurrent = useCallback(
    (nextGraph: GraphResult, nextSelection: GitGraphSelection) => {
      if (!workspaceCwd) {
        return;
      }
      writeLruCache(
        graphCache,
        workspaceCwd,
        {
          queryKey: selectedRefKey,
          graph: nextGraph,
          selection: nextSelection,
        },
        GRAPH_CACHE_LIMIT,
      );
    },
    [selectedRefKey, workspaceCwd],
  );

  const refreshWorkingTreeFiles = useCallback(async () => {
    if (!workspaceCwd) {
      return;
    }
    const requestId = ++detailsRequestRef.current;
    setDetailsLoading(true);
    try {
      const result = await loadWorkingTree(workspaceCwd);
      if (requestId !== detailsRequestRef.current) {
        return;
      }
      if (!result.ok) {
        setError(result.stderr || "Failed to load working tree changes.");
        setWorkingTreeFiles([]);
        return;
      }
      setWorkingTreeFiles(
        result.items.map((item) => ({
          path: item.path,
          oldPath: item.oldPath,
          status: resolveWorkingTreeStatus(item),
          additions: null,
          deletions: null,
        })),
      );
    } catch (requestFailure) {
      if (requestId === detailsRequestRef.current) {
        setError(
          requestError(requestFailure, "Failed to load working tree changes."),
        );
        setWorkingTreeFiles([]);
      }
    } finally {
      if (requestId === detailsRequestRef.current) {
        setDetailsLoading(false);
      }
    }
  }, [workspaceCwd]);

  const reload = useCallback(async () => {
    const requestId = ++graphRequestRef.current;
    const requestOwner = claimGitGraphRequest(graphRequestOwnerRef, {
      replace: true,
    }) as GitGraphRequestOwner;
    setLoadingMore(false);
    if (!workspaceCwd) {
      setGraph(emptyGraphResult());
      setError("No workspace path available.");
      if (releaseGitGraphRequest(graphRequestOwnerRef, requestOwner)) {
        setLoading(false);
      }
      return;
    }
    loadMoreBlockedRef.current = false;
    setLoading(true);
    setError("");
    try {
      const result = await loadGraph(workspaceCwd, {
        refs: selectedRefs,
        limit: INITIAL_PAGE_SIZE,
      });
      if (
        requestId !== graphRequestRef.current ||
        graphRequestOwnerRef.current !== requestOwner
      ) {
        return;
      }
      if (!result.ok) {
        setError(result.stderr || "Failed to load repository history.");
        return;
      }
      setGraph(result);
      const currentSelection = selectionRef.current;
      const nextSelection = reconcileGitGraphSelection(
        currentSelection,
        result,
      );
      selectionRef.current = nextSelection;
      setSelection(nextSelection);
      cacheCurrent(result, nextSelection);
      const effects = resolveGitGraphReloadEffects({
        previousSelection: currentSelection,
        nextSelection,
      });
      if (effects.invalidateDetails) {
        detailsRequestRef.current += 1;
      }
      if (effects.clearSelectionState) {
        setDetails(null);
        setWorkingTreeFiles([]);
        setDetailsLoading(false);
      }
      if (effects.refetchWorkingTree) {
        void refreshWorkingTreeFiles();
      }
    } catch (requestFailure) {
      if (
        requestId === graphRequestRef.current &&
        graphRequestOwnerRef.current === requestOwner
      ) {
        setError(
          requestError(requestFailure, "Failed to load repository history."),
        );
      }
    } finally {
      if (releaseGitGraphRequest(graphRequestOwnerRef, requestOwner)) {
        setLoading(false);
      }
    }
  }, [cacheCurrent, refreshWorkingTreeFiles, selectedRefs, workspaceCwd]);

  useEffect(() => {
    graphRequestRef.current += 1;
    claimGitGraphRequest(graphRequestOwnerRef, { replace: true });
    setLoading(false);
    setLoadingMore(false);
    const delay = initialReloadScheduledRef.current
      ? FILTER_RELOAD_DEBOUNCE_MS
      : 0;
    initialReloadScheduledRef.current = true;
    const timeout = window.setTimeout(() => {
      void reload();
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      graphRequestRef.current += 1;
      claimGitGraphRequest(graphRequestOwnerRef, { replace: true });
    };
  }, [reload]);

  const loadMore = useCallback(async () => {
    const remainingCommitCapacity =
      MAX_GRAPH_LOADED_COMMITS - graph.commits.length;
    if (
      !workspaceCwd ||
      loading ||
      loadingMore ||
      !graph.hasMore ||
      loadMoreBlockedRef.current ||
      graphRequestOwnerRef.current
    ) {
      return;
    }
    if (remainingCommitCapacity <= 0) {
      setGraph((current) => ({ ...current, hasMore: false }));
      return;
    }
    const requestOwner = claimGitGraphRequest(graphRequestOwnerRef);
    if (!requestOwner) {
      return;
    }
    const requestId = graphRequestRef.current;
    setLoadingMore(true);
    try {
      const result = await loadGraph(workspaceCwd, {
        refs: selectedRefs,
        skip: graph.commits.length,
        limit: Math.min(NEXT_PAGE_SIZE, remainingCommitCapacity),
        includeRepositoryState: false,
      });
      if (
        requestId !== graphRequestRef.current ||
        graphRequestOwnerRef.current !== requestOwner
      ) {
        return;
      }
      if (!result.ok) {
        loadMoreBlockedRef.current = true;
        setError(result.stderr || "Failed to load more history.");
        return;
      }
      const knownHashes = new Set(graph.commits.map((commit) => commit.hash));
      const appended = result.commits
        .filter((commit) => !knownHashes.has(commit.hash))
        .slice(0, remainingCommitCapacity);
      if (appended.length === 0 && result.hasMore) {
        loadMoreBlockedRef.current = true;
        setError(
          "Git returned no additional commits. Refresh the graph to retry pagination.",
        );
      }
      setGraph((current) => {
        const next = {
          ...current,
          commits: [...current.commits, ...appended],
          hasMore:
            result.hasMore &&
            appended.length > 0 &&
            current.commits.length + appended.length <
              MAX_GRAPH_LOADED_COMMITS,
          availableRefs:
            result.availableRefs.length > 0
              ? result.availableRefs
              : current.availableRefs,
        };
        // Read the live selection: the user may have selected another row
        // while this page was in flight, and caching the captured value would
        // restore a stale selection on the next mount.
        cacheCurrent(next, selectionRef.current);
        return next;
      });
    } catch (requestFailure) {
      if (
        requestId === graphRequestRef.current &&
        graphRequestOwnerRef.current === requestOwner
      ) {
        loadMoreBlockedRef.current = true;
        setError(requestError(requestFailure, "Failed to load more history."));
      }
    } finally {
      if (releaseGitGraphRequest(graphRequestOwnerRef, requestOwner)) {
        setLoadingMore(false);
      }
    }
  }, [
    cacheCurrent,
    graph.commits.length,
    graph.hasMore,
    loading,
    loadingMore,
    selectedRefs,
    workspaceCwd,
  ]);

  const selectCommit = useCallback(
    async (hash: string) => {
      if (!workspaceCwd) {
        return;
      }
      const nextSelection: GitGraphSelection = { kind: "commit", hash };
      selectionRef.current = nextSelection;
      setSelection(nextSelection);
      setWorkingTreeFiles([]);
      cacheCurrent(graph, nextSelection);

      const cacheKey = `${workspaceCwd}:${hash}`;
      const cachedDetails = readLruCache(detailsCache, cacheKey);
      setDetails(cachedDetails ?? null);
      const requestId = ++detailsRequestRef.current;
      setDetailsLoading(!cachedDetails);
      try {
        const result = await loadCommitDetails(workspaceCwd, hash);
        if (requestId !== detailsRequestRef.current) {
          return;
        }
        if (!result.ok || !result.details) {
          setError(result.stderr || "Failed to load commit details.");
          if (!cachedDetails) {
            setDetails(null);
          }
          return;
        }
        writeLruCache(
          detailsCache,
          cacheKey,
          result.details,
          DETAILS_CACHE_LIMIT,
        );
        setDetails(result.details);
      } catch (requestFailure) {
        if (requestId === detailsRequestRef.current) {
          setError(
            requestError(requestFailure, "Failed to load commit details."),
          );
          if (!cachedDetails) {
            setDetails(null);
          }
        }
      } finally {
        if (requestId === detailsRequestRef.current) {
          setDetailsLoading(false);
        }
      }
    },
    [cacheCurrent, graph, workspaceCwd],
  );

  const selectWorkingTree = useCallback(async () => {
    if (!workspaceCwd) {
      return;
    }
    const nextSelection: GitGraphSelection = {
      kind: WORKING_TREE_SELECTION,
    };
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setDetails(null);
    cacheCurrent(graph, nextSelection);
    await refreshWorkingTreeFiles();
  }, [cacheCurrent, graph, refreshWorkingTreeFiles, workspaceCwd]);

  const clearSelection = useCallback(() => {
    detailsRequestRef.current += 1;
    selectionRef.current = null;
    setSelection(null);
    setDetails(null);
    setWorkingTreeFiles([]);
    cacheCurrent(graph, null);
  }, [cacheCurrent, graph]);

  const setSelectedRefs = useCallback((refs: string[]) => {
    setSelectedRefsState(normalizeRefs(refs));
  }, []);

  return {
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
  };
}

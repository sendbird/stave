import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { GitGraph, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { GraphCommit, GraphRef } from "@/lib/git-graph/types";
import {
  loadCommitDiff,
  loadCommitFiles,
  loadGraph,
  revertCommit,
  resetCommit,
  createTag,
  cherryPickCommit,
  createBranchFrom,
  checkoutCommit,
  listBranches,
  checkoutBranch,
  renameBranch,
  deleteBranch,
  deleteTag,
  mergeBranch,
  rebaseBranch,
  pullBranch,
  pushBranch,
} from "./git-graph-actions";
import { GitGraphCanvas } from "./GitGraphCanvas";
import { CommitDetailPanel } from "./CommitDetailPanel";
import {
  CommitContextMenu,
  type CommitContextMenuAnchor,
} from "./CommitContextMenu";
import { RefContextMenu, type RefContextMenuAnchor } from "./RefContextMenu";

type Scope = "all" | "current";

const INITIAL_LIMIT = 500;

interface CommitFile {
  path: string;
  status: string;
  oldPath?: string;
}

interface GitGraphViewProps {
  workspaceCwd: string | undefined;
}

export function GitGraphView({ workspaceCwd }: GitGraphViewProps) {
  const [commits, setCommits] = useState<GraphCommit[]>([]);
  const [head, setHead] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadMorePending, setLoadMorePending] = useState(false);
  const [contextMenuAnchor, setContextMenuAnchor] =
    useState<CommitContextMenuAnchor | null>(null);
  const [refContextMenuAnchor, setRefContextMenuAnchor] =
    useState<RefContextMenuAnchor | null>(null);

  // Branch / worktree metadata (loaded alongside the graph)
  const [currentBranch, setCurrentBranch] = useState("");
  const [worktreePathByBranch, setWorktreePathByBranch] = useState<
    Record<string, string>
  >({});

  const openDiffInEditor = useAppStore((s) => s.openDiffInEditor);
  const setLayout = useAppStore((s) => s.setLayout);

  const fetchBranchMeta = useCallback(async () => {
    if (!workspaceCwd) return;
    const result = await listBranches(workspaceCwd);
    if (result.ok) {
      setCurrentBranch(result.current);
      setWorktreePathByBranch(result.worktreePathByBranch);
    }
  }, [workspaceCwd]);

  const fetchGraph = useCallback(
    async (args: { scope: Scope; skip?: number; append?: boolean }) => {
      if (!workspaceCwd) {
        setError("No workspace path available.");
        return;
      }
      if (args.append) {
        setLoadMorePending(true);
      } else {
        setLoading(true);
        setError("");
      }

      try {
        const result = await loadGraph(workspaceCwd, {
          scope: args.scope,
          limit: INITIAL_LIMIT,
          skip: args.skip ?? 0,
        });
        if (!result.ok) {
          setError(result.stderr || "Failed to load git graph.");
        } else {
          setError("");
        }
        if (args.append) {
          setCommits((prev) => [...prev, ...result.commits]);
        } else {
          setCommits(result.commits);
          setSelectedHash(null);
          setFiles([]);
        }
        setHead(result.head);
        setHasMore(result.hasMore);
        // Load branch/worktree metadata in parallel with graph
        void fetchBranchMeta();
      } finally {
        setLoading(false);
        setLoadMorePending(false);
      }
    },
    [workspaceCwd, fetchBranchMeta],
  );

  // Load on mount, scope change, or workspaceCwd change.
  // lastFetchKeyRef tracks the previously-fetched (scope, cwd) pair so that
  // a stale re-render does not trigger a duplicate request.
  const lastFetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceCwd) return;
    const key = `${scope}:${workspaceCwd}`;
    if (lastFetchKeyRef.current === key) return;
    lastFetchKeyRef.current = key;
    void fetchGraph({ scope });
    // fetchGraph is stable (useCallback dep on workspaceCwd); no loop risk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, workspaceCwd]);

  async function handleSelect(hash: string) {
    setSelectedHash(hash);
    setFiles([]);
    if (!workspaceCwd) return;
    setFilesLoading(true);
    try {
      const result = await loadCommitFiles(workspaceCwd, hash);
      if (result.ok) {
        setFiles(result.files);
      } else {
        setError(result.stderr || "Failed to load commit files.");
        setFiles([]);
      }
    } finally {
      setFilesLoading(false);
    }
  }

  async function handleOpenFile(file: CommitFile) {
    if (!workspaceCwd || !selectedHash) return;
    const result = await loadCommitDiff(
      workspaceCwd,
      selectedHash,
      file.path,
      file.oldPath,
    );
    if (!result.ok) {
      setError(result.stderr || "Failed to load commit diff.");
      return;
    }
    openDiffInEditor({
      editorTabId: `commit-diff:${selectedHash}:${file.path}`,
      filePath: file.path,
      oldContent: result.oldContent,
      newContent: result.newContent,
    });
    setLayout({ patch: { editorVisible: true } });
  }

  function handleLoadMore() {
    void fetchGraph({ scope, skip: commits.length, append: true });
  }

  function handleRefresh() {
    lastFetchKeyRef.current = null;
    void fetchGraph({ scope });
  }

  // Context menu open
  function handleCommitContextMenu(e: MouseEvent, hash: string) {
    e.preventDefault();
    const commit = commits.find((c) => c.hash === hash);
    setContextMenuAnchor({
      x: e.clientX,
      y: e.clientY,
      hash,
      subject: commit?.subject ?? "",
    });
  }

  // Context menu actions — each calls the API then refreshes on success or sets error
  async function handleContextCheckout(hash: string) {
    if (!workspaceCwd) return;
    const result = await checkoutCommit(workspaceCwd, hash);
    if (!result.ok) {
      setError(result.stderr ?? "Checkout failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleContextCreateBranch(hash: string, name: string) {
    if (!workspaceCwd) return;
    const result = await createBranchFrom(workspaceCwd, name, hash);
    if (!result.ok) {
      setError(result.stderr ?? "Create branch failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleContextCreateTag(hash: string, name: string) {
    if (!workspaceCwd) return;
    const result = await createTag(workspaceCwd, name, hash);
    if (!result.ok) {
      setError(result.stderr ?? "Create tag failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleContextCherryPick(hash: string) {
    if (!workspaceCwd) return;
    const result = await cherryPickCommit(workspaceCwd, hash);
    if (!result.ok) {
      setError(result.stderr ?? "Cherry-pick failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleContextRevert(hash: string) {
    if (!workspaceCwd) return;
    const result = await revertCommit(workspaceCwd, hash);
    if (!result.ok) {
      setError(result.stderr ?? "Revert failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleContextReset(
    hash: string,
    mode: "soft" | "mixed" | "hard",
  ) {
    if (!workspaceCwd) return;
    const result = await resetCommit(workspaceCwd, hash, mode);
    if (!result.ok) {
      setError(result.stderr ?? "Reset failed.");
    } else {
      handleRefresh();
    }
  }

  function handleCopyHash(hash: string) {
    void navigator.clipboard.writeText(hash);
  }

  // Ref context menu open
  function handleRefContextMenu(e: MouseEvent, _hash: string, ref: GraphRef) {
    e.preventDefault();
    e.stopPropagation();
    setRefContextMenuAnchor({ x: e.clientX, y: e.clientY, ref });
  }

  // Ref action handlers — refresh graph + branch metadata on success
  async function handleRefCheckout(ref: GraphRef) {
    if (!workspaceCwd) return;
    const result = await checkoutBranch(workspaceCwd, ref.name);
    if (!result.ok) {
      setError(result.stderr ?? "Checkout failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleRefRename(ref: GraphRef, newName: string) {
    if (!workspaceCwd) return;
    const result = await renameBranch(workspaceCwd, ref.name, newName);
    if (!result.ok) {
      setError(result.stderr ?? "Rename failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleRefDelete(ref: GraphRef, force: boolean) {
    if (!workspaceCwd) return;
    const result =
      ref.type === "tag"
        ? await deleteTag(workspaceCwd, ref.name)
        : await deleteBranch(workspaceCwd, ref.name, force);
    if (!result.ok) {
      setError(result.stderr ?? "Delete failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleRefMergeInto(ref: GraphRef) {
    if (!workspaceCwd) return;
    const result = await mergeBranch(workspaceCwd, ref.name);
    if (!result.ok) {
      setError(result.stderr ?? "Merge failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleRefRebaseOnto(ref: GraphRef) {
    if (!workspaceCwd) return;
    const result = await rebaseBranch(workspaceCwd, ref.name);
    if (!result.ok) {
      setError(result.stderr ?? "Rebase failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleRefPush(ref: GraphRef, force: boolean) {
    if (!workspaceCwd) return;
    const result = await pushBranch(workspaceCwd, ref.name, force);
    if (!result.ok) {
      setError(result.stderr ?? "Push failed.");
    } else {
      handleRefresh();
    }
  }

  async function handleRefPull(ref: GraphRef) {
    if (!workspaceCwd) return;
    // For remote branches like "origin/main", extract just the branch part
    const branch = ref.name.includes("/")
      ? ref.name.split("/").slice(1).join("/")
      : ref.name;
    const result = await pullBranch(workspaceCwd, branch);
    if (!result.ok) {
      setError(result.stderr ?? "Pull failed.");
    } else {
      handleRefresh();
    }
  }

  function handleRefCopyName(ref: GraphRef) {
    void navigator.clipboard.writeText(ref.name);
  }

  const selectedCommit = selectedHash
    ? (commits.find((c) => c.hash === selectedHash) ?? null)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-editor text-editor-foreground">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium transition-colors",
              scope === "all"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setScope("current")}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium transition-colors",
              scope === "current"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Current Branch
          </button>
        </div>

        {head ? (
          <span className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{head}</span>
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {hasMore ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
              disabled={loadMorePending || loading}
              onClick={handleLoadMore}
            >
              {loadMorePending ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : null}
              Load more
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh git graph"
            title="Refresh"
            className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
            disabled={loading}
            onClick={handleRefresh}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Main content: canvas + detail panel */}
      {error ? (
        <div className="m-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && commits.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading git graph…</p>
          </div>
        </div>
      ) : commits.length === 0 && !loading ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <GitGraph className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No commits found</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Graph canvas — scrollable */}
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <GitGraphCanvas
              commits={commits}
              selectedHash={selectedHash}
              onSelect={(hash) => void handleSelect(hash)}
              onCommitContextMenu={handleCommitContextMenu}
              onRefContextMenu={handleRefContextMenu}
            />
          </div>

          {/* Detail panel — fixed width sidebar */}
          <div className="w-72 shrink-0 overflow-hidden border-l border-border/70">
            <CommitDetailPanel
              commit={selectedCommit}
              files={files}
              loading={filesLoading}
              onOpenFile={(file) => void handleOpenFile(file)}
            />
          </div>
        </div>
      )}

      {/* Commit context menu — rendered outside the canvas scroll container */}
      <CommitContextMenu
        anchor={contextMenuAnchor}
        onClose={() => setContextMenuAnchor(null)}
        onCopyHash={handleCopyHash}
        onCheckout={(hash) => void handleContextCheckout(hash)}
        onCreateBranch={(hash, name) => handleContextCreateBranch(hash, name)}
        onCreateTag={(hash, name) => handleContextCreateTag(hash, name)}
        onCherryPick={(hash) => handleContextCherryPick(hash)}
        onRevert={(hash) => handleContextRevert(hash)}
        onReset={(hash, mode) => handleContextReset(hash, mode)}
      />

      {/* Ref context menu — rendered outside the canvas scroll container */}
      <RefContextMenu
        anchor={refContextMenuAnchor}
        onClose={() => setRefContextMenuAnchor(null)}
        currentBranch={currentBranch}
        worktreePathByBranch={worktreePathByBranch}
        workspacePath={workspaceCwd}
        onCheckout={(ref) => handleRefCheckout(ref)}
        onRename={(ref, newName) => handleRefRename(ref, newName)}
        onDelete={(ref, force) => handleRefDelete(ref, force)}
        onMergeInto={(ref) => handleRefMergeInto(ref)}
        onRebaseOnto={(ref) => handleRefRebaseOnto(ref)}
        onPush={(ref, force) => handleRefPush(ref, force)}
        onPull={(ref) => handleRefPull(ref)}
        onCopyName={handleRefCopyName}
      />
    </div>
  );
}

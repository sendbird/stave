import { useCallback, useEffect, useRef, useState } from "react";
import { GitGraph, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { parseUnifiedDiffToBuffers } from "@/lib/source-control-diff";
import type { GraphCommit } from "@/lib/git-graph/types";
import { loadCommitFiles, loadGraph } from "./git-graph-actions";
import { GitGraphCanvas } from "./GitGraphCanvas";
import { CommitDetailPanel } from "./CommitDetailPanel";

type Scope = "all" | "current";

const INITIAL_LIMIT = 500;

interface CommitFile {
  path: string;
  status: string;
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

  const openDiffInEditor = useAppStore((s) => s.openDiffInEditor);
  const setLayout = useAppStore((s) => s.setLayout);

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
      } finally {
        setLoading(false);
        setLoadMorePending(false);
      }
    },
    [workspaceCwd],
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
      }
    } finally {
      setFilesLoading(false);
    }
  }

  async function handleOpenFile(filePath: string) {
    // NOTE: This opens the working-tree-vs-HEAD diff for the file, not a
    // commit-specific diff. A per-commit diff IPC (e.g. `git show <hash> -- <path>`)
    // can be added later when the IPC layer supports it.
    const getDiff = window.api?.sourceControl?.getDiff;
    if (!getDiff || !workspaceCwd) return;
    const result = await getDiff({ path: filePath, cwd: workspaceCwd });
    const parsed =
      result.oldContent != null && result.newContent != null
        ? { oldContent: result.oldContent, newContent: result.newContent }
        : parseUnifiedDiffToBuffers({ patch: result.content });
    openDiffInEditor({
      editorTabId: `scm-diff:${filePath}`,
      filePath,
      oldContent: parsed.oldContent,
      newContent: parsed.newContent,
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
              onCommitContextMenu={() => undefined}
              onRefContextMenu={() => undefined}
            />
          </div>

          {/* Detail panel — fixed width sidebar */}
          <div className="w-72 shrink-0 overflow-hidden border-l border-border/70">
            <CommitDetailPanel
              commit={selectedCommit}
              files={files}
              loading={filesLoading}
              onOpenFile={(path) => void handleOpenFile(path)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

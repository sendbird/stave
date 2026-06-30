import { FileCode2, LoaderCircle, User, Calendar, Hash } from "lucide-react";
import type { GraphCommit } from "@/lib/git-graph/types";
import { cn } from "@/lib/utils";

interface CommitFile {
  path: string;
  status: string;
  oldPath?: string;
}

interface CommitDetailPanelProps {
  commit: GraphCommit | null;
  files: CommitFile[];
  loading: boolean;
  onOpenFile: (path: string) => void;
}

function formatDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

function fileStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "A": return "A";
    case "M": return "M";
    case "D": return "D";
    case "R": return "R";
    case "C": return "C";
    default: return status.charAt(0).toUpperCase();
  }
}

function fileStatusClass(status: string): string {
  switch (status.toUpperCase()) {
    case "A": return "text-success";
    case "D": return "text-destructive";
    case "M": return "text-warning";
    default: return "text-muted-foreground";
  }
}

export function CommitDetailPanel({
  commit,
  files,
  loading,
  onOpenFile,
}: CommitDetailPanelProps) {
  if (!commit) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">Select a commit to view details</p>
      </div>
    );
  }

  const shortHash = commit.hash.slice(0, 8);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header: commit metadata */}
      <div className="space-y-2 border-b border-border/70 px-3 py-3">
        <p className="text-sm font-medium leading-snug text-foreground">{commit.subject}</p>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Hash className="size-3 shrink-0" />
            <span className="font-mono text-foreground/70">{shortHash}</span>
            <span className="text-muted-foreground/60">({commit.hash.slice(0, 12)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="size-3 shrink-0" />
            <span>{commit.author}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3 shrink-0" />
            <span>{formatDate(commit.authorDate)}</span>
          </div>
        </div>

        {commit.refs.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {commit.refs.map((ref) => (
              <span
                key={`${ref.type}:${ref.name}`}
                className={cn(
                  "rounded px-1.5 py-px text-[10px] font-medium",
                  ref.isHead
                    ? "bg-primary/15 text-primary"
                    : ref.type === "tag"
                      ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {ref.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* File list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Changed files
          </p>
          {loading ? (
            <LoaderCircle className="size-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-[11px] text-muted-foreground">{files.length}</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files changed</p>
          ) : (
            <div className="space-y-0.5">
              {files.map((file) => (
                <button
                  key={`${file.status}:${file.path}`}
                  type="button"
                  // NOTE: This opens the working-tree-vs-HEAD diff for the file,
                  // not a commit-specific diff. A per-commit diff IPC can be added later.
                  onClick={() => onOpenFile(file.path)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted/30"
                  title={
                    file.oldPath
                      ? `Renamed: ${file.oldPath} → ${file.path}`
                      : `Open diff for ${file.path}`
                  }
                >
                  <span className={cn("w-3 shrink-0 font-mono font-medium", fileStatusClass(file.status))}>
                    {fileStatusLabel(file.status)}
                  </span>
                  <FileCode2 className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-foreground">
                    {file.oldPath ? (
                      <>
                        <span className="text-muted-foreground/70">{file.oldPath}</span>
                        <span className="mx-1 text-muted-foreground/50">→</span>
                        {file.path}
                      </>
                    ) : (
                      file.path
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

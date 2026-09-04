import { useMemo, useState } from "react";
import {
  Calendar,
  Copy,
  FileCode2,
  FolderOpen,
  GitCommitHorizontal,
  Mail,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Loader,
  toast,
} from "@/components/ui";
import type {
  GraphCommit,
  GraphCommitDetails,
  GraphCommitSignature,
  GraphFileChange,
  GraphWorkingTreeSummary,
} from "@/lib/git-graph/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { GitGraphSelection } from "./useGitGraphData";

interface CommitDetailPanelProps {
  selection: GitGraphSelection;
  commit: GraphCommit | null;
  details: GraphCommitDetails | null;
  workingTree: GraphWorkingTreeSummary;
  workingTreeFiles: GraphFileChange[];
  loading: boolean;
  onOpenFile: (file: GraphFileChange) => void;
  onClose: () => void;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function fileStatusClass(status: string): string {
  switch (status.toUpperCase()) {
    case "A":
      return "border-success/35 bg-success/10 text-success";
    case "D":
    case "!":
    case "U":
      return "border-destructive/35 bg-destructive/10 text-destructive";
    case "M":
      return "border-warning/40 bg-warning/10 text-warning";
    case "R":
    case "C":
    case "?":
      return "border-info/35 bg-info/10 text-info";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function copyText(value: string, label: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Could not copy ${label.toLocaleLowerCase()}`),
  );
}

function MetadataRow({
  icon: Icon,
  label,
  labelClassName,
  children,
}: {
  icon: typeof User;
  label: string;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2 text-[11px]">
      <span
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground",
          labelClassName,
        )}
      >
        <Icon className="size-3" />
        {label}
      </span>
      <span className="min-w-0 break-words text-foreground/85">{children}</span>
    </div>
  );
}

function SignatureMetadata({ signature }: { signature: GraphCommitSignature }) {
  const presentation = (() => {
    switch (signature.status) {
      case "G":
        return {
          Icon: ShieldCheck,
          label: "Verified",
          tone: "text-success",
        };
      case "U":
        return {
          Icon: ShieldCheck,
          label: "Good · unknown trust",
          tone: "text-warning",
        };
      case "X":
        return {
          Icon: ShieldAlert,
          label: "Expired signature",
          tone: "text-warning",
        };
      case "Y":
        return {
          Icon: ShieldAlert,
          label: "Expired signing key",
          tone: "text-warning",
        };
      case "R":
        return {
          Icon: ShieldAlert,
          label: "Revoked signing key",
          tone: "text-destructive",
        };
      case "B":
        return {
          Icon: ShieldAlert,
          label: "Bad signature",
          tone: "text-destructive",
        };
      case "E":
        return {
          Icon: ShieldAlert,
          label: "Verification error",
          tone: "text-destructive",
        };
      default:
        return {
          Icon: ShieldAlert,
          label: `Status ${signature.status}`,
          tone: "text-muted-foreground",
        };
    }
  })();
  const identity = signature.signer || signature.key;

  return (
    <MetadataRow
      icon={presentation.Icon}
      label="Signature"
      labelClassName={presentation.tone}
    >
      <span className={presentation.tone}>{presentation.label}</span>
      {identity ? (
        <span className="ml-1 text-muted-foreground">· {identity}</span>
      ) : null}
    </MetadataRow>
  );
}

function WorkingTreeSummary({ summary }: { summary: GraphWorkingTreeSummary }) {
  const items = [
    ["Staged", summary.staged, "text-success"],
    ["Changed", summary.unstaged, "text-warning"],
    ["Untracked", summary.untracked, "text-info"],
    ["Conflicts", summary.conflicts, "text-destructive"],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map(([label, count, tone]) => (
        <div
          key={label}
          className="rounded-md border border-border/55 bg-muted/20 px-2 py-1.5"
        >
          <div className={cn("text-sm font-semibold tabular-nums", tone)}>
            {count}
          </div>
          <div className="text-[10px] text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function CommitDetailPanel({
  selection,
  commit,
  details,
  workingTree,
  workingTreeFiles,
  loading,
  onOpenFile,
  onClose,
}: CommitDetailPanelProps) {
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const [fileMenuAnchor, setFileMenuAnchor] = useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);
  const isWorkingTree = selection?.kind === "working-tree";
  const files = isWorkingTree ? workingTreeFiles : (details?.files ?? []);
  const totals = useMemo(
    () =>
      files.reduce(
        (sum, file) => ({
          additions: sum.additions + (file.additions ?? 0),
          deletions: sum.deletions + (file.deletions ?? 0),
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  );

  if (!selection) {
    return null;
  }

  return (
    <aside
      aria-label={isWorkingTree ? "Working tree details" : "Commit details"}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-editor"
      data-testid="git-graph-details"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border/65 px-3 py-3">
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-foreground">
                {isWorkingTree
                  ? "Uncommitted changes"
                  : (details?.subject ?? commit?.subject ?? "Commit")}
              </p>
              {!isWorkingTree && commit ? (
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => copyText(commit.hash, "Commit hash")}
                  title="Copy full commit hash"
                >
                  {commit.hash.slice(0, 12)}
                  <Copy className="size-2.5" />
                </button>
              ) : null}
            </div>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-6"
              onClick={onClose}
              aria-label="Close details"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {isWorkingTree ? (
            <WorkingTreeSummary summary={workingTree} />
          ) : loading && !details ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader aria-hidden size="xs" variant="scan" />
              Loading commit details…
            </div>
          ) : details ? (
            <div className="space-y-1.5">
              <MetadataRow icon={User} label="Author">
                {details.author}
              </MetadataRow>
              <MetadataRow icon={Mail} label="Email">
                {details.authorEmail}
              </MetadataRow>
              <MetadataRow icon={Calendar} label="Authored">
                {formatDate(details.authorDate)}
              </MetadataRow>
              {details.committer !== details.author ||
              details.committerDate !== details.authorDate ? (
                <MetadataRow icon={GitCommitHorizontal} label="Committed">
                  {details.committer} · {formatDate(details.committerDate)}
                </MetadataRow>
              ) : null}
              {details.parents.length > 0 ? (
                <MetadataRow icon={GitCommitHorizontal} label="Parents">
                  <span className="font-mono text-[10px]">
                    {details.parents
                      .map((parent) => parent.slice(0, 8))
                      .join(", ")}
                  </span>
                </MetadataRow>
              ) : null}
              {details.signature ? (
                <SignatureMetadata signature={details.signature} />
              ) : null}
            </div>
          ) : null}

          {!isWorkingTree && details?.body ? (
            <p className="mt-3 whitespace-pre-wrap break-words border-t border-border/50 pt-3 text-xs leading-5 text-foreground/80">
              {details.body}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-b border-border/45 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Changed files
          </span>
          {loading ? (
            <Loader
              aria-hidden
              className="text-muted-foreground"
              size="xs"
              variant="scan"
            />
          ) : (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {files.length}
            </span>
          )}
          {totals.additions > 0 || totals.deletions > 0 ? (
            <span className="ml-auto flex gap-1 font-mono text-[10px] tabular-nums">
              <span className="text-success">+{totals.additions}</span>
              <span className="text-destructive">−{totals.deletions}</span>
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 p-2">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader
                aria-hidden
                className="text-muted-foreground"
                size="xs"
                variant="scan"
              />
            </div>
          ) : files.length === 0 ? (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              No file changes to display.
            </p>
          ) : (
            <div className="space-y-0.5">
              {files.map((file) => (
                <button
                  key={`${file.status}:${file.oldPath ?? ""}:${file.path}`}
                  type="button"
                  className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[11px] hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  title={
                    file.oldPath
                      ? `${file.oldPath} → ${file.path}`
                      : `Open diff for ${file.path}`
                  }
                  onClick={() => onOpenFile(file)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setFileMenuAnchor({
                      x: event.clientX,
                      y: event.clientY,
                      filePath: file.path,
                    });
                  }}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[9px] font-semibold",
                      fileStatusClass(file.status),
                    )}
                  >
                    {file.status.charAt(0).toUpperCase()}
                  </span>
                  <FileCode2 className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {file.path}
                  </span>
                  {file.additions !== null || file.deletions !== null ? (
                    <span className="hidden shrink-0 gap-1 font-mono text-[9px] tabular-nums group-hover:flex">
                      {file.additions !== null ? (
                        <span className="text-success">+{file.additions}</span>
                      ) : null}
                      {file.deletions !== null ? (
                        <span className="text-destructive">
                          −{file.deletions}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <DropdownMenu
        open={fileMenuAnchor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFileMenuAnchor(null);
          }
        }}
      >
        <DropdownMenuTrigger
          nativeButton={false}
          render={
            <div
              aria-hidden="true"
              style={{
                position: "fixed",
                top: fileMenuAnchor?.y ?? 0,
                left: fileMenuAnchor?.x ?? 0,
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          }
        />
        <DropdownMenuContent
          align="start"
          collisionPadding={8}
          finalFocus={false}
        >
          <DropdownMenuItem
            onSelect={() => {
              if (fileMenuAnchor) {
                void openFileFromTree({ filePath: fileMenuAnchor.filePath });
              }
              setFileMenuAnchor(null);
            }}
          >
            <FolderOpen className="size-4" />
            Open current file
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (fileMenuAnchor) {
                copyText(fileMenuAnchor.filePath, "File path");
              }
              setFileMenuAnchor(null);
            }}
          >
            <Copy className="size-4" />
            Copy path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}

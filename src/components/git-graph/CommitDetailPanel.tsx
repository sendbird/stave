import { Button as AdsButton } from "@/components/ads/components/Button";
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
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { GitGraphSelection } from "./useGitGraphData";
import { commitDetailPanelStyles as styles } from "./commit-detail-panel.styles";

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

function fileStatusStyle(status: string) {
  switch (status.toUpperCase()) {
    case "A":
      return styles.statusAdded;
    case "D":
    case "!":
    case "U":
      return styles.statusRemoved;
    case "M":
      return styles.statusModified;
    case "R":
    case "C":
    case "?":
      return styles.statusRenamed;
    default:
      return styles.statusDefault;
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
  labelStyle,
  children,
}: {
  icon: typeof User;
  label: string;
  labelStyle?: Parameters<typeof sx>[0];
  children: React.ReactNode;
}) {
  return (
    <div className={sx(styles.metaRow)}>
      <span className={sx(styles.metaLabel, labelStyle)}>
        <Icon className={sx(styles.metaIcon)} />
        {label}
      </span>
      <span className={sx(styles.metaValue)}>{children}</span>
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
          tone: styles.toneSuccess,
        };
      case "U":
        return {
          Icon: ShieldCheck,
          label: "Good · unknown trust",
          tone: styles.toneWarning,
        };
      case "X":
        return {
          Icon: ShieldAlert,
          label: "Expired signature",
          tone: styles.toneWarning,
        };
      case "Y":
        return {
          Icon: ShieldAlert,
          label: "Expired signing key",
          tone: styles.toneWarning,
        };
      case "R":
        return {
          Icon: ShieldAlert,
          label: "Revoked signing key",
          tone: styles.toneDanger,
        };
      case "B":
        return {
          Icon: ShieldAlert,
          label: "Bad signature",
          tone: styles.toneDanger,
        };
      case "E":
        return {
          Icon: ShieldAlert,
          label: "Verification error",
          tone: styles.toneDanger,
        };
      default:
        return {
          Icon: ShieldAlert,
          label: `Status ${signature.status}`,
          tone: styles.toneMuted,
        };
    }
  })();
  const identity = signature.signer || signature.key;

  return (
    <MetadataRow
      icon={presentation.Icon}
      label="Signature"
      labelStyle={presentation.tone}
    >
      <span className={sx(presentation.tone)}>{presentation.label}</span>
      {identity ? (
        <span className={sx(styles.signatureIdentity)}>· {identity}</span>
      ) : null}
    </MetadataRow>
  );
}

function WorkingTreeSummary({ summary }: { summary: GraphWorkingTreeSummary }) {
  const items = [
    ["Staged", summary.staged, styles.toneSuccess],
    ["Changed", summary.unstaged, styles.toneWarning],
    ["Untracked", summary.untracked, styles.toneInfo],
    ["Conflicts", summary.conflicts, styles.toneDanger],
  ] as const;
  return (
    <div className={sx(styles.summaryGrid)}>
      {items.map(([label, count, tone]) => (
        <div key={label} className={sx(styles.summaryCell)}>
          <div className={sx(styles.summaryCount, tone)}>{count}</div>
          <div className={sx(styles.summaryLabel)}>{label}</div>
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
      className={sx(styles.aside)}
      data-testid="git-graph-details"
    >
      <div className={sx(styles.scroll)}>
        <div className={sx(styles.header)}>
          <div className={sx(styles.headerTop)}>
            <div className={sx(styles.headerTitleWrap)}>
              <p className={sx(styles.title)}>
                {isWorkingTree
                  ? "Uncommitted changes"
                  : (details?.subject ?? commit?.subject ?? "Commit")}
              </p>
              {!isWorkingTree && commit ? (
                <AdsButton
                  layout="host"
                  type="button"
                  xstyle={styles.hashButton}
                  onClick={() => copyText(commit.hash, "Commit hash")}
                  title="Copy full commit hash"
                >
                  {commit.hash.slice(0, 12)}
                  <Copy className={sx(styles.hashIcon)} />
                </AdsButton>
              ) : null}
            </div>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              xstyle={styles.closeButton}
              onClick={onClose}
              aria-label="Close details"
            >
              <X className={sx(styles.closeIcon)} />
            </Button>
          </div>

          {isWorkingTree ? (
            <WorkingTreeSummary summary={workingTree} />
          ) : loading && !details ? (
            <div className={sx(styles.loadingRow)}>
              <Loader aria-hidden size="xs" variant="scan" />
              Loading commit details…
            </div>
          ) : details ? (
            <div className={sx(styles.metaGroup)}>
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
                  <span className={sx(styles.metaMono)}>
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
            <p className={sx(styles.body)}>{details.body}</p>
          ) : null}
        </div>

        <div className={sx(styles.filesHeader)}>
          <span className={sx(styles.filesHeaderLabel)}>Changed files</span>
          {loading ? (
            <Loader
              aria-hidden
              className={sx(styles.loaderMuted)}
              size="xs"
              variant="scan"
            />
          ) : (
            <span className={sx(styles.filesCount)}>{files.length}</span>
          )}
          {totals.additions > 0 || totals.deletions > 0 ? (
            <span className={sx(styles.totals)}>
              <span className={sx(styles.additions)}>+{totals.additions}</span>
              <span className={sx(styles.deletions)}>−{totals.deletions}</span>
            </span>
          ) : null}
        </div>

        <div className={sx(styles.fileList)}>
          {loading && files.length === 0 ? (
            <div className={sx(styles.emptyCenter)}>
              <Loader
                aria-hidden
                className={sx(styles.loaderMuted)}
                size="xs"
                variant="scan"
              />
            </div>
          ) : files.length === 0 ? (
            <p className={sx(styles.emptyText)}>No file changes to display.</p>
          ) : (
            <div className={sx(styles.fileListEntries)}>
              {files.map((file) => (
                <AdsButton
                  layout="host"
                  key={`${file.status}:${file.oldPath ?? ""}:${file.path}`}
                  type="button"
                  xstyle={styles.fileRow}
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
                    className={sx(
                      styles.fileStatus,
                      fileStatusStyle(file.status),
                    )}
                  >
                    {file.status.charAt(0).toUpperCase()}
                  </span>
                  <FileCode2 className={sx(styles.fileIcon)} />
                  <span className={sx(styles.filePath)}>{file.path}</span>
                  {file.additions !== null || file.deletions !== null ? (
                    <span className={sx(styles.fileStats)}>
                      {file.additions !== null ? (
                        <span className={sx(styles.additions)}>
                          +{file.additions}
                        </span>
                      ) : null}
                      {file.deletions !== null ? (
                        <span className={sx(styles.deletions)}>
                          −{file.deletions}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </AdsButton>
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
            <FolderOpen className={sx(styles.menuIcon)} />
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
            <Copy className={sx(styles.menuIcon)} />
            Copy path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}

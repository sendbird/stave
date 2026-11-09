import { i18n, useTranslation, type I18nKey } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { FileDiff, RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/aui/components/Badge";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/aui/components/Table";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { paneHost } from "@/components/panes/pane-host-controller";
import { toast } from "@/components/ui";
import {
  describeSharedFileChange,
  selectChildWorktrees,
  type SharedFileChange,
  type WorktreeChangedFile,
} from "@/lib/delegation/shared-files";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { useAppStore } from "@/store/app.store";
import { refreshSharedFiles, sharedFilesParentKey, useSharedFilesStore, type WorktreeRead } from "@/store/shared-files-store";

const CHANGE_LABEL_KEYS = {
  added: "session:sharedFiles.change.added",
  deleted: "session:sharedFiles.change.deleted",
  renamed: "session:sharedFiles.change.renamed",
  changed: "session:sharedFiles.change.changed",
} as const satisfies Record<SharedFileChange, I18nKey>;

/** Who a child is and how it stands, as its row in the Subagents list says. */
export interface SharedFilesChildInfo {
  label: string;
  state: WorkState;
  stateLabel: string;
}

/**
 * Opens one worktree's change to a file as a read-only diff in the editor:
 * the file at the worktree's base against the worktree's copy now.
 */
async function openWorktreeDiff(args: { workspaceId: string; cwd: string; baseSha: string; file: WorktreeChangedFile }) {
  const read = typeof window === "undefined" ? undefined : window.api?.sourceControl?.getReviewFileDiff;
  if (!read) {
    toast.error(i18n.t("session:sharedFiles.openFailed"));
    return;
  }
  const activeWorkspaceId = useAppStore.getState().activeWorkspaceId;
  try {
    const result = await read({
      cwd: args.cwd,
      baseSha: args.baseSha,
      path: args.file.path,
      ...(args.file.oldPath ? { oldPath: args.file.oldPath } : {}),
      ...(args.file.untracked ? { untracked: true } : {}),
    });
    if (!result.ok) {
      toast.error(i18n.t("session:sharedFiles.openFailed"), result.stderr ? { description: result.stderr } : undefined);
      return;
    }
    if (result.binary) {
      toast.info(i18n.t("session:sharedFiles.binary"));
      return;
    }
    // A snapshot of the other worktree, never refreshed from or saved to this workspace's copy.
    const editorTabId = `chat-diff:shared-files:${args.workspaceId}:${args.file.path}`;
    const isStale = () => useAppStore.getState().activeWorkspaceId !== activeWorkspaceId;
    await useAppStore.getState().openDiffInEditor({ editorTabId, filePath: args.file.path, oldContent: result.oldContent, newContent: result.newContent, isStale });
    if (isStale()) return;
    paneHost.openSurface({ kind: "editor", editorTabId });
  } catch {
    toast.error(i18n.t("session:sharedFiles.openFailed"));
  }
}

/**
 * The Subagents tab's "Shared files": files that two or more of the task's
 * child worktrees changed since they left the default branch, which child
 * changed each, and each one's diff. Read when the tab opens and on Refresh,
 * never in the background; file level only.
 */
export function SharedFilesSection(props: {
  workspaceId: string;
  taskId: string;
  delegatedTasks: readonly DelegatedTaskSummary[];
  infoByDelegationKey: ReadonlyMap<string, SharedFilesChildInfo>;
}) {
  useTranslation();
  const worktrees = useMemo(
    () => selectChildWorktrees({ parentWorkspaceId: props.workspaceId, children: props.delegatedTasks }),
    [props.delegatedTasks, props.workspaceId],
  );
  const workspacePathById = useAppStore((state) => state.workspacePathById);
  const parentKey = sharedFilesParentKey(props.workspaceId, props.taskId);
  const targets = useMemo(
    () => worktrees.map((worktree) => ({ workspaceId: worktree.workspaceId, cwd: workspacePathById[worktree.workspaceId] ?? null })),
    [workspacePathById, worktrees],
  );
  // A child that settles or moves on may have changed more: its phase is part
  // of what is read, so the list is read again then, and not on every update.
  const readKey = useMemo(
    () => JSON.stringify([targets, worktrees.map((worktree) => worktree.children.map((child) => [child.delegationKey, child.phase]))]),
    [targets, worktrees],
  );
  const canCompare = worktrees.length > 1;
  useEffect(() => {
    if (!canCompare) return;
    void refreshSharedFiles({ parentKey, worktrees: targets });
    // `targets` is read through `readKey`, which holds the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCompare, parentKey, readKey]);
  const entry = useSharedFilesStore((state) => state.byParent[parentKey]);
  if (!canCompare) return null;

  const headers = worktrees.map((worktree) => {
    const infos = worktree.children.map((child) => props.infoByDelegationKey.get(child.delegationKey)).filter((info): info is SharedFilesChildInfo => Boolean(info));
    return { workspaceId: worktree.workspaceId, label: infos.map((info) => info.label).join(", ") || worktree.workspaceId, lead: infos[0] ?? null };
  });
  const read = (workspaceId: string): WorktreeRead | undefined => entry?.worktrees[workspaceId];
  const unreadable = headers.filter((header) => {
    const status = read(header.workspaceId)?.status;
    return status === "missing" || status === "failed";
  });
  const shared = entry?.shared ?? [];
  const firstRead = !entry?.readAt;

  return (
    <section className={sx(styles.root)} aria-labelledby={`${parentKey}-shared-files`} data-testid="shared-files">
      <div className={sx(styles.head)}>
        <h3 id={`${parentKey}-shared-files`} className={sx(styles.title)}>{i18n.t("session:sharedFiles.title")}</h3>
        <span className={sx(styles.summary)} role="status" aria-live="polite">
          {firstRead
            ? i18n.t("session:sharedFiles.reading")
            : shared.length
              ? i18n.t("session:sharedFiles.summary", { count: shared.length })
              : i18n.t("session:sharedFiles.none")}
        </span>
        <Button
          size="xs"
          variant="quiet"
          iconOnly
          aria-label={i18n.t("session:sharedFiles.refresh")}
          disabled={entry?.loading}
          onClick={() => void refreshSharedFiles({ parentKey, worktrees: targets })}
        >
          <RefreshCw aria-hidden />
        </Button>
      </div>
      {shared.length > 0 ? (
        <Table density="compact" xstyle={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHead>{i18n.t("session:sharedFiles.file")}</TableHead>
              {headers.map((header) => (
                <TableHead key={header.workspaceId}>
                  <span className={sx(styles.agent)}>
                    <span className={sx(styles.agentName)} title={header.label}>{header.label}</span>
                    {header.lead ? <StateMark state={header.lead.state} showLabel label={header.lead.stateLabel} size="xs" /> : null}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shared.map((file) => (
              <TableRow key={file.path} data-shared-file={file.path}>
                {/* The path and how many changed it, stacked so a narrow rail keeps every column. */}
                <TableCell>
                  <span className={sx(styles.fileCell)}>
                    <span className={sx(styles.path)} title={file.path}>{file.path}</span>
                    <Badge tone="warning" variant="outlined" size="sm">{i18n.t("session:sharedFiles.agents", { count: file.workspaceIds.length })}</Badge>
                  </span>
                </TableCell>
                {headers.map((header) => {
                  const change = file.fileByWorkspaceId[header.workspaceId];
                  const worktree = read(header.workspaceId);
                  const cwd = targets.find((target) => target.workspaceId === header.workspaceId)?.cwd ?? null;
                  return (
                    <TableCell key={header.workspaceId}>
                      {change && worktree?.status === "ready" && cwd ? (
                        // The change word opens that worktree's diff of the file.
                        <Button
                          size="xs"
                          variant="quiet"
                          title={i18n.t("session:sharedFiles.openDiff")}
                          aria-label={i18n.t("session:sharedFiles.openDiffLabel", { path: file.path, agent: header.label })}
                          onClick={() => void openWorktreeDiff({ workspaceId: header.workspaceId, cwd, baseSha: worktree.baseSha, file: change })}
                        >
                          {i18n.t(CHANGE_LABEL_KEYS[describeSharedFileChange(change.status)])}
                          <FileDiff aria-hidden />
                        </Button>
                      ) : (
                        <span className={sx(styles.unchanged)}>
                          <span aria-hidden>{i18n.t("session:sharedFiles.notChanged")}</span>
                          <VisuallyHidden>{i18n.t("session:sharedFiles.notChangedSpoken")}</VisuallyHidden>
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {unreadable.length > 0 ? (
        <p className={sx(styles.note)} data-testid="shared-files-unreadable">
          {i18n.t("session:sharedFiles.unreadable", { count: unreadable.length, agents: unreadable.map((header) => header.label).join(", ") })}
        </p>
      ) : null}
      <p className={sx(styles.note)}>{i18n.t("session:sharedFiles.scope")}</p>
    </section>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  title: {
    margin: 0,
    flexShrink: 0,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text"],
  },
  summary: {
    flex: "1 1 auto",
    minWidth: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  table: {
    overflowX: "auto",
  },
  agent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: vars["--aui-space-2"],
    minWidth: 0,
  },
  agentName: {
    display: "block",
    maxWidth: "8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  path: {
    display: "block",
    maxWidth: "10rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  fileCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  unchanged: {
    color: vars["--aui-color-text-muted"],
  },
  note: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
});

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Bot, NotebookPen, Paperclip, SquareArrowOutUpRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatAgeCompact, formatNumber } from "@/i18n/format";
import { Badge } from "@/components/aui/components/Badge";
import { Button } from "@/components/aui/components/Button";
import { EmptyState } from "@/components/aui/components/EmptyState";
import { iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { sx } from "@/components/aui/utils/stylex";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatFileSize } from "@/lib/fs/file-preview-limits";
import {
  WORKSPACE_SCRATCH_DIRECTORY,
  WORKSPACE_SCRATCH_RETENTION_DAYS,
  type WorkspaceScratchFile,
} from "@/lib/workspace-scratch";
import {
  groupScratchFiles,
  isScratchFileFresh,
  SCRATCH_FRESH_MS,
  scratchItemName,
  scratchPreviewKind,
} from "@/lib/workspace-scratch-view";
import { useAppStore } from "@/store/app.store";
import {
  selectScratchNewestMtime,
  useWorkspaceScratchStore,
} from "@/store/workspace-scratch-store";
import { useWorkspaceScratchLive } from "./useWorkspaceScratchLive";
import { attachScratchFileToComposer } from "./workspace-scratch-attach";
import { SCRATCH_PREVIEW_ICONS, ScratchFilePreview } from "./WorkspaceScratchPreview";
import { scratchPanelStyles as styles } from "./workspace-scratch-panel.styles";

/** Re-renders on an interval while `enabled`, so ages and the "new" marker stay current. */
function useNow(enabled: boolean, intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs]);
  return now;
}

/** One file row; right-click (or the context-menu key) offers its actions. */
function ScratchFileRow(props: {
  file: WorkspaceScratchFile;
  selected: boolean;
  nested: boolean;
  now: number;
  onSelect: () => void;
  onOpenInEditor: () => void;
  onAttach: () => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const { file, now } = props;
  const Icon = SCRATCH_PREVIEW_ICONS[scratchPreviewKind(file.path)];
  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger render={<div className={sx(styles.rowShell)} />}>
          <Button
            layout="host"
            type="button"
            xstyle={[styles.row, props.nested && styles.rowNested, props.selected && styles.rowSelected]}
            aria-current={props.selected ? "true" : undefined}
            title={file.path}
            onClick={props.onSelect}
            onDoubleClick={props.onOpenInEditor}
          >
            <Icon aria-hidden className={sx(styles.rowIcon)} />
            <span className={sx(styles.rowName)}>{scratchItemName(file.path)}</span>
            {isScratchFileFresh(file, now) ? (
              <Badge size="sm" tone="accent" variant="soft">
                {t("workspaceScratchPanel.new")}
              </Badge>
            ) : null}
            <span className={sx(styles.rowMeta)}>{formatAgeCompact(Math.min(file.mtimeMs, now), now)}</span>
            <span className={sx(styles.rowMeta)}>{formatFileSize(file.sizeBytes)}</span>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent className={sx(styles.contextMenu)}>
          <ContextMenuItem onSelect={props.onAttach}>
            <Paperclip aria-hidden className={sx(styles.rowIcon)} />
            {t("workspaceScratchPanel.attachToMessage")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={props.onOpenInEditor}>
            <SquareArrowOutUpRight aria-hidden className={sx(styles.rowIcon)} />
            {t("workspaceScratchPanel.openInEditor")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

/**
 * The right-rail Scratch panel: what the agent saved to the workspace's
 * `.stave/scratch/` folder, newest first, with sub-agents' files grouped by
 * agent and a live preview of one file. While it is open, main watches the
 * folder and the panel lists it again on each change (a timer stands in when
 * the folder cannot be watched).
 */
export function WorkspaceScratchPanel(props: { visible: boolean }) {
  const { t } = useTranslation(["workspace"]);
  const [workspaceId, rootPath, isMainCheckout, openFileFromTree] = useAppStore(
    useShallow((state) => {
      const workspacePath = state.workspacePathById[state.activeWorkspaceId];
      return [
        state.activeWorkspaceId,
        workspacePath ?? state.repositoryPath ?? undefined,
        // The project's main checkout is never archived, so retention covers it.
        state.workspaceDefaultById[state.activeWorkspaceId] === true ||
          !workspacePath ||
          workspacePath === state.repositoryPath,
        state.openFileFromTree,
      ] as const;
    }),
  );
  const listing = useWorkspaceScratchStore((state) => state.listingByWorkspace[workspaceId]);
  const newestMtime = useWorkspaceScratchStore((state) => selectScratchNewestMtime(state, workspaceId));
  const { error, mode } = useWorkspaceScratchLive({ workspaceId, rootPath, enabled: props.visible });
  const now = useNow(props.visible, SCRATCH_FRESH_MS / 3);
  const [selection, setSelection] = useState<{ workspaceId: string; path: string } | null>(null);

  // Open in a visible window means seen: the rail dot clears.
  useEffect(() => {
    if (!props.visible || newestMtime <= 0) return;
    const markSeen = () => {
      if (document.visibilityState === "visible") {
        useWorkspaceScratchStore.getState().markSeen(workspaceId, newestMtime);
      }
    };
    markSeen();
    document.addEventListener("visibilitychange", markSeen);
    return () => document.removeEventListener("visibilitychange", markSeen);
  }, [props.visible, workspaceId, newestMtime]);

  const files = useMemo(() => listing?.files ?? [], [listing]);
  const items = useMemo(() => groupScratchFiles(files), [files]);
  // Follows the newest file until the user picks one; a picked file that
  // disappears falls back to the newest again.
  const picked = selection?.workspaceId === workspaceId
    ? files.find((file) => file.path === selection.path)
    : undefined;
  const selected = picked ?? files[0];
  const retention = isMainCheckout
    ? t("workspaceScratchPanel.retentionMainCheckout", { count: WORKSPACE_SCRATCH_RETENTION_DAYS })
    : t("workspaceScratchPanel.retentionWorktree");

  const openInEditor = (filePath: string) => {
    void openFileFromTree({ filePath });
  };
  const attach = (filePath: string) => {
    if (rootPath) void attachScratchFileToComposer({ rootPath, filePath });
  };

  if (!rootPath) return null;

  if (!listing || files.length === 0) {
    return (
      <div className={sx(styles.empty)} data-testid="workspace-scratch-empty" data-scratch-refresh={mode}>
        <EmptyState.Root variant="plain">
          <EmptyState.Media>
            <NotebookPen size={iconTileGlyphSizes.xl} />
          </EmptyState.Media>
          <EmptyState.Header>
            <EmptyState.Title>
              {listing || error ? t("workspaceScratchPanel.emptyTitle") : t("workspaceScratchPanel.loading")}
            </EmptyState.Title>
            <EmptyState.Description>
              {t("workspaceScratchPanel.emptyDescription", { folder: WORKSPACE_SCRATCH_DIRECTORY })} {retention}
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState.Root>
      </div>
    );
  }

  const renderRow = (file: WorkspaceScratchFile, nested: boolean) => (
    <ScratchFileRow
      key={file.path}
      file={file}
      nested={nested}
      now={now}
      selected={file.path === selected?.path}
      onSelect={() => setSelection({ workspaceId, path: file.path })}
      onOpenInEditor={() => openInEditor(file.path)}
      onAttach={() => attach(file.path)}
    />
  );

  return (
    <div className={sx(styles.root)} data-testid="workspace-scratch-panel" data-scratch-refresh={mode}>
      <div className={sx(styles.summary)}>
        <span className={sx(styles.summaryText)}>
          {t("workspaceScratchPanel.summary", {
            count: listing.fileCount,
            formattedCount: formatNumber(listing.fileCount),
            size: formatFileSize(listing.totalBytes),
          })}
          {listing.truncated
            ? ` · ${t("workspaceScratchPanel.showingNewest", { count: files.length, formattedCount: formatNumber(files.length) })}`
            : null}
        </span>
      </div>
      <div className={sx(styles.listScroller)}>
        <ul className={sx(styles.list)} aria-label={t("workspaceScratchPanel.filesLabel")}>
          {items.map((item) =>
            item.kind === "file" ? (
              renderRow(item.file, false)
            ) : (
              <li key={`agent:${item.agentId}`} className={sx(styles.group)}>
                <div className={sx(styles.groupHeader)} title={item.agentId}>
                  <Bot aria-hidden className={sx(styles.rowIcon)} />
                  <span className={sx(styles.groupName)}>
                    {t("workspaceScratchPanel.agentGroup", { id: item.agentId })}
                  </span>
                  <span className={sx(styles.rowMeta)}>{formatNumber(item.files.length)}</span>
                </div>
                <ul
                  className={sx(styles.list)}
                  aria-label={t("workspaceScratchPanel.agentGroupLabel", { id: item.agentId })}
                >
                  {item.files.map((file) => renderRow(file, true))}
                </ul>
              </li>
            ),
          )}
        </ul>
      </div>
      {selected ? (
        <ScratchFilePreview
          rootPath={rootPath}
          file={selected}
          onOpenInEditor={openInEditor}
          onAttach={attach}
        />
      ) : null}
      <p className={sx(styles.footer)} data-testid="workspace-scratch-footer">
        {retention}
      </p>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  File,
  FileImage,
  FileJson,
  FileText,
  NotebookPen,
  ScrollText,
  SquareArrowOutUpRight,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatAgeCompact, formatNumber } from "@/i18n/format";
import { Badge } from "@/components/aui/components/Badge";
import { Button } from "@/components/aui/components/Button";
import { EmptyState } from "@/components/aui/components/EmptyState";
import { iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { formatFileSize } from "@/lib/fs/file-preview-limits";
import { WORKSPACE_SCRATCH_DIRECTORY, type WorkspaceScratchFile } from "@/lib/workspace-scratch";
import {
  formatScratchJson,
  isScratchFileFresh,
  SCRATCH_FRESH_MS,
  SCRATCH_PANEL_POLL_MS,
  scratchDisplayName,
  scratchPreviewKind,
  type ScratchPreviewKind,
} from "@/lib/workspace-scratch-view";
import { useAppStore } from "@/store/app.store";
import {
  selectScratchNewestMtime,
  useWorkspaceScratchStore,
} from "@/store/workspace-scratch-store";
import { useWorkspaceScratchPolling } from "./useWorkspaceScratchPolling";
import { scratchPanelStyles as styles } from "./workspace-scratch-panel.styles";

const PREVIEW_ICONS: Record<ScratchPreviewKind, LucideIcon> = {
  image: FileImage,
  json: FileJson,
  log: ScrollText,
  text: FileText,
  other: File,
};

/** A log follows its end while the reader is within this many pixels of it. */
const STICK_TO_BOTTOM_SLACK_PX = 24;

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

type PreviewState =
  | { status: "loading" }
  | { status: "image"; dataUrl: string }
  | { status: "text"; content: string }
  | { status: "too-large" }
  | { status: "unsupported" }
  | { status: "error" };

function ScratchFilePreview(props: {
  rootPath: string;
  file: WorkspaceScratchFile;
  onOpenInEditor: (filePath: string) => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const { rootPath, file } = props;
  const kind = scratchPreviewKind(file.path);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followEndRef = useRef(true);
  const shownPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A new file starts blank; the same file written again keeps its old
    // content on screen until the new one arrives, so a growing log does not flash.
    if (shownPathRef.current !== file.path) {
      shownPathRef.current = file.path;
      followEndRef.current = true;
      setState({ status: "loading" });
    }
    const fs = window.api?.fs;
    if (kind === "other") {
      setState({ status: "unsupported" });
      return;
    }
    if (kind === "image") {
      void fs?.readFileDataUrl?.({ rootPath, filePath: file.path })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setState({ status: "image", dataUrl: result.dataUrl });
          else setState({ status: result.tooLarge ? "too-large" : "error" });
        })
        .catch(() => !cancelled && setState({ status: "error" }));
    } else {
      void fs?.readFile?.({ rootPath, filePath: file.path })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setState({
              status: "text",
              content: kind === "json" ? formatScratchJson(result.content) : result.content,
            });
          } else {
            setState({ status: result.tooLarge ? "too-large" : "error" });
          }
        })
        .catch(() => !cancelled && setState({ status: "error" }));
    }
    return () => {
      cancelled = true;
    };
  }, [rootPath, file.path, file.mtimeMs, file.sizeBytes, kind]);

  // A log stays pinned to its end while the reader is there; scrolling up
  // to read earlier lines stops the follow until they scroll back down.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || kind !== "log" || state.status !== "text") return;
    if (followEndRef.current) element.scrollTop = element.scrollHeight;
  }, [kind, state]);

  const Icon = PREVIEW_ICONS[kind];
  const name = scratchDisplayName(file.path);
  const openInEditor = () => props.onOpenInEditor(file.path);

  return (
    <section className={sx(styles.preview)} aria-label={t("workspaceScratchPanel.previewLabel", { name })}>
      <div className={sx(styles.previewHeader)}>
        <Icon aria-hidden className={sx(styles.rowIcon)} />
        <span className={sx(styles.previewTitle)} title={file.path}>
          {name}
        </span>
        <Tooltip content={t("workspaceScratchPanel.openInEditor")}>
          <Button
            size="xs"
            variant="quiet"
            iconOnly
            aria-label={t("workspaceScratchPanel.openInEditor")}
            onClick={openInEditor}
          >
            <SquareArrowOutUpRight />
          </Button>
        </Tooltip>
      </div>
      <div
        ref={scrollRef}
        className={sx(styles.previewBody)}
        data-testid="scratch-preview-body"
        onScroll={(event) => {
          const element = event.currentTarget;
          followEndRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_TO_BOTTOM_SLACK_PX;
        }}
      >
        {state.status === "image" ? (
          <img className={sx(styles.previewImage)} src={state.dataUrl} alt={name} />
        ) : state.status === "text" ? (
          <pre className={sx(styles.previewText)}>{state.content}</pre>
        ) : state.status === "loading" ? null : (
          <div className={sx(styles.previewNotice)}>
            <span>
              {state.status === "too-large"
                ? t("workspaceScratchPanel.tooLargeToPreview", { size: formatFileSize(file.sizeBytes) })
                : state.status === "unsupported"
                  ? t("workspaceScratchPanel.noPreview")
                  : t("workspaceScratchPanel.previewFailed")}
            </span>
            <Button size="sm" variant="outlined" onClick={openInEditor}>
              {t("workspaceScratchPanel.openInEditor")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The right-rail Scratch panel: what the agent saved to the workspace's
 * `.stave/scratch/` folder, newest first, with a live preview of one file.
 * It lists the folder every 1.5 s while it is open and the window is visible.
 */
export function WorkspaceScratchPanel(props: { visible: boolean }) {
  const { t } = useTranslation(["workspace"]);
  const [workspaceId, rootPath, openFileFromTree] = useAppStore(
    useShallow((state) => [
      state.activeWorkspaceId,
      state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath ?? undefined,
      state.openFileFromTree,
    ] as const),
  );
  const listing = useWorkspaceScratchStore((state) => state.listingByWorkspace[workspaceId]);
  const newestMtime = useWorkspaceScratchStore((state) => selectScratchNewestMtime(state, workspaceId));
  const { error } = useWorkspaceScratchPolling({
    workspaceId,
    rootPath,
    intervalMs: SCRATCH_PANEL_POLL_MS,
    enabled: props.visible,
  });
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

  const files = listing?.files ?? [];
  // Follows the newest file until the user picks one; a picked file that
  // disappears falls back to the newest again.
  const picked = selection?.workspaceId === workspaceId
    ? files.find((file) => file.path === selection.path)
    : undefined;
  const selected = picked ?? files[0];

  const openInEditor = (filePath: string) => {
    void openFileFromTree({ filePath });
  };

  if (!rootPath) return null;

  if (!listing || files.length === 0) {
    return (
      <div className={sx(styles.empty)} data-testid="workspace-scratch-empty">
        <EmptyState.Root variant="plain">
          <EmptyState.Media>
            <NotebookPen size={iconTileGlyphSizes.xl} />
          </EmptyState.Media>
          <EmptyState.Header>
            <EmptyState.Title>
              {listing || error ? t("workspaceScratchPanel.emptyTitle") : t("workspaceScratchPanel.loading")}
            </EmptyState.Title>
            <EmptyState.Description>
              {t("workspaceScratchPanel.emptyDescription", { folder: WORKSPACE_SCRATCH_DIRECTORY })}
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState.Root>
      </div>
    );
  }

  return (
    <div className={sx(styles.root)} data-testid="workspace-scratch-panel">
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
          {files.map((file) => {
            const isSelected = file.path === selected?.path;
            const Icon = PREVIEW_ICONS[scratchPreviewKind(file.path)];
            const fresh = isScratchFileFresh(file, now);
            return (
              <li key={file.path}>
                <Button
                  layout="host"
                  type="button"
                  xstyle={[styles.row, isSelected && styles.rowSelected]}
                  aria-current={isSelected ? "true" : undefined}
                  title={file.path}
                  onClick={() => setSelection({ workspaceId, path: file.path })}
                  onDoubleClick={() => openInEditor(file.path)}
                >
                  <Icon aria-hidden className={sx(styles.rowIcon)} />
                  <span className={sx(styles.rowName)}>{scratchDisplayName(file.path)}</span>
                  {fresh ? (
                    <Badge size="sm" tone="accent" variant="soft">
                      {t("workspaceScratchPanel.new")}
                    </Badge>
                  ) : null}
                  <span className={sx(styles.rowMeta)}>
                    {formatAgeCompact(Math.min(file.mtimeMs, now), now)}
                  </span>
                  <span className={sx(styles.rowMeta)}>{formatFileSize(file.sizeBytes)}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      {selected ? (
        <ScratchFilePreview rootPath={rootPath} file={selected} onOpenInEditor={openInEditor} />
      ) : null}
    </div>
  );
}

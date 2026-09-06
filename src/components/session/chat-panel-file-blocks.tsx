import { Button as AdsButton } from "@/components/ads/components/Button";
import { Suspense, lazy, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge, Button, Card, ImageLightbox } from "@/components/ui";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements";
import {
  type FileChangeSummaryRow,
  isPendingDiffStatus,
  parseFileChangeToolInput,
  summarizeDiffLineChanges,
} from "@/components/session/chat-panel.utils";
import { chatDiffTabId } from "@/lib/editor/snapshot-diff-tabs";
import {
  formatWorkspaceFilePathForDisplay,
  resolveWorkspaceRelativeFilePath,
} from "@/lib/workspace-file-path";
import { toBaseName } from "@/lib/message-file-links";
import { sx } from "@/components/ads/utils/stylex";
import { chatPanelFileBlocksStyles as styles } from "./chat-panel-file-blocks.styles";
import { useAppStore } from "@/store/app.store";
import type {
  CodeDiffPart,
  FileContextPart,
  ImageContextPart,
} from "@/types/chat";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));

function resolveChatBlockFilePath(args: {
  filePath: string;
  workspacePath?: string;
}) {
  const openFilePath = resolveWorkspaceRelativeFilePath(args) ?? args.filePath;
  return {
    openFilePath,
    displayFilePath: formatWorkspaceFilePathForDisplay(args),
  };
}

function getFileChangeStatusPriority(status: FileChangeSummaryRow["status"]) {
  switch (status) {
    case "failed":
      return 3;
    case "skipped":
      return 2;
    case "applied":
      return 1;
  }
}

const CHAT_DIFF_VIEWER_STYLES = {
  variables: {
    light: {
      diffViewerBackground: "var(--editor)",
      diffViewerTitleBackground: "var(--editor-tab)",
      diffViewerColor: "var(--editor-foreground)",
      diffViewerTitleColor: "var(--editor-foreground)",
      diffViewerTitleBorderColor: "var(--border)",
      addedBackground: "var(--diff-added)",
      addedColor: "var(--diff-added-foreground)",
      removedBackground: "var(--diff-removed)",
      removedColor: "var(--diff-removed-foreground)",
      addedGutterBackground: "var(--diff-added)",
      removedGutterBackground: "var(--diff-removed)",
      gutterBackground: "var(--editor-muted)",
      gutterColor: "var(--muted-foreground)",
      addedGutterColor: "var(--diff-added-foreground)",
      removedGutterColor: "var(--diff-removed-foreground)",
      highlightBackground:
        "color-mix(in oklch, var(--accent) 14%, transparent)",
      highlightGutterBackground:
        "color-mix(in oklch, var(--accent) 18%, transparent)",
      codeFoldBackground: "var(--editor-muted)",
      codeFoldGutterBackground: "var(--editor-muted)",
      codeFoldContentColor: "var(--muted-foreground)",
      emptyLineBackground: "var(--editor)",
    },
    dark: {
      diffViewerBackground: "var(--editor)",
      diffViewerTitleBackground: "var(--editor-tab)",
      diffViewerColor: "var(--editor-foreground)",
      diffViewerTitleColor: "var(--editor-foreground)",
      diffViewerTitleBorderColor: "var(--border)",
      addedBackground: "var(--diff-added)",
      addedColor: "var(--diff-added-foreground)",
      removedBackground: "var(--diff-removed)",
      removedColor: "var(--diff-removed-foreground)",
      addedGutterBackground: "var(--diff-added)",
      removedGutterBackground: "var(--diff-removed)",
      gutterBackground: "var(--editor-muted)",
      gutterBackgroundDark: "var(--editor-muted)",
      gutterColor: "var(--muted-foreground)",
      addedGutterColor: "var(--diff-added-foreground)",
      removedGutterColor: "var(--diff-removed-foreground)",
      highlightBackground:
        "color-mix(in oklch, var(--accent) 14%, transparent)",
      highlightGutterBackground:
        "color-mix(in oklch, var(--accent) 18%, transparent)",
      codeFoldBackground: "var(--editor-muted)",
      codeFoldGutterBackground: "var(--editor-muted)",
      codeFoldContentColor: "var(--muted-foreground)",
      emptyLineBackground: "var(--editor)",
    },
  },
} as const;

function ChangeCount(args: { value: number; tone: "added" | "removed" }) {
  return (
    <span
      className={sx(
        styles.changeCountBase,
        args.tone === "added"
          ? styles.changeCountAdded
          : styles.changeCountRemoved,
      )}
    >
      {args.tone === "added" ? "+" : "-"}
      {args.value}
    </span>
  );
}

export function ChangedFilesBlock(args: {
  parts: CodeDiffPart[];
  taskId: string;
  messageId: string;
  startIndex?: number;
}) {
  const { parts, taskId, messageId, startIndex = 0 } = args;
  const resolveDiff = useAppStore((state) => state.resolveDiff);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const workspaceCwd = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.projectPath ??
      undefined,
  );
  const [openRows, setOpenRows] = useState<number[]>([]);

  const rows = useMemo(
    () =>
      parts.map((part) => ({
        part,
        ...resolveChatBlockFilePath({
          filePath: part.filePath,
          workspacePath: workspaceCwd,
        }),
        summary: summarizeDiffLineChanges({
          oldContent: part.oldContent,
          newContent: part.newContent,
        }),
      })),
    [parts, workspaceCwd],
  );
  const totalAdded = useMemo(
    () => rows.reduce((sum, row) => sum + row.summary.added, 0),
    [rows],
  );
  const totalRemoved = useMemo(
    () => rows.reduce((sum, row) => sum + row.summary.removed, 0),
    [rows],
  );
  const pendingCount = useMemo(
    () => parts.filter((part) => isPendingDiffStatus(part.status)).length,
    [parts],
  );

  function toggleRow(index: number) {
    setOpenRows((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index],
    );
  }

  function openDiff(args: { part: CodeDiffPart; index: number }) {
    const normalizedFilePath =
      resolveWorkspaceRelativeFilePath({
        filePath: args.part.filePath,
        workspacePath: workspaceCwd,
      }) ?? args.part.filePath;
    void openDiffInEditor({
      editorTabId: chatDiffTabId({
        messageId,
        filePath: normalizedFilePath,
        index: startIndex + args.index,
      }),
      filePath: normalizedFilePath,
      oldContent: args.part.oldContent,
      newContent: args.part.newContent,
    });
  }

  return (
    <Card className={sx(styles.card)}>
      <div className={sx(styles.cardHeader)}>
        <div className={sx(styles.cardHeaderInfo)}>
          <span className={sx(styles.headerTitleSmall)}>
            {parts.length} {parts.length === 1 ? "file" : "files"} edited
          </span>
          <ChangeCount value={totalAdded} tone="added" />
          <ChangeCount value={totalRemoved} tone="removed" />
          {pendingCount > 0 ? (
            <Badge variant="destructive">{pendingCount} pending</Badge>
          ) : null}
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={sx(styles.shrink0)}
          onClick={() => {
            rows.forEach((row, index) => {
              openDiff({ part: row.part, index });
            });
          }}
        >
          Open All
        </Button>
      </div>
      <div className={sx(styles.divideList)}>
        {rows.map((row, index) => {
          const isOpen = openRows.includes(index);
          const isPendingDiff = isPendingDiffStatus(row.part.status);
          return (
            <div
              key={`${row.openFilePath}-${index}`}
              className={sx(
                styles.rowWrapper,
                index === 0 && styles.rowWrapperFirst,
              )}
            >
              <AdsButton
                layout="host"
                type="button"
                xstyle={styles.rowButton}
                onClick={() => toggleRow(index)}
              >
                <span className={sx(styles.filePath)}>
                  {row.displayFilePath}
                </span>
                <ChangeCount value={row.summary.added} tone="added" />
                <ChangeCount value={row.summary.removed} tone="removed" />
                {isPendingDiff ? (
                  <span className={sx(styles.pendingDot)} aria-hidden="true" />
                ) : null}
                {isOpen ? (
                  <ChevronDown className={sx(styles.chevron)} />
                ) : (
                  <ChevronRight className={sx(styles.chevron)} />
                )}
              </AdsButton>
              {isOpen ? (
                <div className={sx(styles.expandedBody)}>
                  <div className={sx(styles.diffScroll)}>
                    <Suspense
                      fallback={
                        <div className={sx(styles.diffLoading)}>
                          Loading diff...
                        </div>
                      }
                    >
                      <ReactDiffViewer
                        oldValue={row.part.oldContent}
                        newValue={row.part.newContent}
                        splitView={false}
                        hideLineNumbers={false}
                        useDarkTheme={isDarkMode}
                        styles={CHAT_DIFF_VIEWER_STYLES}
                      />
                    </Suspense>
                  </div>
                  <div className={sx(styles.actionBar)}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDiff({ part: row.part, index })}
                    >
                      Open in Editor
                    </Button>
                    {isPendingDiff ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            resolveDiff({
                              taskId,
                              messageId,
                              accepted: true,
                              partIndex: startIndex + index,
                            })
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            resolveDiff({
                              taskId,
                              messageId,
                              accepted: false,
                              partIndex: startIndex + index,
                            })
                          }
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FileChangeStatusBadge(args: {
  status: FileChangeSummaryRow["status"];
}) {
  switch (args.status) {
    case "applied":
      return <Badge variant="success">applied</Badge>;
    case "skipped":
      return <Badge variant="warning">skipped</Badge>;
    case "failed":
      return <Badge variant="destructive">failed</Badge>;
  }
}

export function FileChangeSummaryBlock(args: { rows: FileChangeSummaryRow[] }) {
  const { rows } = args;
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const workspaceCwd = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.projectPath ??
      undefined,
  );

  const normalizedRows = useMemo(() => {
    const dedupedRows = new Map<
      string,
      {
        row: FileChangeSummaryRow;
        displayFilePath: string;
        openFilePath: string;
      }
    >();

    for (const row of rows) {
      const resolved = resolveChatBlockFilePath({
        filePath: row.filePath,
        workspacePath: workspaceCwd,
      });
      const key = resolved.openFilePath.trim();
      const existing = dedupedRows.get(key);
      if (
        !existing ||
        getFileChangeStatusPriority(row.status) >
          getFileChangeStatusPriority(existing.row.status)
      ) {
        dedupedRows.set(key, {
          row,
          displayFilePath: resolved.displayFilePath,
          openFilePath: resolved.openFilePath,
        });
      }
    }

    return Array.from(dedupedRows.values());
  }, [rows, workspaceCwd]);

  const appliedCount = useMemo(
    () => normalizedRows.filter(({ row }) => row.status === "applied").length,
    [normalizedRows],
  );
  const skippedCount = useMemo(
    () => normalizedRows.filter(({ row }) => row.status === "skipped").length,
    [normalizedRows],
  );
  const failedCount = useMemo(
    () => normalizedRows.filter(({ row }) => row.status === "failed").length,
    [normalizedRows],
  );

  return (
    <Card className={sx(styles.card)}>
      <div className={sx(styles.cardHeader)}>
        <div className={sx(styles.cardHeaderInfo)}>
          <span className={sx(styles.headerTitleBody)}>
            {normalizedRows.length}{" "}
            {normalizedRows.length === 1 ? "file" : "files"} changed
          </span>
          {appliedCount > 0 ? (
            <Badge variant="success">{appliedCount} applied</Badge>
          ) : null}
          {skippedCount > 0 ? (
            <Badge variant="warning">{skippedCount} skipped</Badge>
          ) : null}
          {failedCount > 0 ? (
            <Badge variant="destructive">{failedCount} failed</Badge>
          ) : null}
        </div>
      </div>
      <div className={sx(styles.divideList)}>
        {normalizedRows.map(({ row, displayFilePath, openFilePath }, index) => (
          <div
            key={`${openFilePath}-${index}`}
            className={sx(
              styles.staticFileRow,
              index === 0 && styles.staticFileRowFirst,
            )}
          >
            <span className={sx(styles.filePath)}>{displayFilePath}</span>
            <FileChangeStatusBadge status={row.status} />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className={sx(styles.shrink0)}
              onClick={() => void openFileFromTree({ filePath: openFilePath })}
            >
              Open
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function FileChangeToolBlock(args: { input: string }) {
  const rows = useMemo(
    () => parseFileChangeToolInput(args.input),
    [args.input],
  );
  if (rows.length === 0) {
    return null;
  }
  return <FileChangeSummaryBlock rows={rows} />;
}

export function ReferencedFilesBlock(args: { parts: FileContextPart[] }) {
  const { parts } = args;
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const workspaceCwd = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.projectPath ??
      undefined,
  );
  const [openRows, setOpenRows] = useState<number[]>([]);
  const resolvedParts = useMemo(
    () =>
      parts.map((part) => ({
        part,
        ...resolveChatBlockFilePath({
          filePath: part.filePath,
          workspacePath: workspaceCwd,
        }),
      })),
    [parts, workspaceCwd],
  );

  function toggleRow(index: number) {
    setOpenRows((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index],
    );
  }

  return (
    <Card className={sx(styles.card)}>
      <div className={sx(styles.cardHeader)}>
        <div className={sx(styles.cardHeaderInfo)}>
          <span className={sx(styles.headerTitleSmall)}>
            {parts.length}{" "}
            {parts.length === 1 ? "referenced file" : "referenced files"}
          </span>
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={sx(styles.shrink0)}
          onClick={() => {
            const firstPath = resolvedParts[0]?.openFilePath;
            if (!firstPath) {
              return;
            }
            void openFileFromTree({ filePath: firstPath });
          }}
          disabled={parts.length === 0}
        >
          Open
        </Button>
      </div>
      <div className={sx(styles.divideList)}>
        {resolvedParts.map(({ part, displayFilePath, openFilePath }, index) => {
          const isOpen = openRows.includes(index);
          return (
            <div
              key={`${openFilePath}-${index}`}
              className={sx(
                styles.rowWrapper,
                index === 0 && styles.rowWrapperFirst,
              )}
            >
              <AdsButton
                layout="host"
                type="button"
                xstyle={styles.rowButton}
                onClick={() => toggleRow(index)}
              >
                <span className={sx(styles.filePath)}>{displayFilePath}</span>
                <Badge variant="outline" className={sx(styles.shrink0)}>
                  {part.language || toBaseName(openFilePath)}
                </Badge>
                {isOpen ? (
                  <ChevronDown className={sx(styles.chevron)} />
                ) : (
                  <ChevronRight className={sx(styles.chevron)} />
                )}
              </AdsButton>
              {isOpen ? (
                <div className={sx(styles.expandedBody)}>
                  <CodeBlock
                    code={part.content}
                    language={part.language}
                    className={sx(styles.codeBlock)}
                  >
                    <CodeBlockHeader className={sx(styles.codeBlockHeader)}>
                      <CodeBlockTitle>
                        {part.language || toBaseName(part.filePath)}
                      </CodeBlockTitle>
                      <CodeBlockActions>
                        <CodeBlockCopyButton />
                      </CodeBlockActions>
                    </CodeBlockHeader>
                  </CodeBlock>
                  {part.instruction ? (
                    <div className={sx(styles.instruction)}>
                      {part.instruction}
                    </div>
                  ) : null}
                  <div className={sx(styles.actionBar)}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void openFileFromTree({ filePath: openFilePath })
                      }
                    >
                      Open in Editor
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ImageAttachmentBlock(args: { parts: ImageContextPart[] }) {
  const [previewSrc, setPreviewSrc] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);

  return (
    <>
      <div className={sx(styles.imageGrid)}>
        {args.parts.map((part, index) => (
          <div key={index} className={sx(styles.imageCard)}>
            <img
              src={part.dataUrl}
              alt={part.label}
              className={sx(styles.image)}
              title="Click to view full size"
              onClick={() =>
                setPreviewSrc({ dataUrl: part.dataUrl, label: part.label })
              }
            />
            <p className={sx(styles.imageLabel)}>{part.label}</p>
          </div>
        ))}
      </div>
      <ImageLightbox
        open={Boolean(previewSrc)}
        imageSrc={previewSrc?.dataUrl ?? ""}
        alt={previewSrc?.label ?? "Image preview"}
        onClose={() => setPreviewSrc(null)}
      />
    </>
  );
}

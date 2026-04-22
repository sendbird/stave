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
import {
  formatWorkspaceFilePathForDisplay,
  resolveWorkspaceRelativeFilePath,
} from "@/lib/workspace-file-path";
import { toBaseName } from "@/lib/message-file-links";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { CodeDiffPart, FileContextPart, ImageContextPart } from "@/types/chat";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));

function resolveChatBlockFilePath(args: { filePath: string; workspacePath?: string }) {
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
      highlightBackground: "color-mix(in oklch, var(--accent) 14%, transparent)",
      highlightGutterBackground: "color-mix(in oklch, var(--accent) 18%, transparent)",
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
      highlightBackground: "color-mix(in oklch, var(--accent) 14%, transparent)",
      highlightGutterBackground: "color-mix(in oklch, var(--accent) 18%, transparent)",
      codeFoldBackground: "var(--editor-muted)",
      codeFoldGutterBackground: "var(--editor-muted)",
      codeFoldContentColor: "var(--muted-foreground)",
      emptyLineBackground: "var(--editor)",
    },
  },
} as const;

function toDiffEditorTabId(args: { messageId: string; filePath: string; index: number }) {
  return `chat-diff:${args.messageId}:${args.index}:${args.filePath}`;
}

function ChangeCount(args: { value: number; tone: "added" | "removed" }) {
  return (
    <span
      className={cn(
        "shrink-0 text-[0.875em] font-medium tabular-nums",
        args.tone === "added" ? "text-success" : "text-destructive",
      )}
    >
      {args.tone === "added" ? "+" : "-"}
      {args.value}
    </span>
  );
}

export function ChangedFilesBlock(args: { parts: CodeDiffPart[]; taskId: string; messageId: string; startIndex?: number }) {
  const { parts, taskId, messageId, startIndex = 0 } = args;
  const resolveDiff = useAppStore((state) => state.resolveDiff);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const workspaceCwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined);
  const [openRows, setOpenRows] = useState<number[]>([]);

  const rows = useMemo(() => parts.map((part) => ({
    part,
    ...resolveChatBlockFilePath({
      filePath: part.filePath,
      workspacePath: workspaceCwd,
    }),
    summary: summarizeDiffLineChanges({
      oldContent: part.oldContent,
      newContent: part.newContent,
    }),
  })), [parts, workspaceCwd]);
  const totalAdded = useMemo(() => rows.reduce((sum, row) => sum + row.summary.added, 0), [rows]);
  const totalRemoved = useMemo(() => rows.reduce((sum, row) => sum + row.summary.removed, 0), [rows]);
  const pendingCount = useMemo(() => parts.filter((part) => isPendingDiffStatus(part.status)).length, [parts]);

  function toggleRow(index: number) {
    setOpenRows((current) => (
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
    ));
  }

  function openDiff(args: { part: CodeDiffPart; index: number }) {
    const normalizedFilePath = resolveWorkspaceRelativeFilePath({
      filePath: args.part.filePath,
      workspacePath: workspaceCwd,
    }) ?? args.part.filePath;
    openDiffInEditor({
      editorTabId: toDiffEditorTabId({
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
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[0.875em] font-medium">
            {parts.length} {parts.length === 1 ? "file" : "files"} edited
          </span>
          <ChangeCount value={totalAdded} tone="added" />
          <ChangeCount value={totalRemoved} tone="removed" />
          {pendingCount > 0 ? <Badge variant="destructive">{pendingCount} pending</Badge> : null}
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            rows.forEach((row, index) => {
              openDiff({ part: row.part, index });
            });
          }}
        >
          Open All
        </Button>
      </div>
      <div className="divide-y">
        {rows.map((row, index) => {
          const isOpen = openRows.includes(index);
          const isPendingDiff = isPendingDiffStatus(row.part.status);
          return (
            <div key={`${row.openFilePath}-${index}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
                onClick={() => toggleRow(index)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{row.displayFilePath}</span>
                <ChangeCount value={row.summary.added} tone="added" />
                <ChangeCount value={row.summary.removed} tone="removed" />
                {isPendingDiff ? <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" /> : null}
                {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
              {isOpen ? (
                <div className="border-t bg-card/40">
                  <div className="overflow-x-auto">
                    <Suspense fallback={<div className="px-3 py-2 text-[0.875em] text-muted-foreground">Loading diff...</div>}>
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
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => openDiff({ part: row.part, index })}>
                      Open in Editor
                    </Button>
                    {isPendingDiff ? (
                      <>
                        <Button size="sm" onClick={() => resolveDiff({ taskId, messageId, accepted: true, partIndex: startIndex + index })}>Accept</Button>
                        <Button size="sm" variant="outline" onClick={() => resolveDiff({ taskId, messageId, accepted: false, partIndex: startIndex + index })}>
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

function FileChangeStatusBadge(args: { status: FileChangeSummaryRow["status"] }) {
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
  const workspaceCwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined);

  const normalizedRows = useMemo(() => {
    const dedupedRows = new Map<string, {
      row: FileChangeSummaryRow;
      displayFilePath: string;
      openFilePath: string;
    }>();

    for (const row of rows) {
      const resolved = resolveChatBlockFilePath({
        filePath: row.filePath,
        workspacePath: workspaceCwd,
      });
      const key = resolved.openFilePath.trim();
      const existing = dedupedRows.get(key);
      if (!existing || getFileChangeStatusPriority(row.status) > getFileChangeStatusPriority(existing.row.status)) {
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
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
            {normalizedRows.length} {normalizedRows.length === 1 ? "file" : "files"} changed
          </span>
          {appliedCount > 0 ? <Badge variant="success">{appliedCount} applied</Badge> : null}
          {skippedCount > 0 ? <Badge variant="warning">{skippedCount} skipped</Badge> : null}
          {failedCount > 0 ? <Badge variant="destructive">{failedCount} failed</Badge> : null}
        </div>
      </div>
      <div className="divide-y">
        {normalizedRows.map(({ row, displayFilePath, openFilePath }, index) => (
          <div key={`${openFilePath}-${index}`} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">{displayFilePath}</span>
            <FileChangeStatusBadge status={row.status} />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="shrink-0"
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
  const rows = useMemo(() => parseFileChangeToolInput(args.input), [args.input]);
  if (rows.length === 0) {
    return null;
  }
  return <FileChangeSummaryBlock rows={rows} />;
}

export function ReferencedFilesBlock(args: { parts: FileContextPart[] }) {
  const { parts } = args;
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const workspaceCwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined);
  const [openRows, setOpenRows] = useState<number[]>([]);
  const resolvedParts = useMemo(() => parts.map((part) => ({
    part,
    ...resolveChatBlockFilePath({
      filePath: part.filePath,
      workspacePath: workspaceCwd,
    }),
  })), [parts, workspaceCwd]);

  function toggleRow(index: number) {
    setOpenRows((current) => (
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
    ));
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[0.875em] font-medium">
            {parts.length} {parts.length === 1 ? "referenced file" : "referenced files"}
          </span>
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0"
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
      <div className="divide-y">
        {resolvedParts.map(({ part, displayFilePath, openFilePath }, index) => {
          const isOpen = openRows.includes(index);
          return (
            <div key={`${openFilePath}-${index}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
                onClick={() => toggleRow(index)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{displayFilePath}</span>
                <Badge variant="outline" className="shrink-0">
                  {part.language || toBaseName(openFilePath)}
                </Badge>
                {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
              {isOpen ? (
                <div className="border-t bg-card/40">
                  <CodeBlock code={part.content} language={part.language} className="m-0 rounded-none border-0 border-b">
                    <CodeBlockHeader className="border-b-border/70">
                      <CodeBlockTitle>{part.language || toBaseName(part.filePath)}</CodeBlockTitle>
                      <CodeBlockActions>
                        <CodeBlockCopyButton />
                      </CodeBlockActions>
                    </CodeBlockHeader>
                  </CodeBlock>
                  {part.instruction ? (
                    <div className="border-t px-3 py-2 text-[0.875em] text-muted-foreground">{part.instruction}</div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => void openFileFromTree({ filePath: openFilePath })}>
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
  const [previewSrc, setPreviewSrc] = useState<{ dataUrl: string; label: string } | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {args.parts.map((part, index) => (
          <div key={index} className="overflow-hidden rounded-md border border-border/80">
            <img
              src={part.dataUrl}
              alt={part.label}
              className="max-h-48 cursor-zoom-in object-contain"
              title="Click to view full size"
              onClick={() => setPreviewSrc({ dataUrl: part.dataUrl, label: part.label })}
            />
            <p className="border-t border-border/60 bg-muted/30 px-2 py-1 text-[0.75em] text-muted-foreground">{part.label}</p>
          </div>
        ))}
      </div>
      <ImageLightbox
        open={Boolean(previewSrc)}
        imageSrc={previewSrc?.dataUrl ?? ""}
        alt={previewSrc?.label ?? "Image preview"}
        imageTitle="Click to close"
        onClose={() => setPreviewSrc(null)}
      />
    </>
  );
}

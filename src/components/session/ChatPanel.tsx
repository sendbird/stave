import { memo, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { Check, ChevronDown, ChevronRight, Clock3, Copy, MessageSquareIcon } from "lucide-react";
import { Badge, Button, Card, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, WaveIndicator } from "@/components/ui";
import {
  ChainOfThought,
  type ChainOfThoughtStep,
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationVirtualList,
  ConfirmationCompact,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  ModelIcon,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  SubagentCard,
  TodoCard,
  Tool,
  ToolContent,
  ToolGroup,
  ToolHeader,
  ToolInput,
  ToolOutput,
  UserInputCard,
  parseSubagentToolInput,
} from "@/components/ai-elements";
import {
  getMessageBodyFallbackState,
  getMessageScrollFingerprint,
  getRenderableMessageParts,
  groupMessageParts,
  hasVisibleMessagePartContent,
  isPendingDiffStatus,
  shouldRenderInlineToolPart,
  shouldRenderInlineSystemEvent,
  shouldAutoOpenToolGroup,
  shouldAutoOpenToolPart,
  summarizeReplayOnlyToolParts,
  summarizeDiffLineChanges,
} from "@/components/session/chat-panel.utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { getProviderWaveToneClass, toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, CodeDiffPart, FileContextPart, ImageContextPart, MessagePart } from "@/types/chat";
import { SessionReplayDrawer, type SessionReplayRequestContext } from "@/components/session/SessionReplayDrawer";
import { useShallow } from "zustand/react/shallow";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));

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

const EMPTY_MESSAGES: ChatMessage[] = [];

function toProviderStartCase(args: { providerId: "claude-code" | "codex" | "stave" }) {
  return args.providerId
    .split("-")
    .map((chunk) => `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`)
    .join(" ");
}

function toProviderWaveToneClass(args: { providerId: "claude-code" | "codex" | "stave" | "user" }) {
  if (args.providerId === "user") {
    return "text-primary";
  }
  return getProviderWaveToneClass({ providerId: args.providerId });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <MessageAction
      label="Copy"
      tooltip="Copy message"
      onClick={() => {
        void copyTextToClipboard(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </MessageAction>
  );
}

function toBaseName(filePath: string) {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

function toDiffEditorTabId(args: { messageId: string; filePath: string; index: number }) {
  return `chat-diff:${args.messageId}:${args.index}:${args.filePath}`;
}

function ChangeCount(args: { value: number; tone: "added" | "removed" }) {
  return (
    <span
      className={cn(
        "shrink-0 text-sm font-medium tabular-nums",
        args.tone === "added" ? "text-success" : "text-destructive",
      )}
    >
      {args.tone === "added" ? "+" : "-"}
      {args.value}
    </span>
  );
}

function ChangedFilesBlock(args: { parts: CodeDiffPart[]; taskId: string; messageId: string; startIndex?: number }) {
  const { parts, taskId, messageId, startIndex = 0 } = args;
  const resolveDiff = useAppStore((state) => state.resolveDiff);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const [openRows, setOpenRows] = useState<number[]>([]);

  const rows = useMemo(() => parts.map((part) => ({
    part,
    summary: summarizeDiffLineChanges({
      oldContent: part.oldContent,
      newContent: part.newContent,
    }),
  })), [parts]);
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
    openDiffInEditor({
      editorTabId: toDiffEditorTabId({
        messageId,
        filePath: args.part.filePath,
        index: startIndex + args.index,
      }),
      filePath: args.part.filePath,
      oldContent: args.part.oldContent,
      newContent: args.part.newContent,
    });
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
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
            <div key={`${row.part.filePath}-${index}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
                onClick={() => toggleRow(index)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{row.part.filePath}</span>
                <ChangeCount value={row.summary.added} tone="added" />
                <ChangeCount value={row.summary.removed} tone="removed" />
                {isPendingDiff ? <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" /> : null}
                {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </button>
              {isOpen ? (
                <div className="border-t bg-card/40">
                  <div className="overflow-x-auto">
                    <Suspense fallback={<div className="px-3 py-2 text-sm text-muted-foreground">Loading diff...</div>}>
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

function ReferencedFilesBlock(args: { parts: FileContextPart[] }) {
  const { parts } = args;
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const [openRows, setOpenRows] = useState<number[]>([]);

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
          <span className="text-sm font-medium">
            {parts.length} {parts.length === 1 ? "referenced file" : "referenced files"}
          </span>
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            const firstPath = parts[0]?.filePath;
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
        {parts.map((part, index) => {
          const isOpen = openRows.includes(index);
          return (
            <div key={`${part.filePath}-${index}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
                onClick={() => toggleRow(index)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{part.filePath}</span>
                <Badge variant="outline" className="shrink-0">
                  {part.language || toBaseName(part.filePath)}
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
                    <div className="border-t px-3 py-2 text-sm text-muted-foreground">{part.instruction}</div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => void openFileFromTree({ filePath: part.filePath })}>
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

function ImageAttachmentBlock(args: { parts: ImageContextPart[] }) {
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
            <p className="border-t border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">{part.label}</p>
          </div>
        ))}
      </div>
      {previewSrc ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Image full screen preview"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewSrc(null);
            }}
          >
            Close
          </button>
          <img
            src={previewSrc.dataUrl}
            alt={previewSrc.label}
            className="max-h-full max-w-full cursor-zoom-out object-contain"
            title="Click to close"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewSrc(null);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function MessagePartRenderer(args: { part: MessagePart; taskId: string; messageId: string; isStreaming?: boolean; isLastTextPart?: boolean }) {
  const { part, taskId, messageId, isStreaming, isLastTextPart } = args;
  const resolveApproval = useAppStore((state) => state.resolveApproval);
  const resolveUserInput = useAppStore((state) => state.resolveUserInput);

  switch (part.type) {
    case "tool_use":
      if (isSubagentToolPart({ toolName: part.toolName })) {
        return (
          <SubagentCard
            defaultOpen={false}
            input={part.input}
            output={part.output}
            state={part.state}
          />
        );
      }
      if (isTodoToolPart({ toolName: part.toolName })) {
        return (
          <TodoCard
            defaultOpen={true}
            input={part.input}
            output={part.output}
            state={part.state}
          />
        );
      }
      return (
        <Tool
          defaultOpen={shouldAutoOpenToolPart(part.state)}
          openWhen={shouldAutoOpenToolPart(part.state)}
        >
          <ToolHeader type={part.toolName} state={part.state} elapsedSeconds={part.elapsedSeconds} />
          <ToolContent>
            <ToolInput input={part.input} />
            {(part.state !== "input-streaming" || part.output?.trim()) && (
              <ToolOutput
                label={part.state === "input-streaming" ? "Live output" : undefined}
                output={part.output ? <pre className="whitespace-pre-wrap text-sm">{part.output}</pre> : null}
                errorText={part.state === "output-error" ? (part.output ?? "Tool failed.") : undefined}
              />
            )}
          </ToolContent>
        </Tool>
      );
    case "code_diff":
      return <ChangedFilesBlock parts={[part]} taskId={taskId} messageId={messageId} startIndex={0} />;
    case "file_context":
      return <ReferencedFilesBlock parts={[part]} />;
    case "image_context":
      return <ImageAttachmentBlock parts={[part]} />;
    case "approval":
      return (
        <ConfirmationCompact
          toolName={part.toolName}
          description={part.description}
          state={part.state}
          onApprove={() => resolveApproval({ taskId, messageId, approved: true })}
          onReject={() => resolveApproval({ taskId, messageId, approved: false })}
        />
      );
    case "user_input":
      return (
        <UserInputCard
          toolName={part.toolName}
          questions={part.questions}
          answers={part.answers}
          state={part.state}
          onSubmit={(answers) => resolveUserInput({ taskId, messageId, answers })}
          onDeny={() => resolveUserInput({ taskId, messageId, denied: true })}
        />
      );
    case "system_event":
      if (!shouldRenderInlineSystemEvent({ content: part.content })) {
        return null;
      }
      return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm italic text-muted-foreground">{part.content}</p>;
    case "text":
      if (!part.text?.trim()) return null;
      return <MessageResponse isStreaming={isStreaming && isLastTextPart}>{part.text}</MessageResponse>;
    case "thinking":
      return null;
  }
}

function isSubagentToolPart(args: { toolName: string }) {
  return args.toolName.trim().toLowerCase() === "agent";
}

function isTodoToolPart(args: { toolName: string }) {
  return args.toolName.trim().toLowerCase() === "todowrite";
}

function toToolDisplayName(toolName: string) {
  return toolName
    .trim()
    .replace(/^tool[-_:]?/i, "")
    .replaceAll(/[_-]+/g, " ")
    || "Tool";
}

function BackgroundActionsSummary(args: { parts: MessagePart[]; onOpenReplay?: () => void }) {
  const summary = useMemo(() => summarizeReplayOnlyToolParts(args.parts), [args.parts]);

  if (summary.totalActions === 0) {
    return null;
  }

  const statusLabel = summary.activeActions > 0
    ? `${summary.activeActions} running`
    : summary.failedActions > 0
    ? `${summary.failedActions} with issues`
    : null;

  return (
    <Card className="gap-3 border-dashed border-border/80 bg-muted/20 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {summary.totalActions} {summary.totalActions === 1 ? "background action" : "background actions"}
          </p>
          {statusLabel ? (
            <Badge variant="destructive">
              {statusLabel}
            </Badge>
          ) : null}
          {args.onOpenReplay ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="ml-auto"
                    aria-label="Open Session Replay"
                    onClick={args.onOpenReplay}
                  >
                    <Clock3 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open Session Replay</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.byTool.slice(0, 5).map((item) => (
          <Badge key={item.toolName} variant="outline">
            {toToolDisplayName(item.toolName)} x{item.count}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function buildChainOfThoughtSteps(parts: MessagePart[]): ChainOfThoughtStep[] {
  const steps: ChainOfThoughtStep[] = [];
  parts.forEach((part, index) => {
    if (part.type === "tool_use") {
      const isSubagent = isSubagentToolPart({ toolName: part.toolName });
      if (!isSubagent) {
        return;
      }
      const subagentInput = isSubagent ? parseSubagentToolInput({ input: part.input }) : null;
      steps.push({
        id: `tool-${index}`,
        label: isSubagent
          ? subagentInput?.description ?? subagentInput?.subagentType ?? "Subagent"
          : part.toolName,
        detail: isSubagent
          ? (subagentInput?.prompt ?? part.input ?? part.output)
          : part.input || part.output,
        status: part.state === "input-streaming"
          ? "active"
          : part.state === "output-available"
          ? "done"
          : "pending",
        kind: isSubagent ? "agent" : "tool",
      });
      return;
    }
    if (part.type === "system_event") {
      steps.push({
        id: `system-${index}`,
        label: part.content,
        status: "done",
        kind: "system",
      });
    }
  });
  return steps;
}

function MessageBody(args: {
  message: { content?: string; parts: MessagePart[]; isStreaming?: boolean };
  taskId: string;
  messageId: string;
  streamingEnabled: boolean;
  onOpenReplay?: () => void;
}) {
  const { message, taskId, messageId, streamingEnabled, onOpenReplay } = args;
  const reasoningDefaultExpanded = useAppStore((state) => state.settings.reasoningDefaultExpanded);
  const isActivelyStreaming = Boolean(message.isStreaming);
  const isStreaming = streamingEnabled && isActivelyStreaming;
  const renderableParts = useMemo(() => getRenderableMessageParts({
    content: message.content ?? "",
    parts: message.parts,
  }), [message.content, message.parts]);
  const reasoningParts = useMemo(() => renderableParts.filter((part) => part.type === "thinking"), [renderableParts]);
  const hasReasoning = reasoningParts.length > 0;
  const reasoningText = useMemo(() => reasoningParts.map((part) => part.text).join(""), [reasoningParts]);
  const visibleParts = useMemo(() => renderableParts.filter(hasVisibleMessagePartContent), [renderableParts]);
  const chainOfThoughtSteps = useMemo(() => buildChainOfThoughtSteps(renderableParts), [renderableParts]);
  const hasChainOfThought = chainOfThoughtSteps.length > 0;
  const showChainOfThought = hasChainOfThought && !hasReasoning;
  const segments = useMemo(() => groupMessageParts(visibleParts), [visibleParts]);
  const replayOnlyToolParts = useMemo(
    () => renderableParts.filter((part) => part.type === "tool_use" && !shouldRenderInlineToolPart({ toolName: part.toolName })),
    [renderableParts]
  );
  const lastTextPartIndex = useMemo(
    () => visibleParts.map((p, i) => (p.type === "text" ? i : -1)).filter((i) => i !== -1).at(-1),
    [visibleParts]
  );
  const fallbackState = useMemo(() => getMessageBodyFallbackState({
    isActivelyStreaming,
    renderableParts,
  }), [isActivelyStreaming, renderableParts]);

  if (fallbackState === "streaming-placeholder") {
    return (
      <Reasoning isStreaming defaultOpen={reasoningDefaultExpanded}>
        <ReasoningTrigger />
        <ReasoningContent>Thinking...</ReasoningContent>
      </Reasoning>
    );
  }

  if (fallbackState === "empty-completed") {
    return <p className="text-sm italic text-muted-foreground">No response.</p>;
  }

  return (
    <>
      {hasReasoning ? (
        <Reasoning isStreaming={isStreaming} defaultOpen={reasoningDefaultExpanded}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText || "Thinking..."}</ReasoningContent>
        </Reasoning>
      ) : null}
      {showChainOfThought ? <ChainOfThought isStreaming={isStreaming} steps={chainOfThoughtSteps} className={hasReasoning ? "mt-2" : undefined} /> : null}
      {replayOnlyToolParts.length > 0 ? (
        <div className={cn("mt-2", !hasReasoning && !showChainOfThought && "mt-0")}>
          <BackgroundActionsSummary parts={replayOnlyToolParts} onOpenReplay={onOpenReplay} />
        </div>
      ) : null}
      {segments.map((segment) => {
        if (segment.kind === "tools") {
          const toolStates = segment.parts.map((p) => (p.type === "tool_use" ? p.state : undefined));
          const shouldAutoOpenGroup = shouldAutoOpenToolGroup(toolStates);
          return (
            <div key={`${messageId}-tools-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ToolGroup
                states={toolStates}
                defaultOpen={shouldAutoOpenGroup}
                openWhen={shouldAutoOpenGroup}
              >
                {segment.parts.map((part, idx) => (
                  <MessagePartRenderer
                    key={`${messageId}-part-${segment.startIndex + idx}`}
                    part={part}
                    taskId={taskId}
                    messageId={messageId}
                    isStreaming={isStreaming}
                    isLastTextPart={false}
                  />
                ))}
              </ToolGroup>
            </div>
          );
        }
        if (segment.kind === "diffs") {
          return (
            <div key={`${messageId}-diffs-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ChangedFilesBlock parts={segment.parts} taskId={taskId} messageId={messageId} startIndex={segment.startIndex} />
            </div>
          );
        }
        if (segment.kind === "file_contexts") {
          return (
            <div key={`${messageId}-file-contexts-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ReferencedFilesBlock parts={segment.parts} />
            </div>
          );
        }
        if (segment.kind === "image_contexts") {
          return (
            <div key={`${messageId}-image-contexts-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ImageAttachmentBlock parts={segment.parts} />
            </div>
          );
        }
        return (
          <div key={`${messageId}-part-${segment.index}`} className="mt-2 first:mt-0">
            <MessagePartRenderer
              part={segment.part}
              taskId={taskId}
              messageId={messageId}
              isStreaming={isStreaming}
              isLastTextPart={segment.index === lastTextPartIndex}
            />
          </div>
        );
      })}
    </>
  );
}

const MemoizedMessageBody = memo(MessageBody);

interface MessageRowProps {
  activeTaskId: string;
  activeTurnId?: string;
  chatStreamingEnabled: boolean;
  isFirst?: boolean;
  liveStreamingMessageId?: string;
  onOpenReplay?: () => void;
  message: {
    id: string;
    role: "user" | "assistant";
    providerId: "claude-code" | "codex" | "stave" | "user";
    model: string;
    content: string;
    parts: MessagePart[];
    isStreaming?: boolean;
  };
}


const MessageRow = memo(function MessageRow(args: MessageRowProps) {
  const { activeTaskId, activeTurnId, chatStreamingEnabled, isFirst, liveStreamingMessageId, message, onOpenReplay } = args;
  const showRespondingWave =
    Boolean(activeTurnId)
    && message.id === liveStreamingMessageId
    && message.role === "assistant"
    && message.isStreaming;

  return (
    <div data-message-id={message.id} className={cn(isFirst && "pt-3 sm:pt-4")}>
      <Message from={message.role}>
        <div
          className={cn(
            "group/message-shell flex w-fit max-w-[88%] flex-col items-stretch",
            message.role === "assistant" && "gap-1",
          )}
        >
          <MessageContent>
            <MemoizedMessageBody
              message={message}
              taskId={activeTaskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
              onOpenReplay={onOpenReplay}
            />
          </MessageContent>
          <MessageActions
            className={cn(
              message.role === "user" && "pointer-events-none self-end !ml-0 !mt-1 opacity-0 transition-opacity group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100",
              message.role === "assistant" && "self-stretch !ml-0 !mt-0",
              showRespondingWave && "relative w-full items-center pr-10",
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              {message.providerId !== "user" && message.model ? (
                <MessageAction
                  key="provider-action"
                  label={toHumanModelName({ model: message.model })}
                  className="pointer-events-none h-7 cursor-default rounded-sm border border-border/70 bg-white dark:bg-white/[0.06] px-2 text-sm font-normal text-foreground opacity-100"
                >
                  <ModelIcon providerId={message.providerId} className="size-3.5" />
                  {toHumanModelName({ model: message.model })}
                </MessageAction>
              ) : null}
              <CopyButton key="copy-action" text={message.content} />
            </div>
            {showRespondingWave ? (
              <MessageAction
                key="responding-action"
                label="Responding"
                className="pointer-events-none absolute right-0 top-1/2 h-8 w-8 shrink-0 -translate-y-1/2 cursor-default p-0 opacity-100"
              >
                <WaveIndicator className={toProviderWaveToneClass({ providerId: message.providerId })} />
              </MessageAction>
            ) : null}
          </MessageActions>
        </div>
      </Message>
    </div>
  );
});

function ChatPanelHeader(args: {
  sessionReplayOpen: boolean;
  onOpenSessionReplay: (request?: Omit<SessionReplayRequestContext, "key">) => void;
}) {
  const [
    activeTaskId,
    activeWorkspaceId,
    activeTaskTitle,
    activeTaskUpdatedAt,
    turnDiagnosticsVisible,
  ] = useAppStore(useShallow((state) => {
    const activeTask = state.tasks.find((task) => task.id === state.activeTaskId);
    return [
      state.activeTaskId,
      state.activeWorkspaceId,
      activeTask?.title ?? "Untitled Task",
      activeTask?.updatedAt,
      state.settings.turnDiagnosticsVisible,
    ] as const;
  }));
  const [timeAnchor, setTimeAnchor] = useState(() => Date.now());
  const canOpenSessionReplay = Boolean(activeWorkspaceId && activeTaskId);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setTimeAnchor(Date.now());
    }, 60_000);
    return () => window.clearInterval(handle);
  }, []);

  return (
    <>
      <header className="flex h-10 items-center justify-between border-b border-border/80 bg-card px-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground">{activeTaskTitle}</span>
          {activeTaskUpdatedAt ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTaskUpdatedAt({ value: activeTaskUpdatedAt, now: timeAnchor })}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {turnDiagnosticsVisible ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canOpenSessionReplay}
                    className={cn(
                      "h-7 rounded-sm px-2 text-xs shadow-none",
                      args.sessionReplayOpen
                        ? "border-border/80 bg-secondary/80 text-foreground hover:bg-secondary/80"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => args.onOpenSessionReplay({
                      view: "overview",
                      replayFilter: "all",
                    })}
                  >
                    <Clock3 className="size-3.5 shrink-0" />
                    <span>Replay</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open session replay</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </header>
    </>
  );
}

const MemoizedChatPanelHeader = memo(ChatPanelHeader);

function ChatPanelMessageList(args: {
  onOpenSessionReplay: (request?: Omit<SessionReplayRequestContext, "key">) => void;
}) {
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
  const activeTurnId = useAppStore((state) => state.activeTurnIdsByTask[state.activeTaskId]);
  const chatStreamingEnabled = useAppStore((state) => state.settings.chatStreamingEnabled);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  const visibleMessages = useMemo(() => messages.filter((message) => !message.isPlanResponse), [messages]);
  const liveStreamingMessageId = activeTurnId ? visibleMessages.at(-1)?.id : undefined;
  const latestVisibleMessageId = visibleMessages.at(-1)?.id;
  const lastVisibleMessageScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(visibleMessages.at(-1)),
    [visibleMessages]
  );
  const autoScrollKey = `${visibleMessages.length}:${lastVisibleMessageScrollFingerprint}`;
  const forceScrollKey = latestVisibleMessageId;

  return (
    <ConversationContent
      autoScrollKey={autoScrollKey}
      autoScrollBehavior="auto"
      forceScrollKey={forceScrollKey}
      scrollScopeKey={activeTaskId}
      forceScrollScopeKey={activeTaskId}
      withInnerLayout={visibleMessages.length === 0}
    >
      {visibleMessages.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon />
            </EmptyMedia>
            <EmptyTitle>Start a conversation</EmptyTitle>
            <EmptyDescription>Send a prompt to begin this task.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ConversationVirtualList
          listKey={activeTaskId}
          listRef={virtuosoRef}
          data={visibleMessages}
          forceScrollKey={forceScrollKey}
          forceScrollScopeKey={activeTaskId}
          itemKey={(_, message) => message.id}
          itemContent={(index, message) => (
            <MessageRow
              activeTaskId={activeTaskId}
              activeTurnId={activeTurnId}
              chatStreamingEnabled={chatStreamingEnabled}
              isFirst={index === 0}
              liveStreamingMessageId={liveStreamingMessageId}
              onOpenReplay={() => args.onOpenSessionReplay({
                view: "replay",
                replayFilter: "tools",
              })}
              message={message}
            />
          )}
        />
      )}
    </ConversationContent>
  );
}

const MemoizedChatPanelMessageList = memo(ChatPanelMessageList);

export function ChatPanel() {
  const [sessionReplayOpen, setSessionReplayOpen] = useState(false);
  const replayRequestKeyRef = useRef(0);
  const [sessionReplayRequest, setSessionReplayRequest] = useState<SessionReplayRequestContext | null>(null);

  const openSessionReplay = useCallback((request?: Omit<SessionReplayRequestContext, "key">) => {
    replayRequestKeyRef.current += 1;
    setSessionReplayRequest({ key: replayRequestKeyRef.current, ...request });
    setSessionReplayOpen(true);
  }, []);

  return (
    <Conversation>
      <div className="flex h-full w-full flex-col">
        <MemoizedChatPanelHeader
          sessionReplayOpen={sessionReplayOpen}
          onOpenSessionReplay={openSessionReplay}
        />
        <MemoizedChatPanelMessageList onOpenSessionReplay={openSessionReplay} />
      </div>
      <SessionReplayDrawer open={sessionReplayOpen} onOpenChange={setSessionReplayOpen} request={sessionReplayRequest} />
      <ConversationScrollButton tooltip="Scroll to bottom" />
    </Conversation>
  );
}

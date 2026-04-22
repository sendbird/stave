import { useMemo } from "react";
import { MessageResponse } from "@/components/ai-elements";
import {
  ChangedFilesBlock,
  FileChangeSummaryBlock,
} from "@/components/session/chat-panel-file-blocks";
import { MessagePartRenderer } from "@/components/session/chat-panel-message-parts";
import { parseFileChangeToolInput } from "@/components/session/chat-panel.utils";
import { cn } from "@/lib/utils";
import type { ChatMessage, CodeDiffPart } from "@/types/chat";
import { buildAssistantTrace } from "./assistant-trace-builder";

function resolveZenAssistantMessageState(message: Pick<ChatMessage, "content" | "parts" | "isStreaming">) {
  const trace = buildAssistantTrace({ message });
  const allDiffParts = trace.entries.flatMap((entry) => entry.kind === "diff" ? entry.parts : []) as CodeDiffPart[];
  const fileChangeSummaryRows = trace.entries.flatMap((entry) => (
    entry.kind === "tool" && entry.part.toolName.trim().toLowerCase() === "file_change"
      ? parseFileChangeToolInput(entry.part.input)
      : []
  ));
  const diffPaths = new Set(allDiffParts.map((part) => part.filePath));
  const unresolvedFileChangeRows = fileChangeSummaryRows.filter((row) => row.status !== "applied" || !diffPaths.has(row.filePath));
  const visibleParts = trace.entries.flatMap((entry) => (
    entry.kind === "approval" || entry.kind === "user_input"
      ? [entry.part]
      : []
  ));
  const showDiffResults = allDiffParts.length > 0 && !message.isStreaming;
  const showFileChangeSummary = unresolvedFileChangeRows.length > 0 && !message.isStreaming;
  const showWorkingPlaceholder =
    Boolean(message.isStreaming)
    && trace.responseParts.length === 0
    && visibleParts.length === 0
    && !showDiffResults
    && !showFileChangeSummary;

  return {
    trace,
    visibleParts,
    showDiffResults,
    showFileChangeSummary,
    showWorkingPlaceholder,
    allDiffParts,
    unresolvedFileChangeRows,
    hasVisibleContent:
      visibleParts.length > 0
      || trace.responseParts.length > 0
      || showDiffResults
      || showFileChangeSummary
      || showWorkingPlaceholder,
  };
}

export function ZenAssistantMessageBody(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isStreaming">;
  taskId: string;
  messageId: string;
  streamingEnabled: boolean;
}) {
  const isStreaming = args.streamingEnabled && Boolean(args.message.isStreaming);
  const state = useMemo(() => resolveZenAssistantMessageState(args.message), [args.message]);

  if (!state.hasVisibleContent) {
    return null;
  }

  return (
    <>
      {state.visibleParts.length > 0 ? (
        <div className="space-y-4">
          {state.visibleParts.map((part, index) => (
            <MessagePartRenderer
              key={`${args.messageId}-zen-visible-${part.type}-${index}`}
              part={part}
              taskId={args.taskId}
              messageId={args.messageId}
            />
          ))}
        </div>
      ) : null}

      {state.showWorkingPlaceholder ? (
        <p className="text-[0.875em] italic text-muted-foreground">Working...</p>
      ) : null}

      {state.trace.responseParts.length > 0 ? (
        <div className={cn(state.visibleParts.length > 0 && "mt-4", "space-y-3")}>
          {state.trace.responseParts.map((part, index) => (
            <MessageResponse
              key={`${args.messageId}-response-${index}`}
              isStreaming={isStreaming && index === state.trace.responseParts.length - 1}
            >
              {part.text}
            </MessageResponse>
          ))}
        </div>
      ) : null}

      {state.showDiffResults ? (
        <div className="mt-4">
          <ChangedFilesBlock parts={state.allDiffParts} taskId={args.taskId} messageId={args.messageId} />
        </div>
      ) : null}

      {state.showFileChangeSummary ? (
        <div className="mt-4">
          <FileChangeSummaryBlock rows={state.unresolvedFileChangeRows} />
        </div>
      ) : null}
    </>
  );
}

export function hasVisibleZenAssistantMessageBody(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isStreaming">;
}) {
  return resolveZenAssistantMessageState(args.message).hasVisibleContent;
}

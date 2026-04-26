import type { ChatMessage, CodeDiffPart, FileContextPart, ImageContextPart, MessagePart, ToolUsePart } from "@/types/chat";

export function isPendingDiffStatus(status: CodeDiffPart["status"]) {
  return status === "pending";
}

export function shouldShowConversationLoadingState(args: {
  visibleMessageCount: number;
  totalMessageCount: number;
  taskMessagesLoading: boolean;
}) {
  return args.visibleMessageCount === 0
    && args.totalMessageCount > 0
    && args.taskMessagesLoading;
}

export interface DiffLineChangeSummary {
  added: number;
  removed: number;
}

export type FileChangeStatus = "applied" | "skipped" | "failed";

export interface FileChangeSummaryRow {
  filePath: string;
  status: FileChangeStatus;
  error?: string;
}

export type MessagePartSegment =
  | { kind: "tools"; parts: MessagePart[]; startIndex: number }
  | { kind: "diffs"; parts: CodeDiffPart[]; startIndex: number }
  | { kind: "file_contexts"; parts: FileContextPart[]; startIndex: number }
  | { kind: "image_contexts"; parts: ImageContextPart[]; startIndex: number }
  | { kind: "other"; part: MessagePart; index: number };

export function isSubagentToolPart(args: { toolName: string }) {
  return args.toolName.trim().toLowerCase() === "agent";
}

export function isTodoToolPart(args: { toolName: string }) {
  return args.toolName.trim().toLowerCase() === "todowrite";
}

export function shouldRenderInlineToolPart(args: { toolName: string }) {
  return isSubagentToolPart(args) || isTodoToolPart(args);
}

export interface ReplayOnlyToolSummary {
  totalActions: number;
  activeActions: number;
  failedActions: number;
  byTool: Array<{ toolName: string; count: number }>;
}

function toLineArray(text: string) {
  return text.length === 0 ? [] : text.split("\n");
}

export function summarizeDiffLineChanges(args: { oldContent: string; newContent: string }): DiffLineChangeSummary {
  const oldLines = toLineArray(args.oldContent);
  const newLines = toLineArray(args.newContent);

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length;
  let newSuffix = newLines.length;
  while (oldSuffix > prefix && newSuffix > prefix && oldLines[oldSuffix - 1] === newLines[newSuffix - 1]) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const oldWindow = oldLines.slice(prefix, oldSuffix);
  const newWindow = newLines.slice(prefix, newSuffix);

  if (oldWindow.length === 0) {
    return { added: newWindow.length, removed: 0 };
  }
  if (newWindow.length === 0) {
    return { added: 0, removed: oldWindow.length };
  }

  // Count line-level additions/removals via LCS on the changed window only.
  let previous = new Array<number>(newWindow.length + 1).fill(0);
  for (let oldIndex = 1; oldIndex <= oldWindow.length; oldIndex += 1) {
    const current = new Array<number>(newWindow.length + 1).fill(0);
    for (let newIndex = 1; newIndex <= newWindow.length; newIndex += 1) {
      current[newIndex] = oldWindow[oldIndex - 1] === newWindow[newIndex - 1]
        ? previous[newIndex - 1]! + 1
        : Math.max(previous[newIndex]!, current[newIndex - 1]!);
    }
    previous = current;
  }

  const sharedLineCount = previous[newWindow.length] ?? 0;
  return {
    added: newWindow.length - sharedLineCount,
    removed: oldWindow.length - sharedLineCount,
  };
}

function getFileChangeStatusPriority(status: FileChangeStatus) {
  switch (status) {
    case "failed":
      return 3;
    case "skipped":
      return 2;
    case "applied":
      return 1;
  }
}

export function parseFileChangeToolInput(input: string): FileChangeSummaryRow[] {
  try {
    const parsed = JSON.parse(input) as {
      appliedPaths?: unknown;
      skippedPaths?: unknown;
      failedPaths?: unknown;
    };
    const rows: FileChangeSummaryRow[] = [];

    if (Array.isArray(parsed.appliedPaths)) {
      rows.push(
        ...parsed.appliedPaths
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((filePath) => ({ filePath, status: "applied" as const })),
      );
    }

    if (Array.isArray(parsed.skippedPaths)) {
      rows.push(
        ...parsed.skippedPaths
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((filePath) => ({ filePath, status: "skipped" as const })),
      );
    }

    if (Array.isArray(parsed.failedPaths)) {
      rows.push(
        ...parsed.failedPaths.flatMap((value) => {
          if (!value || typeof value !== "object") {
            return [];
          }
          const filePath = typeof value.path === "string" ? value.path.trim() : "";
          if (!filePath) {
            return [];
          }
          const error = typeof value.error === "string" && value.error.trim().length > 0
            ? value.error
            : undefined;
          return [{ filePath, status: "failed" as const, ...(error ? { error } : {}) }];
        }),
      );
    }

    const dedupedRows = new Map<string, FileChangeSummaryRow>();
    for (const row of rows) {
      const existing = dedupedRows.get(row.filePath);
      if (!existing || getFileChangeStatusPriority(row.status) > getFileChangeStatusPriority(existing.status)) {
        dedupedRows.set(row.filePath, row);
      }
    }

    return Array.from(dedupedRows.values());
  } catch {
    return [];
  }
}

export function groupMessageParts(parts: MessagePart[]): MessagePartSegment[] {
  const segments: MessagePartSegment[] = [];
  let index = 0;

  while (index < parts.length) {
    const currentPart = parts[index];
    if (
      currentPart?.type === "tool_use"
      && !isSubagentToolPart({ toolName: currentPart.toolName })
      && !isTodoToolPart({ toolName: currentPart.toolName })
    ) {
      const group: MessagePart[] = [];
      const startIndex = index;
      while (index < parts.length) {
        const candidate = parts[index];
        if (
          candidate?.type !== "tool_use"
          || isSubagentToolPart({ toolName: candidate.toolName })
          || isTodoToolPart({ toolName: candidate.toolName })
        ) {
          break;
        }
        group.push(candidate);
        index += 1;
      }
      segments.push({ kind: "tools", parts: group, startIndex });
      continue;
    }

    if (currentPart?.type === "code_diff") {
      const group: CodeDiffPart[] = [];
      const startIndex = index;
      while (index < parts.length && parts[index]?.type === "code_diff") {
        group.push(parts[index] as CodeDiffPart);
        index += 1;
      }
      segments.push({ kind: "diffs", parts: group, startIndex });
      continue;
    }

    if (currentPart?.type === "file_context") {
      const group: FileContextPart[] = [];
      const startIndex = index;
      while (index < parts.length && parts[index]?.type === "file_context") {
        group.push(parts[index] as FileContextPart);
        index += 1;
      }
      segments.push({ kind: "file_contexts", parts: group, startIndex });
      continue;
    }

    if (currentPart?.type === "image_context") {
      const group: ImageContextPart[] = [];
      const startIndex = index;
      while (index < parts.length && parts[index]?.type === "image_context") {
        group.push(parts[index] as ImageContextPart);
        index += 1;
      }
      segments.push({ kind: "image_contexts", parts: group, startIndex });
      continue;
    }

    segments.push({ kind: "other", part: currentPart!, index });
    index += 1;
  }

  return segments;
}

export function getRenderableMessageParts(message: Pick<ChatMessage, "content" | "parts">): MessagePart[] {
  if (message.parts.length > 0) {
    return message.parts;
  }

  if (message.content.trim().length === 0) {
    return message.parts;
  }

  return [{ type: "text", text: message.content }];
}

export function hasRenderableMessageBody(message: Pick<ChatMessage, "content" | "parts" | "isStreaming">) {
  return getMessageBodyFallbackState({
    isActivelyStreaming: Boolean(message.isStreaming),
    renderableParts: getRenderableMessageParts(message),
  }) === "content";
}

export function getLatestRenderableAssistantMessage<
  T extends Pick<ChatMessage, "role" | "content" | "parts" | "isStreaming">,
>(messages: T[]) {
  let latestStreamingAssistant: T | null = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (!latestStreamingAssistant && message.isStreaming) {
      latestStreamingAssistant = message;
    }
    if (hasRenderableMessageBody(message)) {
      return message;
    }
  }

  return latestStreamingAssistant;
}

export function isCodeDiffSummarySystemEvent(content: string): boolean {
  const normalized = content.trimStart().toLowerCase();
  return (
    normalized.startsWith("modifying:")
    || normalized.startsWith("applied file change(s):")
    || normalized.startsWith("skipped inline diff for file(s):")
  );
}

export function getVisibleMessageParts(parts: MessagePart[]): MessagePart[] {
  const hasCodeDiffParts = parts.some((part) => part.type === "code_diff");

  return parts.filter((part) => {
    if (!hasVisibleMessagePartContent(part)) {
      return false;
    }

    if (
      hasCodeDiffParts
      && part.type === "system_event"
      && isCodeDiffSummarySystemEvent(part.content)
    ) {
      return false;
    }

    return true;
  });
}

export function getLatestUserMessageId(messages: Pick<ChatMessage, "id" | "role">[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return messages[index]?.id;
    }
  }
  return undefined;
}

function getMessagePartScrollFingerprint(part: MessagePart): string {
  switch (part.type) {
    case "text":
      return `text:${part.text.length}`;
    case "thinking":
      return `thinking:${part.text.length}:${part.isStreaming ? 1 : 0}`;
    case "tool_use":
      return `tool:${part.toolName}:${part.state}:${part.input.length}:${part.output?.length ?? 0}:${part.progressMessages?.length ?? 0}`;
    case "code_diff":
      return `diff:${part.filePath}:${part.status}:${part.oldContent.length}:${part.newContent.length}`;
    case "file_context":
      return `file:${part.filePath}:${part.content.length}:${part.instruction?.length ?? 0}`;
    case "image_context":
      return `image:${part.label}`;
    case "approval":
      return `approval:${part.toolName}:${part.state}:${part.description.length}`;
    case "user_input":
      return `input:${part.toolName}:${part.state}:${part.questions.length}:${Object.keys(part.answers ?? {}).length}`;
    case "system_event":
      return `system:${part.content.length}`;
    case "orchestration_progress":
      return `progress:${part.status}:${part.supervisorModel}:${part.subtasks.length}:${part.subtasks.map((subtask) => `${subtask.id}:${subtask.status}`).join(",")}`;
    case "stave_processing":
      return `stave_processing:${part.strategy}:${part.model ?? ""}:${part.supervisorModel ?? ""}:${part.fastModeRequested ? 1 : 0}:${part.fastModeApplied ? 1 : 0}`;
  }
}

export function getMessageScrollFingerprint(message?: Pick<ChatMessage, "id" | "content" | "isStreaming" | "parts">): string {
  if (!message) {
    return "empty";
  }

  const partFingerprint = message.parts.map(getMessagePartScrollFingerprint).join("|");
  return [
    message.id,
    message.content.length,
    message.isStreaming ? 1 : 0,
    message.parts.length,
    partFingerprint,
  ].join(":");
}

export function isSubagentProgressSystemEvent(content: string): boolean {
  return content.trimStart().startsWith("Subagent progress:");
}

export function shouldRenderInlineSystemEvent(args: { content: string }): boolean {
  const normalized = args.content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (isCodeDiffSummarySystemEvent(args.content)) {
    return false;
  }
  if (normalized.startsWith("[error]")) {
    return false;
  }
  // Subagent progress events are rendered inside the SubagentCard, not inline.
  if (isSubagentProgressSystemEvent(args.content)) {
    return false;
  }
  return !normalized.includes("failed");
}

export function summarizeReplayOnlyToolParts(parts: MessagePart[]): ReplayOnlyToolSummary {
  const counts = new Map<string, number>();
  let totalActions = 0;
  let activeActions = 0;
  let failedActions = 0;

  for (const part of parts) {
    if (part.type !== "tool_use" || shouldRenderInlineToolPart({ toolName: part.toolName })) {
      continue;
    }

    totalActions += 1;
    if (part.state === "input-streaming") {
      activeActions += 1;
    }
    if (part.state === "output-error") {
      failedActions += 1;
    }

    const normalizedName = part.toolName.trim() || "Tool";
    counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
  }

  return {
    totalActions,
    activeActions,
    failedActions,
    byTool: [...counts.entries()]
      .map(([toolName, count]) => ({ toolName, count }))
      .sort((left, right) => (
        right.count - left.count
        || left.toolName.localeCompare(right.toolName)
      )),
  };
}

export function hasVisibleMessagePartContent(part: MessagePart): boolean {
  if (part.type === "thinking") {
    return false;
  }
  if (part.type === "text") {
    return part.text.trim().length > 0;
  }
  if (part.type === "tool_use") {
    return shouldRenderInlineToolPart({ toolName: part.toolName });
  }
  if (part.type === "system_event") {
    return shouldRenderInlineSystemEvent({ content: part.content });
  }
  return true;
}

export function shouldAutoOpenToolPart(state: ToolUsePart["state"]) {
  return state === "input-streaming";
}

export function shouldAutoOpenToolGroup(states: Array<ToolUsePart["state"] | undefined>) {
  return states.some((state) => state !== undefined && shouldAutoOpenToolPart(state));
}

export function getReasoningTraceExpansionMode(args: { reasoningExpansionMode: "auto" | "manual" }): "auto" | "manual" {
  return args.reasoningExpansionMode;
}

export type MessageBodyFallbackState = "content" | "streaming-placeholder" | "empty-completed";

export function getMessageBodyFallbackState(args: {
  isActivelyStreaming: boolean;
  renderableParts: MessagePart[];
}): MessageBodyFallbackState {
  const reasoningParts = args.renderableParts.filter((part) => part.type === "thinking");
  const visibleParts = args.renderableParts.filter(hasVisibleMessagePartContent);
  const hasNonDiffSummarySystemEventParts = args.renderableParts.some((part) => (
    part.type === "system_event" && !isCodeDiffSummarySystemEvent(part.content)
  ));
  const hasReplayOnlyToolParts = args.renderableParts.some((part) => (
    part.type === "tool_use" && !shouldRenderInlineToolPart({ toolName: part.toolName })
  ));

  if (args.isActivelyStreaming && visibleParts.length === 0 && reasoningParts.length === 0) {
    if (hasNonDiffSummarySystemEventParts || hasReplayOnlyToolParts) {
      return "content";
    }
    return "streaming-placeholder";
  }

  if (!args.isActivelyStreaming && visibleParts.length === 0 && reasoningParts.length === 0) {
    if (hasNonDiffSummarySystemEventParts || hasReplayOnlyToolParts) {
      return "content";
    }
    return "empty-completed";
  }

  return "content";
}

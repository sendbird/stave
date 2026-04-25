import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Bot,
  Brain,
  CheckCircle2,
  Circle,
  FileCode2,
  FileText,
  Globe,
  Info,
  ListTodo,
  LoaderCircle,
  Network,
  Pencil,
  Search,
  ShieldCheck,
  Terminal,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  getTodoProgress,
  MessageResponse,
  OrchestrationCard,
  Shimmer,
  StaveProcessingCard,
  ThinkingAnimatedText,
  ToolInput,
  ToolOutput,
  parseSubagentToolInput,
} from "@/components/ai-elements";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { MESSAGE_BODY_LINE_HEIGHT } from "@/components/ai-elements/message-styles";
import type { TraceSummaryItem } from "@/components/ai-elements/chain-of-thought";
import {
  ChangedFilesBlock,
  FileChangeSummaryBlock,
  ImageAttachmentBlock,
  ReferencedFilesBlock,
} from "@/components/session/chat-panel-file-blocks";
import { MessagePartRenderer, toToolDisplayName } from "@/components/session/chat-panel-message-parts";
import { parseFileChangeToolInput } from "@/components/session/chat-panel.utils";
import { cn } from "@/lib/utils";
import type { ChatMessage, CodeDiffPart, ThinkingPart } from "@/types/chat";
import {
  deriveTodoTraceItems,
  deriveTodoTraceStatus,
  deriveTraceToolSummary,
  normalizeTraceToolName,
  type TraceToolSummary,
} from "./assistant-trace.utils";
import { buildAssistantTrace, joinReasoningText, type AssistantTraceEntry } from "./assistant-trace-builder";

/* ─── Step status ────────────────────────────────────────────────── */

function toStepStatus(args: { entry: AssistantTraceEntry; isStreaming: boolean }) {
  switch (args.entry.kind) {
    case "reasoning":
      return args.entry.isStreaming ? "active" as const : "done" as const;
    case "assistant_text":
      return "done" as const;
    case "tool":
    case "subagent":
      return args.entry.part.state === "input-streaming" || args.entry.part.state === "input-available"
        ? "active" as const
        : args.entry.part.state === "output-available" || args.entry.part.state === "output-error"
          ? "done" as const
          : "pending" as const;
    case "todo":
      return deriveTodoTraceStatus({
        input: args.entry.part.input,
        state: args.entry.part.state,
      });
    case "approval":
      return args.entry.part.state === "approval-requested" ? "active" as const : "done" as const;
    case "user_input":
      return args.entry.part.state === "input-requested" ? "active" as const : "done" as const;
    case "diff":
    case "system":
      return "done" as const;
    case "orchestration":
      return args.entry.part.status === "done" ? "done" as const : "active" as const;
    case "stave_processing":
      return args.isStreaming ? "active" as const : "done" as const;
  }
}

/* ─── Step icon mapping ──────────────────────────────────────────── */

function getToolIcon(toolName: string): ReactNode {
  switch (normalizeTraceToolName(toolName)) {
    case "bash": return <Terminal />;
    case "read": return <FileText />;
    case "write": return <FileText />;
    case "edit": return <Pencil />;
    case "glob": return <Search />;
    case "grep": return <Search />;
    case "websearch": return <Globe />;
    case "webfetch": return <Globe />;
    default: return <Wrench />;
  }
}

function getEntryIcon(entry: AssistantTraceEntry): ReactNode | undefined {
  switch (entry.kind) {
    case "reasoning": return <Brain />;
    case "tool": return getToolIcon(entry.part.toolName);
    case "subagent": return <Bot />;
    case "todo": return <ListTodo />;
    case "diff": return <FileCode2 />;
    case "system": return <Info />;
    case "approval": return <ShieldCheck />;
    case "user_input": return <UserRound />;
    case "orchestration": return <Network />;
    case "stave_processing": return <Zap />;
    case "assistant_text": return undefined;
  }
}

/* ─── Step summary chips ─────────────────────────────────────────── */

function renderTraceToolSummaryChip(summary: TraceToolSummary): ReactNode {
  switch (summary.kind) {
    case "command":
      return (
        <span className="ml-1 inline-flex max-w-2xl items-center truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] leading-none text-muted-foreground">
          {summary.text}
        </span>
      );
    case "file":
      return (
        <span className="ml-1 inline-flex max-w-2xl items-center gap-1 truncate rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[0.85em] leading-none text-muted-foreground">
          <FileText className="size-[0.85em] shrink-0" />
          {summary.text}
        </span>
      );
    case "search":
      return (
        <span className="ml-1 inline-flex max-w-2xl items-center gap-1 truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] leading-none text-muted-foreground">
          <Search className="size-[0.85em] shrink-0" />
          {summary.text}
        </span>
      );
    case "web":
      return (
        <span className="ml-1 inline-flex max-w-2xl items-center gap-1 truncate rounded bg-muted/60 px-1.5 py-0.5 text-[0.85em] leading-none text-muted-foreground">
          <Globe className="size-[0.85em] shrink-0" />
          {summary.text}
        </span>
      );
    case "text":
      return (
        <span className="ml-1 max-w-2xl truncate text-[0.75em] text-muted-foreground/70">
          {summary.text}
        </span>
      );
  }
}

function getToolSummary(toolName: string, input: string): ReactNode {
  if (normalizeTraceToolName(toolName) === "file_change") {
    const rows = parseFileChangeToolInput(input);
    return rows.length > 0 ? (
      <span className="ml-1 inline-flex max-w-2xl items-center gap-1 truncate rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[0.85em] leading-none text-muted-foreground">
        <FileCode2 className="size-[0.85em] shrink-0" />
        {rows.length} {rows.length === 1 ? "file" : "files"}
      </span>
    ) : null;
  }

  const summary = deriveTraceToolSummary({ toolName, input });
  return summary ? renderTraceToolSummaryChip(summary) : null;
}

function getEntrySummary(entry: AssistantTraceEntry): ReactNode {
  switch (entry.kind) {
    case "tool":
      return getToolSummary(entry.part.toolName, entry.part.input);
    case "subagent": {
      const parsed = parseSubagentToolInput({ input: entry.part.input });
      return parsed.subagentType ? (
        <span className="ml-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[0.85em] font-medium leading-none text-primary">
          {parsed.subagentType}
        </span>
      ) : null;
    }
    case "todo": {
      const progress = getTodoProgress({ input: entry.part.input });
      return progress.totalCount > 0 ? (
        <span className="ml-1 text-[0.75em] text-muted-foreground/70">
          {progress.completedCount}/{progress.totalCount}
        </span>
      ) : null;
    }
    case "diff":
      return entry.parts.length > 1 ? (
        <span className="ml-1 text-[0.75em] text-muted-foreground/70">{entry.parts.length} files</span>
      ) : null;
    default:
      return null;
  }
}

/* ─── Trace summary (collapsed trigger stats) ────────────────────── */

const TOOL_CATEGORIES: Record<string, { label: string; iconKey: string }> = {
  bash: { label: "commands", iconKey: "terminal" },
  read: { label: "reads", iconKey: "file" },
  write: { label: "edits", iconKey: "pencil" },
  edit: { label: "edits", iconKey: "pencil" },
  glob: { label: "searches", iconKey: "search" },
  grep: { label: "searches", iconKey: "search" },
  websearch: { label: "web", iconKey: "globe" },
  webfetch: { label: "web", iconKey: "globe" },
};

const CATEGORY_ICONS: Record<string, ReactNode> = {
  terminal: <Terminal />,
  file: <FileText />,
  pencil: <Pencil />,
  search: <Search />,
  globe: <Globe />,
  wrench: <Wrench />,
};

function buildTraceSummary(entries: AssistantTraceEntry[]): TraceSummaryItem[] {
  const buckets = new Map<string, { icon: ReactNode; count: number }>();

  for (const entry of entries) {
    switch (entry.kind) {
      case "tool": {
        const normalized = normalizeTraceToolName(entry.part.toolName);
        const cat = TOOL_CATEGORIES[normalized] ?? { label: "tools", iconKey: "wrench" };
        const existing = buckets.get(cat.label);
        if (existing) {
          existing.count++;
        } else {
          buckets.set(cat.label, { icon: CATEGORY_ICONS[cat.iconKey] ?? <Wrench />, count: 1 });
        }
        break;
      }
      case "subagent": {
        const existing = buckets.get("agents");
        if (existing) {
          existing.count++;
        } else {
          buckets.set("agents", { icon: <Bot />, count: 1 });
        }
        break;
      }
      case "diff": {
        const existing = buckets.get("changes");
        if (existing) {
          existing.count += entry.parts.length;
        } else {
          buckets.set("changes", { icon: <FileCode2 />, count: entry.parts.length });
        }
        break;
      }
      default:
        break;
    }
  }

  return Array.from(buckets.entries()).map(([label, { icon, count }]) => ({
    icon,
    label,
    count,
  }));
}

/* ─── Step detail components (expanded content) ───────────────────── */

function ToolStepDetail(args: {
  input: string;
  output?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
  return (
    <div className="space-y-2">
      <ToolInput input={args.input} />
      {(args.state !== "input-streaming" || args.output?.trim()) ? (
        <ToolOutput
          label={args.state === "input-streaming" ? "Live output" : undefined}
          outputText={args.output}
          errorText={args.state === "output-error" ? (args.output ?? "Tool failed.") : undefined}
          linkifyOutputText={args.state !== "input-streaming"}
        />
      ) : null}
    </div>
  );
}

function SubagentStepDetail(args: {
  input: string;
  output?: string;
  progressMessages?: string[];
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
  const parsed = useMemo(() => parseSubagentToolInput({ input: args.input }), [args.input]);
  return (
    <div className="space-y-2">
      {args.progressMessages?.length ? (
        <ul className="space-y-1">
          {args.progressMessages.map((message, index) => (
            <li key={`${message}-${index}`} className="flex items-start gap-2 text-[0.875em] text-muted-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
              <LinkifiedText text={message} />
            </li>
          ))}
        </ul>
      ) : null}
      <ToolInput input={parsed.prompt ?? parsed.raw} />
      {args.state !== "input-streaming" ? (
        <ToolOutput
          outputText={args.output}
          errorText={args.state === "output-error" ? (args.output ?? "Subagent failed.") : undefined}
        />
      ) : null}
    </div>
  );
}

function TodoStepDetail(args: {
  input: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
  const todos = useMemo(() => deriveTodoTraceItems(args), [args.input, args.state]);

  return (
    <ol className="space-y-1.5">
      {todos.map((todo, index) => (
        <li key={`${todo.content}-${index}`} className="flex items-start gap-2 text-[0.875em] text-foreground">
          {todo.status === "completed" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
          ) : todo.status === "in_progress" ? (
            <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
          )}
          <span
            className={cn(
              todo.status === "completed" && "text-muted-foreground line-through",
              todo.status === "in_progress" && "font-medium text-foreground",
              todo.status === "pending" && "text-muted-foreground",
            )}
          >
            {todo.content}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ─── Reasoning step (message-duration summary) ──────────────────── */

function formatThinkingDuration(seconds: number): string {
  const roundedSeconds = Math.max(1, Math.round(seconds));
  if (roundedSeconds < 60) {
    return `${roundedSeconds} second${roundedSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"}`;
}

function toEpochMilliseconds(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getReasoningDurationSeconds(parts: ThinkingPart[]): number | null {
  const startedAt = parts.reduce<number | null>((firstTimestamp, part) => {
    if (firstTimestamp !== null) {
      return firstTimestamp;
    }
    return toEpochMilliseconds(part.startedAt);
  }, null);
  const completedAt = [...parts].reverse().reduce<number | null>((latestTimestamp, part) => {
    if (latestTimestamp !== null) {
      return latestTimestamp;
    }
    return toEpochMilliseconds(part.completedAt);
  }, null);
  if (startedAt === null || completedAt === null || completedAt < startedAt) {
    return null;
  }
  return Math.max(1, Math.round((completedAt - startedAt) / 1000));
}

function ReasoningStepView(args: {
  entry: Extract<AssistantTraceEntry, { kind: "reasoning" }>;
  status: "active" | "done" | "pending";
  icon: ReactNode;
}) {
  const { entry, status, icon } = args;
  const durationSeconds = getReasoningDurationSeconds(entry.parts);

  const durationSummary = !entry.isStreaming && durationSeconds !== null ? (
    <span className="ml-1 text-[0.85em] text-muted-foreground/70">
      Thought for {formatThinkingDuration(durationSeconds)}
    </span>
  ) : null;

  const reasoningText = joinReasoningText(entry.parts);
  return (
    <ChainOfThoughtStep
      title="Reasoning"
      titleContent={(
        <ThinkingAnimatedText
          text={entry.isStreaming ? "Thinking" : "Reasoning"}
          active={entry.isStreaming}
          replayWhileActive={entry.isStreaming}
          settleOnStop
          className="font-medium leading-none"
        />
      )}
      status={status}
      kind="thinking"
      icon={icon}
      summary={durationSummary}
      defaultOpen={entry.isStreaming}
      openWhen={entry.isStreaming}
    >
      {entry.isStreaming ? (
        <p className="whitespace-pre-wrap text-muted-foreground" style={{ lineHeight: MESSAGE_BODY_LINE_HEIGHT }}>
          {reasoningText || "Thinking..."}
        </p>
      ) : (
        <LinkifiedText
          as="p"
          text={reasoningText || "Thinking..."}
          className="whitespace-pre-wrap text-muted-foreground"
          style={{ lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
        />
      )}
    </ChainOfThoughtStep>
  );
}

/* ─── Entry renderer ──────────────────────────────────────────────── */

function AssistantTraceEntryView(args: {
  entry: AssistantTraceEntry;
  isStreaming: boolean;
  taskId: string;
  messageId: string;
}) {
  const { entry, isStreaming, taskId, messageId } = args;
  const status = toStepStatus({ entry, isStreaming });
  const icon = getEntryIcon(entry);
  const summary = getEntrySummary(entry);

  switch (entry.kind) {
    case "reasoning":
      return <ReasoningStepView entry={entry} status={status} icon={icon} />;

    /* Assistant text — bullet point, content always visible (no accordion). */
    case "assistant_text":
      return (
        <div className="flex gap-[0.7em] text-[0.875em] text-muted-foreground motion-safe:animate-cot-step-in">
          <div className="relative mt-[0.265em] flex flex-col items-center">
            <span className="flex size-[1.15em] items-center justify-center" aria-hidden="true">
              <span className="size-[0.35em] rounded-full bg-muted-foreground/50" />
            </span>
            <div className="cot-connector mt-[0.35em] w-px flex-1 bg-border" />
          </div>
          <div className="min-w-0 flex-1 pb-[1em]">
            {entry.parts.map((part, index) => (
              <MessageResponse key={`${entry.id}-${index}`}>{part.text}</MessageResponse>
            ))}
          </div>
        </div>
      );

    case "tool":
      return (
        <ChainOfThoughtStep
          title={toToolDisplayName(entry.part.toolName)}
          status={status}
          icon={icon}
          summary={summary}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
        >
          <ToolStepDetail input={entry.part.input} output={entry.part.output} state={entry.part.state} />
        </ChainOfThoughtStep>
      );

    case "subagent": {
      const parsed = parseSubagentToolInput({ input: entry.part.input });
      const resolvedTitle = parsed.description ?? parsed.subagentType ?? "Subagent";
      const titleContent = status === "active" ? (
        <Shimmer
          as="span"
          className="[--shimmer-base-color:var(--color-foreground)]"
        >
          {resolvedTitle}
        </Shimmer>
      ) : undefined;
      return (
        <ChainOfThoughtStep
          title={resolvedTitle}
          titleContent={titleContent}
          status={status}
          kind="agent"
          icon={icon}
          summary={summary}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
        >
          <SubagentStepDetail
            input={entry.part.input}
            output={entry.part.output}
            progressMessages={entry.part.progressMessages}
            state={entry.part.state}
          />
        </ChainOfThoughtStep>
      );
    }

    case "todo":
      return (
        <ChainOfThoughtStep
          title="Todo"
          status={status}
          icon={icon}
          summary={summary}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
        >
          <TodoStepDetail input={entry.part.input} state={entry.part.state} />
        </ChainOfThoughtStep>
      );

    case "diff":
      return (
        <ChainOfThoughtStep
          title={entry.parts.length === 1 ? "Changed file" : `${entry.parts.length} changed files`}
          status={status}
          icon={icon}
          summary={summary}
          defaultOpen={entry.parts.some((p) => p.status === "pending")}
        >
          <ChangedFilesBlock parts={entry.parts} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "approval":
      return (
        <ChainOfThoughtStep title={`Approval: ${entry.part.toolName}`} status={status} icon={icon} defaultOpen>
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "user_input":
      return (
        <ChainOfThoughtStep title={`Input: ${entry.part.toolName}`} status={status} icon={icon} defaultOpen>
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "system":
      return (
        <ChainOfThoughtStep
          title={entry.part.content.split("\n").find(Boolean)?.trim() || "System"}
          status={status}
          icon={icon}
          defaultOpen={entry.part.compactBoundary != null}
        >
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "orchestration":
      return (
        <ChainOfThoughtStep title="Orchestration" status={status} icon={icon} defaultOpen={isStreaming}>
          <OrchestrationCard part={entry.part} />
        </ChainOfThoughtStep>
      );

    case "stave_processing":
      return (
        <ChainOfThoughtStep title="Execution routing" status={status} icon={icon} defaultOpen={isStreaming}>
          <StaveProcessingCard part={entry.part} />
        </ChainOfThoughtStep>
      );
  }
}

/* ─── Main export ─────────────────────────────────────────────────── */

export function AssistantMessageBody(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isStreaming">;
  taskId: string;
  messageId: string;
  streamingEnabled: boolean;
  traceExpansionMode?: "auto" | "manual";
  showInterimMessages?: boolean;
}) {
  const {
    message,
    taskId,
    messageId,
    streamingEnabled,
    traceExpansionMode = "auto",
    showInterimMessages = false,
  } = args;
  const isActivelyStreaming = Boolean(message.isStreaming);
  const isStreaming = streamingEnabled && isActivelyStreaming;
  const shouldAutoExpandTrace = traceExpansionMode === "auto";
  const trace = useMemo(() => buildAssistantTrace({ message }), [message]);
  const summaryItems = useMemo(() => buildTraceSummary(trace.entries), [trace.entries]);
  const allDiffParts = useMemo<CodeDiffPart[]>(
    () => trace.entries.flatMap((entry) => entry.kind === "diff" ? entry.parts : []),
    [trace.entries],
  );
  const fileChangeSummaryRows = useMemo(
    () => trace.entries.flatMap((entry) => (
      entry.kind === "tool" && entry.part.toolName.trim().toLowerCase() === "file_change"
        ? parseFileChangeToolInput(entry.part.input)
        : []
    )),
    [trace.entries],
  );
  const unresolvedFileChangeRows = useMemo(
    () => {
      const diffPaths = new Set(allDiffParts.map((part) => part.filePath));
      return fileChangeSummaryRows.filter((row) => row.status !== "applied" || !diffPaths.has(row.filePath));
    },
    [allDiffParts, fileChangeSummaryRows],
  );
  const showDiffResults = allDiffParts.length > 0 && !isStreaming;
  const showFileChangeSummary = unresolvedFileChangeRows.length > 0 && !isStreaming;

  if (
    !trace.showStreamingPlaceholder
    && trace.entries.length === 0
    && trace.responseParts.length === 0
    && trace.fileContextParts.length === 0
    && trace.imageContextParts.length === 0
  ) {
    return <p className="text-[0.875em] italic text-muted-foreground">No response.</p>;
  }

  return (
    <>
      {trace.showStreamingPlaceholder || trace.entries.length > 0 ? (
        <ChainOfThought
          isStreaming={isStreaming}
          defaultOpen={shouldAutoExpandTrace && isStreaming}
          openWhen={shouldAutoExpandTrace && isStreaming}
          collapseWhen={shouldAutoExpandTrace && !isStreaming}
          summaryItems={summaryItems}
          seed={messageId}
        >
          <ChainOfThoughtTrigger />
          {trace.entries.length > 0 ? (
            <ChainOfThoughtContent>
              {trace.entries.map((entry) => (
                <AssistantTraceEntryView
                  key={entry.id}
                  entry={entry}
                  isStreaming={isStreaming}
                  taskId={taskId}
                  messageId={messageId}
                />
              ))}
            </ChainOfThoughtContent>
          ) : null}
        </ChainOfThought>
      ) : null}

      {!isStreaming && showInterimMessages && trace.interimTextParts.length > 0 ? (
        <div
          className={cn(
            trace.entries.length > 0 && "mt-4",
            "space-y-1.5 opacity-50",
          )}
        >
          {trace.interimTextParts.map((part, index) => (
            <MessageResponse key={`${messageId}-interim-${index}`}>
              {part.text}
            </MessageResponse>
          ))}
        </div>
      ) : null}

      {trace.responseParts.length > 0 ? (
        <div
          className={cn(
            (trace.entries.length > 0 || (showInterimMessages && trace.interimTextParts.length > 0)) && "mt-4",
            "space-y-3",
          )}
        >
          {trace.responseParts.map((part, index) => (
            <MessageResponse
              key={`${messageId}-response-${index}`}
              isStreaming={isStreaming && index === trace.responseParts.length - 1}
            >
              {part.text}
            </MessageResponse>
          ))}
        </div>
      ) : null}

      {showDiffResults ? (
        <div className="mt-4">
          <ChangedFilesBlock parts={allDiffParts} taskId={taskId} messageId={messageId} />
        </div>
      ) : null}

      {showFileChangeSummary ? (
        <div className="mt-4">
          <FileChangeSummaryBlock rows={unresolvedFileChangeRows} />
        </div>
      ) : null}

      {trace.fileContextParts.length > 0 ? (
        <div className="mt-4">
          <ReferencedFilesBlock parts={trace.fileContextParts} />
        </div>
      ) : null}

      {trace.imageContextParts.length > 0 ? (
        <div className="mt-4">
          <ImageAttachmentBlock parts={trace.imageContextParts} />
        </div>
      ) : null}
    </>
  );
}

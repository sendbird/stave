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
  Pencil,
  Search,
  ShieldCheck,
  Terminal,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  getTodoProgress,
  MessageResponse,
  Shimmer,
  StreamingThoughtViewport,
  ThinkingAnimatedText,
  ToolInput,
  ToolResult,
  ToolResultOutput,
  ToolResultStatusIcon,
  toToolResultStatus,
  parseSubagentToolInput,
} from "@/components/ai-elements";
import { useAgentStyle } from "@/components/ai-elements/agent-style-context";
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
import { parseFileChangeToolInput, summarizeDiffLineChanges } from "@/components/session/chat-panel.utils";
import { cn } from "@/lib/utils";
import type { ChatMessage, CodeDiffPart, MessagePart, ThinkingPart } from "@/types/chat";
import {
  deriveTodoTraceItems,
  deriveTodoTraceStatus,
  deriveTraceToolSummary,
  getResidualToolInput,
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
    case "assistant_text": return undefined;
  }
}

/* ─── Step summary chips ─────────────────────────────────────────── */

/**
 * Shared "target" chip — the file, command, pattern, or URL a step acted on.
 * One mono treatment for every kind so a trace column reads as a single list of
 * targets instead of four competing chip styles.
 */
const TRACE_TARGET_CHIP_CLASS =
  "ml-1 inline-flex max-w-2xl items-center gap-1 truncate rounded-lg bg-muted/80 px-2.5 py-1 font-mono text-[0.85em] leading-none text-muted-foreground";

function renderTraceToolSummaryChip(summary: TraceToolSummary): ReactNode {
  switch (summary.kind) {
    case "command":
      return <span className={TRACE_TARGET_CHIP_CLASS}>{summary.text}</span>;
    case "file":
      return (
        <span className={TRACE_TARGET_CHIP_CLASS}>
          <FileText className="size-[0.85em] shrink-0" />
          {summary.text}
        </span>
      );
    case "search":
      return (
        <span className={TRACE_TARGET_CHIP_CLASS}>
          <Search className="size-[0.85em] shrink-0" />
          {summary.text}
        </span>
      );
    case "web":
      return (
        <span className={TRACE_TARGET_CHIP_CLASS}>
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
      <span className={TRACE_TARGET_CHIP_CLASS}>
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
    case "diff": {
      /* `+N / -N` uses the semantic success / destructive tokens so the counts
         stay legible in every built-in theme (no new colour tokens). */
      const totals = entry.parts.reduce(
        (accumulator, part) => {
          const changes = summarizeDiffLineChanges({
            oldContent: part.oldContent,
            newContent: part.newContent,
          });
          return {
            added: accumulator.added + changes.added,
            removed: accumulator.removed + changes.removed,
          };
        },
        { added: 0, removed: 0 },
      );
      if (entry.parts.length <= 1 && totals.added === 0 && totals.removed === 0) {
        return null;
      }
      return (
        <span className="ml-1 inline-flex items-center gap-1.5 text-[0.8em] leading-none">
          {entry.parts.length > 1 ? (
            <span className="text-muted-foreground/70">{entry.parts.length} files</span>
          ) : null}
          {totals.added > 0 ? (
            <span className="font-medium tabular-nums text-success">+{totals.added}</span>
          ) : null}
          {totals.removed > 0 ? (
            <span className="font-medium tabular-nums text-destructive">-{totals.removed}</span>
          ) : null}
        </span>
      );
    }
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

/**
 * Row meta — elapsed time plus a failure badge.
 *
 * Only `error` and `cancelled` get a badge. The rail icon already spins while
 * running and mutes when done, so a success check on every row would be a green
 * carpet that adds no signal; a failure, by contrast, is currently invisible in
 * the collapsed row. The expanded body still carries the full status label.
 */
function ToolStepMeta(args: { part: { state?: string; elapsedSeconds?: number } }) {
  const { state, elapsedSeconds } = args.part;
  const showBadge = state === "output-error";
  const showElapsed = elapsedSeconds != null && elapsedSeconds >= 1;
  if (!showBadge && !showElapsed) {
    return null;
  }
  return (
    <span className="ml-1 inline-flex items-center gap-[0.35em]">
      {showElapsed ? (
        <span className="text-[0.75em] tabular-nums text-muted-foreground/70">
          {formatTraceElapsed(elapsedSeconds)}
        </span>
      ) : null}
      {showBadge ? <ToolResultStatusIcon status="error" /> : null}
    </span>
  );
}

function formatTraceElapsed(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function ToolStepDetail(args: {
  input: string;
  output?: string;
  summary: TraceToolSummary | null;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
}) {
  /*
   * The header chip already renders the command / file / pattern / URL, so the
   * raw INPUT panel is dropped unless the call carries arguments the chip does
   * not cover. Single-argument tools (Bash, Read, Grep, …) therefore show the
   * output only, instead of repeating the same string as JSON one row below it.
   */
  const residualInput = useMemo(
    () => getResidualToolInput({ input: args.input, summary: args.summary }),
    [args.input, args.summary],
  );
  const isStreamingInput = args.state === "input-streaming";
  const showOutput = !isStreamingInput || Boolean(args.output?.trim());

  return (
    <ToolResult
      headless
      status={toToolResultStatus(args.state)}
      copyText={args.output?.trim() ? args.output : undefined}
    >
      {residualInput ? <ToolInput input={residualInput} /> : null}
      {showOutput ? (
        <ToolResultOutput
          label={isStreamingInput ? "Live output" : undefined}
          text={args.output}
          errorText={args.state === "output-error" ? (args.output ?? "Tool failed.") : undefined}
          linkify={!isStreamingInput}
        />
      ) : null}
    </ToolResult>
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
    <ToolResult
      headless
      status={toToolResultStatus(args.state)}
      copyText={args.output?.trim() ? args.output : undefined}
    >
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
      {/* The subagent chip carries only the type, so the prompt is still new
          information and stays visible. */}
      <ToolInput input={parsed.prompt ?? parsed.raw} />
      {args.state !== "input-streaming" ? (
        <ToolResultOutput
          text={args.output}
          errorText={args.state === "output-error" ? (args.output ?? "Subagent failed.") : undefined}
        />
      ) : null}
    </ToolResult>
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
        /*
         * Cap the *thought*, not the trace. The step row above stays pinned, so
         * the "Thinking" label and its icon never fade out; only the prose
         * glides under the top fade once it outgrows the cap.
         */
        <StreamingThoughtViewport>
          <p className="whitespace-pre-wrap text-muted-foreground" style={{ lineHeight: MESSAGE_BODY_LINE_HEIGHT }}>
            {reasoningText || "Thinking..."}
          </p>
        </StreamingThoughtViewport>
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
  const agentStyle = useAgentStyle();
  const status = toStepStatus({ entry, isStreaming });
  const icon = getEntryIcon(entry);
  const summary = getEntrySummary(entry);
  /* TODO(agent-style-legacy): collapse to `animate-trace-row-in` once signed off. */
  const rowMotionClass = agentStyle === "legacy"
    ? "motion-safe:animate-cot-step-in"
    : "motion-safe:animate-trace-row-in";

  switch (entry.kind) {
    case "reasoning":
      return <ReasoningStepView entry={entry} status={status} icon={icon} />;

    /* Assistant text — bullet point, content always visible (no accordion). */
    case "assistant_text":
      return (
        <div className={cn("flex gap-[0.7em] text-[0.875em] text-muted-foreground", rowMotionClass)}>
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

    case "tool": {
      const toolSummary = normalizeTraceToolName(entry.part.toolName) === "file_change"
        ? null
        : deriveTraceToolSummary({ toolName: entry.part.toolName, input: entry.part.input });
      return (
        <ChainOfThoughtStep
          title={toToolDisplayName(entry.part.toolName)}
          status={status}
          icon={icon}
          summary={summary}
          trailing={<ToolStepMeta part={entry.part} />}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
          /* Errors stay expanded — auto-collapse only hides a clean result. */
          collapseWhen={entry.part.state === "output-available"}
        >
          <ToolStepDetail
            input={entry.part.input}
            output={entry.part.output}
            summary={toolSummary}
            state={entry.part.state}
          />
        </ChainOfThoughtStep>
      );
    }

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
          trailing={<ToolStepMeta part={entry.part} />}
          defaultOpen={entry.part.state === "input-streaming"}
          openWhen={entry.part.state === "input-streaming"}
          collapseWhen={entry.part.state === "output-available"}
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
        <ChainOfThoughtStep
          title={`Approval: ${entry.part.toolName}`}
          status={status}
          icon={icon}
          defaultOpen
          data-pending-interaction={
            entry.part.state === "approval-requested" ? "true" : undefined
          }
          data-pending-interaction-request-id={
            entry.part.state === "approval-requested"
              ? entry.part.requestId
              : undefined
          }
          tabIndex={entry.part.state === "approval-requested" ? -1 : undefined}
        >
          <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
        </ChainOfThoughtStep>
      );

    case "user_input":
      return (
        <ChainOfThoughtStep
          title={`Input: ${entry.part.toolName}`}
          status={status}
          icon={icon}
          defaultOpen
        >
          <MessagePartRenderer
            part={entry.part}
            taskId={taskId}
            messageId={messageId}
            userInputPresentation="summary"
          />
        </ChainOfThoughtStep>
      );

    case "system":
      {
        const systemTitle =
          entry.part.content.split("\n").find((line) => line.trim())?.trim() || "System";
        const systemContent = entry.part.content.trim();
        const hasDistinctSystemContent =
          entry.part.compactBoundary != null || systemContent !== systemTitle;

        return (
          <ChainOfThoughtStep
            title={systemTitle}
            status={status}
            icon={icon}
            defaultOpen={entry.part.compactBoundary != null}
          >
            {hasDistinctSystemContent ? (
              <MessagePartRenderer part={entry.part} taskId={taskId} messageId={messageId} />
            ) : null}
          </ChainOfThoughtStep>
        );
      }

  }
}

function DisplayPartList(args: {
  parts: MessagePart[];
  taskId: string;
  messageId: string;
  isStreaming: boolean;
  tokenizePromptTokens?: boolean;
}) {
  return (
    <div className="space-y-3">
      {args.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <MessageResponse
              key={`${args.messageId}-display-${index}`}
              isStreaming={args.isStreaming && index === args.parts.length - 1}
              tokenizePromptTokens={args.tokenizePromptTokens}
            >
              {part.text}
            </MessageResponse>
          );
        }
        if (part.type === "image_context") {
          return (
            <ImageAttachmentBlock
              key={`${args.messageId}-display-${index}`}
              parts={[part]}
            />
          );
        }
        return (
          <MessagePartRenderer
            key={`${args.messageId}-display-${index}`}
            part={part}
            taskId={args.taskId}
            messageId={args.messageId}
          />
        );
      })}
    </div>
  );
}

/* ─── Main export ─────────────────────────────────────────────────── */

export function AssistantMessageBody(args: {
  message: Pick<
    ChatMessage,
    | "content"
    | "parts"
    | "displayContent"
    | "displayParts"
    | "isStreaming"
    | "role"
  >;
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
  /* Total reasoning time for the turn, shown next to the collapsed completion
     phrase ("Thought for 12s"). Only meaningful once the turn has finished. */
  const traceDurationSeconds = useMemo(() => {
    if (isStreaming) {
      return undefined;
    }
    const total = trace.entries.reduce(
      (sum, entry) => (
        entry.kind === "reasoning" ? sum + (getReasoningDurationSeconds(entry.parts) ?? 0) : sum
      ),
      0,
    );
    return total > 0 ? total : undefined;
  }, [isStreaming, trace.entries]);
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

  if (message.displayParts && message.displayParts.length > 0) {
    return (
      <DisplayPartList
        parts={message.displayParts}
        taskId={taskId}
        messageId={messageId}
        isStreaming={isStreaming}
        tokenizePromptTokens={message.role === "user"}
      />
    );
  }

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
          durationSeconds={traceDurationSeconds}
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
            <MessageResponse
              key={`${messageId}-interim-${index}`}
              tokenizePromptTokens={message.role === "user"}
            >
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
              tokenizePromptTokens={message.role === "user"}
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

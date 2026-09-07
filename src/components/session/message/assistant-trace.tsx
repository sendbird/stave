import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Bot,
  Brain,
  FileCode2,
  FileText,
  Globe,
  Info,
  ListTodo,
  Pencil,
  Search,
  ShieldCheck,
  Terminal,
  UserRound,
  Wrench,
} from "lucide-react";
import { StaveIcon } from "@/components/brand-icons";
import type { AgentRunState } from "@/components/ads/components/agent-state";
import { StepRail } from "@/components/ads/components/StepRail";
import { ToolRun } from "@/components/ads/components/ToolRun";
import { controlIconSizes } from "@/components/ads/recipes/control-metrics";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtTrigger,
  MessageResponse,
  parseSubagentToolInput,
} from "@/components/ai-elements";
import { useAgentStyle } from "@/components/ai-elements/agent-style-context";
import type { TraceSummaryItem } from "@/components/ai-elements/chain-of-thought";
import {
  ChangedFilesBlock,
  FileChangeSummaryBlock,
  ImageAttachmentBlock,
  ReferencedFilesBlock,
} from "@/components/session/chat-panel-file-blocks";
import { MessagePartRenderer } from "@/components/session/chat-panel-message-parts";
import {
  parseFileChangeToolInput,
  summarizeDiffLineChanges,
} from "@/components/session/chat-panel.utils";
import { sx } from "@/components/ads/utils/stylex";
import { assistantTraceStyles as styles } from "./assistant-trace.styles";
import { isStaveToolName } from "@/lib/tool-display-name";
import { formatWorkerExecutionMetadata } from "@/lib/providers/worker-mode";
import {
  isProviderFailureRecoveryEligible,
  parseProviderErrorNotice,
} from "@/lib/providers/provider-error-recovery";
import type {
  ChatMessage,
  CodeDiffPart,
  MessagePart,
  ThinkingPart,
} from "@/types/chat";
import {
  deriveTraceToolSummary,
  getResidualToolInput,
  getToolTitle,
  normalizeTraceToolName,
} from "./assistant-trace.utils";
import {
  buildAssistantTrace,
  joinReasoningText,
  type AssistantTraceEntry,
} from "./assistant-trace-builder";
import { CommandResult } from "./command-result";
import {
  planProgressCount,
  TraceApproval,
  TraceClarification,
  TracePlan,
} from "./turn-event-decisions";
import { TraceSystemNotice } from "./turn-event-notice";
import {
  ReasoningRow,
  SubagentProgress,
  TraceCitations,
  TraceOutput,
} from "./turn-event-rows";
import {
  toAgentRunState,
  toMeasuredDurationMs,
} from "./turn-event-state";

/* ─── Step icon mapping ──────────────────────────────────────────── */

/**
 * The object glyph's box. `controlIconSizes.md` is what ADS `ToolRun` and
 * `Thinking` size their own glyph slot to, and passing it explicitly is what
 * keeps a lucide icon from falling back to its 24px default inside those rows.
 * The host step path clones an em-based `width`/`height` over it, so one
 * mapping still serves both.
 */
const GLYPH_SIZE = controlIconSizes.md;

function getToolIcon(toolName: string): ReactNode {
  if (isStaveToolName(toolName)) {
    return <StaveIcon className={sx(styles.glyphEm)} />;
  }

  switch (normalizeTraceToolName(toolName)) {
    case "bash":
      return <Terminal size={GLYPH_SIZE} />;
    case "read":
      return <FileText size={GLYPH_SIZE} />;
    case "write":
      return <FileText size={GLYPH_SIZE} />;
    case "edit":
      return <Pencil size={GLYPH_SIZE} />;
    case "glob":
      return <Search size={GLYPH_SIZE} />;
    case "grep":
      return <Search size={GLYPH_SIZE} />;
    /* ACP `search` kind — the canonical name ACP providers map onto. */
    case "search":
      return <Search size={GLYPH_SIZE} />;
    case "websearch":
      return <Globe size={GLYPH_SIZE} />;
    case "webfetch":
      return <Globe size={GLYPH_SIZE} />;
    default:
      return <Wrench size={GLYPH_SIZE} />;
  }
}

function getEntryIcon(entry: AssistantTraceEntry): ReactNode | undefined {
  switch (entry.kind) {
    case "reasoning":
      return <Brain size={GLYPH_SIZE} />;
    case "tool":
      return getToolIcon(entry.part.toolName);
    case "subagent":
      return <Bot size={GLYPH_SIZE} />;
    case "todo":
      return <ListTodo size={GLYPH_SIZE} />;
    case "diff":
      return <FileCode2 size={GLYPH_SIZE} />;
    case "system":
      return <Info size={GLYPH_SIZE} />;
    case "approval":
      return <ShieldCheck size={GLYPH_SIZE} />;
    case "user_input":
      return <UserRound size={GLYPH_SIZE} />;
    case "assistant_text":
      return undefined;
  }
}

/**
 * The `+N −M` roll-up a changed-file row carries in its machine register.
 *
 * Diff-only by construction. Every other kind on the rail is an ADS row that
 * owns its own summary slot — a tool call puts its target in `tool` and its
 * result count in `count`, a plan puts `done / total` in `count` — so a host
 * chip beside those was a second summary competing with the one the component
 * already draws.
 */
function getDiffSummary(parts: readonly CodeDiffPart[]): ReactNode {
  /* `+N / -N` uses the semantic success / destructive tokens so the counts
     stay legible in every built-in theme (no new colour tokens). */
  const totals = parts.reduce(
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
  if (parts.length <= 1 && totals.added === 0 && totals.removed === 0) {
    return null;
  }
  return (
    <span className={sx(styles.diffSummary)}>
      {parts.length > 1 ? (
        <span className={sx(styles.diffFiles)}>{parts.length} files</span>
      ) : null}
      {totals.added > 0 ? (
        <span className={sx(styles.diffAdded)}>+{totals.added}</span>
      ) : null}
      {totals.removed > 0 ? (
        <span className={sx(styles.diffRemoved)}>-{totals.removed}</span>
      ) : null}
    </span>
  );
}

/* ─── Trace summary (collapsed trigger stats) ────────────────────── */

const TOOL_CATEGORIES: Record<string, { label: string; iconKey: string }> = {
  bash: { label: "commands", iconKey: "terminal" },
  read: { label: "reads", iconKey: "file" },
  write: { label: "edits", iconKey: "pencil" },
  edit: { label: "edits", iconKey: "pencil" },
  glob: { label: "searches", iconKey: "search" },
  grep: { label: "searches", iconKey: "search" },
  search: { label: "searches", iconKey: "search" },
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
        const cat = TOOL_CATEGORIES[normalized] ?? {
          label: "tools",
          iconKey: "wrench",
        };
        const existing = buckets.get(cat.label);
        if (existing) {
          existing.count++;
        } else {
          buckets.set(cat.label, {
            icon: CATEGORY_ICONS[cat.iconKey] ?? <Wrench />,
            count: 1,
          });
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
          buckets.set("changes", {
            icon: <FileCode2 />,
            count: entry.parts.length,
          });
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

/* ─── Reasoning step (message-duration summary) ──────────────────── */

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
  const completedAt = [...parts]
    .reverse()
    .reduce<number | null>((latestTimestamp, part) => {
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

/**
 * System-event rows use the first non-empty line as their accordion title.
 * Keep the title out of the expanded body so a multi-line notice does not
 * render its heading twice. Checkpoint events are handled separately because
 * their body needs the original content to recover the compact boundary.
 */
export function splitSystemEventContent(content: string): {
  title: string;
  detail: string;
} {
  const lines = content.trim().split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.trim());
  if (titleIndex === -1) {
    return { title: "System", detail: "" };
  }

  return {
    title: lines[titleIndex]?.trim() || "System",
    detail: lines
      .slice(titleIndex + 1)
      .join("\n")
      .trim(),
  };
}

/* ─── Entry renderer ──────────────────────────────────────────────── */

function AssistantTraceEntryView(args: {
  entry: AssistantTraceEntry;
  isLast: boolean;
  taskId: string;
  messageId: string;
  terminalStopReason?: string;
}) {
  const {
    entry,
    isLast,
    taskId,
    messageId,
    terminalStopReason,
  } = args;
  const agentStyle = useAgentStyle();
  const icon = getEntryIcon(entry);
  /* TODO(agent-style-legacy): collapse to `rowMotion` once signed off. */
  const rowMotionStyle =
    agentStyle === "legacy" ? styles.rowMotionLegacy : styles.rowMotion;

  switch (entry.kind) {
    case "reasoning":
      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <ReasoningRow
            durationMs={toMeasuredDurationMs(
              getReasoningDurationSeconds(entry.parts) ?? undefined,
            )}
            isStreaming={entry.isStreaming}
            text={joinReasoningText(entry.parts)}
          />
        </StepRail.Step>
      );

    /* Assistant text — interim prose, always visible (no disclosure). */
    case "assistant_text":
      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <div className={sx(styles.assistantTextBody)}>
            {entry.parts.map((part, index) => (
              <MessageResponse key={`${entry.id}-${index}`}>
                {part.text}
              </MessageResponse>
            ))}
          </div>
        </StepRail.Step>
      );

    case "tool": {
      const normalized = normalizeTraceToolName(entry.part.toolName);
      const toolSummary =
        normalized === "file_change"
          ? null
          : deriveTraceToolSummary({
              toolName: entry.part.toolName,
              input: entry.part.input,
            });
      /*
       * The header already carries the command / file / pattern / URL in the
       * machine register, so the raw arguments panel appears only for the
       * arguments the header does not cover. Single-argument tools (Bash,
       * Read, Grep) therefore show their result and not the same string twice.
       */
      const residualInput = getResidualToolInput({
        input: entry.part.input,
        summary: toolSummary,
      });
      const fileRows =
        normalized === "file_change"
          ? parseFileChangeToolInput(entry.part.input)
          : [];
      const isCommand = normalized === "bash";
      const isWeb = normalized === "websearch" || normalized === "webfetch";
      const isError = entry.part.state === "output-error";
      const streamingInput = entry.part.state === "input-streaming";
      const output = entry.part.output?.trim() ?? "";
      const command =
        toolSummary?.kind === "command" ? toolSummary.text : entry.part.input;

      return (
        <StepRail.Step
          connector={!isLast}
          /* Anchor for Turn Activity's "show in conversation" jump. */
          data-tool-use-id={entry.part.toolUseId}
          tabIndex={entry.part.toolUseId ? -1 : undefined}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <ToolRun
            count={
              fileRows.length > 0
                ? `${fileRows.length} ${fileRows.length === 1 ? "file" : "files"}`
                : undefined
            }
            /*
             * Measured only. The provider reports `elapsedSeconds` for the
             * calls it timed and omits it for the rest, and ADS renders no
             * duration rather than a plausible one — §6.
             */
            durationMs={toMeasuredDurationMs(entry.part.elapsedSeconds)}
            error={
              isError && !isCommand && output ? (
                <TraceOutput linkify={false} text={output} />
              ) : undefined
            }
            icon={icon}
            input={residualInput || undefined}
            output={
              !isError && !isCommand && output ? (
                <TraceOutput linkify={!streamingInput} text={output} />
              ) : undefined
            }
            status={toAgentRunState(entry.part.state)}
            title={getToolTitle(entry.part.toolName)}
            tool={toolSummary?.text}
          >
            {isCommand ? (
              <CommandResult
                command={command}
                isError={isError}
                isStreaming={streamingInput}
                output={entry.part.output}
              />
            ) : null}
            {isWeb && !isError ? (
              <TraceCitations output={entry.part.output} />
            ) : null}
          </ToolRun>
        </StepRail.Step>
      );
    }

    case "subagent": {
      const parsed = parseSubagentToolInput({ input: entry.part.input });
      const baseTitle = parsed.description ?? parsed.subagentType ?? "Subagent";
      const resolvedTitle = entry.part.workerExecution
        ? `Worker · ${baseTitle}`
        : baseTitle;
      const isError = entry.part.state === "output-error";
      const output = entry.part.output?.trim() ?? "";
      const progress = entry.part.progressMessages ?? [];

      return (
        <StepRail.Step
          connector={!isLast}
          /* Anchor for Turn Activity's "show in conversation" jump. */
          data-tool-use-id={entry.part.toolUseId}
          tabIndex={entry.part.toolUseId ? -1 : undefined}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <ToolRun
            /*
             * The subagent's own machine identity goes in the `tool` slot: its
             * type, and the worker metadata when the run was delegated. Both
             * are values the runtime reported, not language the agent wrote.
             */
            count={
              entry.part.workerExecution
                ? formatWorkerExecutionMetadata(entry.part.workerExecution)
                : undefined
            }
            durationMs={toMeasuredDurationMs(entry.part.elapsedSeconds)}
            error={
              isError && output ? (
                <TraceOutput linkify={false} text={output} />
              ) : undefined
            }
            icon={icon}
            /* The chip carries only the type, so the prompt is still new
               information and stays visible. */
            input={parsed.prompt ?? parsed.raw}
            inputLabel="Prompt"
            output={
              !isError && output ? (
                <TraceOutput prose text={output} />
              ) : undefined
            }
            status={toAgentRunState(entry.part.state)}
            title={resolvedTitle}
            tool={parsed.subagentType}
          >
            <SubagentProgress messages={progress} />
          </ToolRun>
        </StepRail.Step>
      );
    }

    /*
     * The plan revision is a tool call — TodoWrite genuinely is one — so the
     * row is `ToolRun` and the payload is ADS `Plan`. That is what keeps §4's
     * matrix true for this kind: the row opens while the call streams, settles
     * and collapses when it lands, and the collapsed line still carries
     * `done / total`, so the collapse hides no progress.
     */
    case "todo":
      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <ToolRun
            count={planProgressCount(entry.part.input)}
            icon={icon}
            status={toAgentRunState(entry.part.state)}
            title="Plan"
          >
            <TracePlan input={entry.part.input} state={entry.part.state} />
          </ToolRun>
        </StepRail.Step>
      );

    /*
     * A file edit is a tool call's result, so the row is `ToolRun` — the same
     * primitive as every other call on the rail. It used to be the host
     * `ChainOfThoughtStep`, which is the one row anatomy on this surface that
     * puts its chevron on the trailing edge and sizes its glyph in `em`, so the
     * one kind of row a reader scans for most sat 8px left of its neighbours,
     * pointed its chevron the other way, and grew with the message font while
     * they did not. Nothing about a diff asked for that; it was just the row it
     * was built on.
     *
     * The pending/rejected states are reported through `AgentRunState` rather
     * than a local `defaultOpen`: `approval` is what "waiting for accept or
     * reject" is called everywhere else in this family, and `isAttentionState`
     * then keeps exactly those rows open without this call site re-deriving the
     * rule.
     */
    case "diff": {
      const diffStatus: AgentRunState = entry.parts.some(
        (part) => part.status === "pending",
      )
        ? "approval"
        : entry.parts.every((part) => part.status === "rejected")
          ? "denied"
          : "completed";

      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <ToolRun
            /* `+N −M`, already in the diff's own semantic ink. It reads in the
               machine register beside a tool call's "12 matches". */
            count={getDiffSummary(entry.parts)}
            icon={icon}
            status={diffStatus}
            title={
              entry.parts.length === 1
                ? "Changed file"
                : `${entry.parts.length} changed files`
            }
          >
            <ChangedFilesBlock
              parts={entry.parts}
              taskId={taskId}
              messageId={messageId}
            />
          </ToolRun>
        </StepRail.Step>
      );
    }

    /*
     * A human decision, not a tool call: ADS `Approval` owns the status word,
     * the focus hand-off when the pressed button unmounts, and the rule that
     * the decision is preserved in the transcript rather than replaced by it.
     * There is no disclosure — the gate is the payload.
     */
    case "approval":
      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <TraceApproval
            messageId={messageId}
            part={entry.part}
            taskId={taskId}
          />
        </StepRail.Step>
      );

    case "user_input":
      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <TraceClarification
            messageId={messageId}
            part={entry.part}
            taskId={taskId}
          />
        </StepRail.Step>
      );

    case "system": {
      const { title: systemTitle, detail: systemDetail } =
        splitSystemEventContent(entry.part.content);
      const systemContent = entry.part.content.trim();
      const providerErrorNotice = parseProviderErrorNotice(systemContent);
      const isCapacityError = providerErrorNotice?.capacityFailure === true;
      const hasDistinctSystemContent =
        entry.part.compactBoundary != null ||
        systemDetail.length > 0 ||
        isCapacityError;
      const isCompactionCheckpoint = systemContent
        .toLowerCase()
        .startsWith("context compacted");
      const systemBodyPart =
        entry.part.compactBoundary != null ||
        isCompactionCheckpoint ||
        isCapacityError
          ? entry.part
          : { ...entry.part, content: systemDetail };

      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, rowMotionStyle]}
        >
          <TraceSystemNotice
            attention={
              entry.part.compactBoundary != null ||
              isCapacityError ||
              providerErrorNotice != null
            }
            status={providerErrorNotice != null ? "failed" : undefined}
            title={providerErrorNotice?.message ?? systemTitle}
          >
            {hasDistinctSystemContent ? (
              <MessagePartRenderer
                part={systemBodyPart}
                taskId={taskId}
                messageId={messageId}
                terminalStopReason={terminalStopReason}
                systemEventPresentation={isCapacityError ? "detail" : "full"}
              />
            ) : null}
          </TraceSystemNotice>
        </StepRail.Step>
      );
    }
  }
}

function DisplayPartList(args: {
  parts: MessagePart[];
  taskId: string;
  messageId: string;
  isStreaming: boolean;
  terminalStopReason?: string;
  tokenizePromptTokens?: boolean;
}) {
  return (
    <div className={sx(styles.block)}>
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
            terminalStopReason={args.terminalStopReason}
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
    | "terminalStopReason"
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
  const hasActionableCapacityFailure = useMemo(() => {
    const candidateParts =
      message.displayParts && message.displayParts.length > 0
        ? message.displayParts
        : message.parts;
    return candidateParts.some((part) => {
      if (part.type !== "system_event") return false;
      const notice = parseProviderErrorNotice(part.content);
      return notice
        ? isProviderFailureRecoveryEligible({
            notice,
            terminalStopReason: message.terminalStopReason,
          })
        : false;
    });
  }, [message.displayParts, message.parts, message.terminalStopReason]);
  const trace = useMemo(() => buildAssistantTrace({ message }), [message]);

  const summaryItems = useMemo(
    () => buildTraceSummary(trace.entries),
    [trace.entries],
  );
  /* Total reasoning time for the turn, shown next to the collapsed completion
     phrase ("Thought for 12s"). Only meaningful once the turn has finished. */
  const traceDurationSeconds = useMemo(() => {
    if (isStreaming) {
      return undefined;
    }
    const total = trace.entries.reduce(
      (sum, entry) =>
        entry.kind === "reasoning"
          ? sum + (getReasoningDurationSeconds(entry.parts) ?? 0)
          : sum,
      0,
    );
    return total > 0 ? total : undefined;
  }, [isStreaming, trace.entries]);
  const allDiffParts = useMemo<CodeDiffPart[]>(
    () =>
      trace.entries.flatMap((entry) =>
        entry.kind === "diff" ? entry.parts : [],
      ),
    [trace.entries],
  );
  const fileChangeSummaryRows = useMemo(
    () =>
      trace.entries.flatMap((entry) =>
        entry.kind === "tool" &&
        entry.part.toolName.trim().toLowerCase() === "file_change"
          ? parseFileChangeToolInput(entry.part.input)
          : [],
      ),
    [trace.entries],
  );
  const unresolvedFileChangeRows = useMemo(() => {
    const diffPaths = new Set(allDiffParts.map((part) => part.filePath));
    return fileChangeSummaryRows.filter(
      (row) => row.status !== "applied" || !diffPaths.has(row.filePath),
    );
  }, [allDiffParts, fileChangeSummaryRows]);
  const showDiffResults = allDiffParts.length > 0 && !isStreaming;
  const showFileChangeSummary =
    unresolvedFileChangeRows.length > 0 && !isStreaming;

  if (message.displayParts && message.displayParts.length > 0) {
    return (
      <DisplayPartList
        parts={message.displayParts}
        taskId={taskId}
        messageId={messageId}
        isStreaming={isStreaming}
        terminalStopReason={message.terminalStopReason}
        tokenizePromptTokens={message.role === "user"}
      />
    );
  }

  if (
    !trace.showStreamingPlaceholder &&
    trace.entries.length === 0 &&
    trace.responseParts.length === 0 &&
    trace.fileContextParts.length === 0 &&
    trace.imageContextParts.length === 0
  ) {
    return <p className={sx(styles.noResponse)}>No response.</p>;
  }

  return (
    <>
      {trace.showStreamingPlaceholder || trace.entries.length > 0 ? (
        <ChainOfThought
          isStreaming={isStreaming}
          defaultOpen={
            hasActionableCapacityFailure ||
            (shouldAutoExpandTrace && isStreaming)
          }
          openWhen={
            hasActionableCapacityFailure ||
            (shouldAutoExpandTrace && isStreaming)
          }
          collapseWhen={
            !hasActionableCapacityFailure &&
            shouldAutoExpandTrace &&
            !isStreaming
          }
          summaryItems={summaryItems}
          seed={messageId}
          durationSeconds={traceDurationSeconds}
        >
          <ChainOfThoughtTrigger
            completionLabel={
              hasActionableCapacityFailure ? "Run failed" : undefined
            }
          />
          {trace.entries.length > 0 ? (
            <ChainOfThoughtContent>
              {trace.entries.map((entry, index) => (
                <AssistantTraceEntryView
                  key={entry.id}
                  entry={entry}
                  isLast={index === trace.entries.length - 1}
                  taskId={taskId}
                  messageId={messageId}
                  terminalStopReason={message.terminalStopReason}
                />
              ))}
            </ChainOfThoughtContent>
          ) : null}
        </ChainOfThought>
      ) : null}

      {!isStreaming &&
      showInterimMessages &&
      trace.interimTextParts.length > 0 ? (
        <div
          className={sx(
            styles.interim,
            trace.entries.length > 0 && styles.spacedTop,
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
          className={sx(
            styles.block,
            (trace.entries.length > 0 ||
              (showInterimMessages && trace.interimTextParts.length > 0)) &&
              styles.spacedTop,
          )}
        >
          {trace.responseParts.map((part, index) => (
            <MessageResponse
              key={`${messageId}-response-${index}`}
              isStreaming={
                isStreaming && index === trace.responseParts.length - 1
              }
              tokenizePromptTokens={message.role === "user"}
            >
              {part.text}
            </MessageResponse>
          ))}
        </div>
      ) : null}

      {showDiffResults ? (
        <div className={sx(styles.spacedTop)}>
          <ChangedFilesBlock
            parts={allDiffParts}
            taskId={taskId}
            messageId={messageId}
          />
        </div>
      ) : null}

      {showFileChangeSummary ? (
        <div className={sx(styles.spacedTop)}>
          <FileChangeSummaryBlock rows={unresolvedFileChangeRows} />
        </div>
      ) : null}

      {trace.fileContextParts.length > 0 ? (
        <div className={sx(styles.spacedTop)}>
          <ReferencedFilesBlock parts={trace.fileContextParts} />
        </div>
      ) : null}

      {trace.imageContextParts.length > 0 ? (
        <div className={sx(styles.spacedTop)}>
          <ImageAttachmentBlock parts={trace.imageContextParts} />
        </div>
      ) : null}
    </>
  );
}

import { formatSystemEventDisplay } from "../system-event-display";
import { formatProviderErrorDisplay } from "@/lib/providers/error-display";
import { i18n, useTranslation } from "@/i18n";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Bot,
  FileCode2,
  FileText,
  Globe,
  Pencil,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import type { AgentRunState } from "@/components/ads/components/agent-state";
import { StepRail } from "@/components/ads/components/StepRail";
import { ToolRun } from "@/components/ads/components/ToolRun";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtTrigger,
  MessageResponse,
} from "@/components/ai-elements";
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
import { parseInlineRenderToolOutput } from "@/lib/inline-render/inline-render";
import { InlineHtmlRenderList } from "./inline-html-render";
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
import { normalizeTraceToolName } from "./assistant-trace.utils";
import {
  buildAssistantTrace,
  joinReasoningText,
  traceHasDecision,
  traceHasToolStep,
  type AssistantTraceEntry,
} from "./assistant-trace-builder";
import { TraceApproval, TraceClarification } from "./turn-event-decisions";
import { TraceSystemNotice } from "./turn-event-notice";
import { ReasoningRow } from "./turn-event-rows";
import { toMeasuredDurationMs } from "./turn-event-state";
import {
  TRACE_GLYPH_SIZE,
  TraceSubagentRun,
  TraceTodoRun,
  TraceToolRun,
} from "./turn-event-tool-runs";

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
        <span className={sx(styles.diffFiles)}>{parts.length} {i18n.t("session:assistantTrace.getDiffSummary")}</span>
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
    return { title: i18n.t("session:assistantTrace.title"), detail: "" };
  }

  return {
    title: lines[titleIndex]?.trim() || i18n.t("session:assistantTrace.title2"),
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
  readOnly?: boolean;
}) {
  useTranslation();
  const {
    entry,
    isLast,
    taskId,
    messageId,
    terminalStopReason,
    readOnly,
  } = args;

  switch (entry.kind) {
    case "reasoning":
      return (
        <StepRail.Step
          connector={!isLast}
          xstyle={[styles.railStep, styles.rowMotion]}
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
          xstyle={[styles.railStep, styles.rowMotion]}
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

    /* The one tool-call renderer, shared with the display list. */
    case "tool":
      return (
        <StepRail.Step
          connector={!isLast}
          /* Anchor for Turn Activity's "show in conversation" jump. */
          data-tool-use-id={entry.part.toolUseId}
          tabIndex={entry.part.toolUseId ? -1 : undefined}
          xstyle={[styles.railStep, styles.rowMotion]}
        >
          <TraceToolRun part={entry.part} taskId={taskId} />
        </StepRail.Step>
      );

    case "subagent":
      return (
        <StepRail.Step
          connector={!isLast}
          /* Anchor for Turn Activity's "show in conversation" jump. */
          data-tool-use-id={entry.part.toolUseId}
          tabIndex={entry.part.toolUseId ? -1 : undefined}
          xstyle={[styles.railStep, styles.rowMotion]}
        >
          <TraceSubagentRun part={entry.part} />
        </StepRail.Step>
      );

    case "todo":
      return (
        <StepRail.Step
          connector={!isLast}
          /* Anchor for Turn Activity's "show in conversation" jump. */
          data-tool-use-id={entry.part.toolUseId}
          tabIndex={entry.part.toolUseId ? -1 : undefined}
          xstyle={[styles.railStep, styles.rowMotion]}
        >
          <TraceTodoRun part={entry.part} title={entry.title} />
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
          xstyle={[styles.railStep, styles.rowMotion]}
        >
          <ToolRun
            /* `+N −M`, already in the diff's own semantic ink. It reads in the
               machine register beside a tool call's "12 matches". */
            count={getDiffSummary(entry.parts)}
            icon={<FileCode2 size={TRACE_GLYPH_SIZE} />}
            status={diffStatus}
            title={
              entry.parts.length === 1
                ? i18n.t("session:assistantTrace.title3")
                : i18n.t("session:assistantTrace.title4", { value1: entry.parts.length })
            }
          >
            <ChangedFilesBlock
              parts={entry.parts}
              taskId={taskId}
              messageId={messageId}
              readOnly={readOnly}
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
          xstyle={[styles.railStep, styles.rowMotion]}
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
          xstyle={[styles.railStep, styles.rowMotion]}
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
        // i18n-ignore: canonical provider or lifecycle text used for parsing
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
          xstyle={[styles.railStep, styles.rowMotion]}
        >
          <TraceSystemNotice
            attention={
              entry.part.compactBoundary != null ||
              isCapacityError ||
              providerErrorNotice != null
            }
            status={providerErrorNotice != null ? "failed" : undefined}
            title={providerErrorNotice ? formatProviderErrorDisplay(providerErrorNotice.message) : formatSystemEventDisplay(systemTitle)}
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
  useTranslation();
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
  /**
   * A past turn shown outside the live transcript: changed files keep their
   * diff and Open in Editor, without Accept or Reject.
   */
  readOnly?: boolean;
  /** The tool step the transcript is jumping to: its trace opens to show it. */
  revealToolUseId?: string;
  /** The approval or answer the transcript is jumping to, by request id: its trace opens too. */
  revealRequestId?: string;
}) {
  useTranslation();
  const {
    message,
    taskId,
    messageId,
    streamingEnabled,
    traceExpansionMode = "auto",
    showInterimMessages = false,
    readOnly = false,
    revealToolUseId,
    revealRequestId,
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
  const trace = useMemo(() => buildAssistantTrace({ message }), [message, i18n.language]);
  const revealsStep = useMemo(
    () =>
      (revealToolUseId !== undefined && traceHasToolStep(trace.entries, revealToolUseId)) ||
      (revealRequestId !== undefined && traceHasDecision(trace.entries, revealRequestId)),
    [revealRequestId, revealToolUseId, trace.entries],
  );

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
  /*
   * Pages an agent published this turn. They sit outside the collapsible
   * trace, ahead of the reply that refers to them, so a collapsed trace never
   * hides them. Matched by the result's shape, not the tool name.
   */
  const inlineRenders = useMemo(
    () =>
      trace.entries.flatMap((entry) => {
        if (entry.kind !== "tool" || entry.part.state !== "output-available") return [];
        const reference = parseInlineRenderToolOutput(entry.part.output);
        return reference
          ? [{ key: `${entry.id}-${reference.renderId}`, reference, toolInput: entry.part.input }]
          : [];
      }),
    [trace.entries],
  );
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
    return <p className={sx(styles.noResponse)}>{i18n.t("session:assistantTrace.assistantMessageBody")}</p>;
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
            (shouldAutoExpandTrace && isStreaming) ||
            revealsStep
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
              hasActionableCapacityFailure ? i18n.t("session:assistantTrace.completionLabel") : undefined
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
                  readOnly={readOnly}
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

      {inlineRenders.length > 0 ? (
        <InlineHtmlRenderList
          renders={inlineRenders}
          taskId={taskId}
          xstyle={
            (trace.entries.length > 0 ||
              (showInterimMessages && trace.interimTextParts.length > 0)) &&
            styles.spacedTop
          }
        />
      ) : null}

      {trace.responseParts.length > 0 ? (
        <div
          className={sx(
            styles.block,
            (trace.entries.length > 0 ||
              inlineRenders.length > 0 ||
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
            readOnly={readOnly}
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

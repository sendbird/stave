import { i18n, useTranslation } from "@/i18n";
import type { ReactNode } from "react";
import {
  Bot,
  FileText,
  Globe,
  ListTodo,
  Pencil,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import { StaveIcon } from "@/components/brand-icons";
import { ToolRun } from "@/components/ads/components/ToolRun";
import { controlIconSizes } from "@/components/ads/recipes/control-metrics";
import { sx } from "@/components/ads/utils/stylex";
import { parseFileChangeToolInput } from "@/components/session/chat-panel.utils";
import {
  isInlineRenderToolName,
  parseInlineRenderToolOutput,
} from "@/lib/inline-render/inline-render";
import { readMcpAppViewFromToolPart } from "@/lib/mcp-app/mcp-app-view";
import { parseSubagentToolInput } from "@/lib/subagent-tool-input";
import { isStaveToolName } from "@/lib/tool-display-name";
import { parseToolOutputImages } from "@/lib/tool-images/tool-images";
import type { ToolUsePart } from "@/types/chat";
import { assistantTraceStyles as styles } from "./assistant-trace.styles";
import {
  deriveTraceToolSummary,
  getResidualToolInput,
  getToolTitle,
  normalizeTraceToolName,
} from "./assistant-trace.utils";
import { CommandResult } from "./command-result";
import { McpAppView } from "./mcp-app-view";
import { ToolOutputImages } from "./tool-output-images";
import { planProgressCount, TracePlan } from "./turn-event-decisions";
import {
  SubagentProgress,
  TraceCitations,
  TraceOutput,
} from "./turn-event-rows";
import { toAgentRunState, toMeasuredDurationMs } from "./turn-event-state";

/**
 * The one tool-call renderer. A tool call is drawn as an ADS `ToolRun` whether
 * it is a step on the assistant trace or a part of a message's display list,
 * so a call reads the same — title, target, count, measured duration, input,
 * output — wherever it appears. The trace wraps these rows in its step rail;
 * the display list renders them bare.
 */

/**
 * The object glyph's box. `controlIconSizes.md` is what ADS `ToolRun` sizes its
 * own glyph slot to, and passing it explicitly is what keeps a lucide icon from
 * falling back to its 24px default inside the row.
 */
export const TRACE_GLYPH_SIZE = controlIconSizes.md;

export function getToolIcon(toolName: string): ReactNode {
  if (isStaveToolName(toolName)) {
    return <StaveIcon className={sx(styles.glyphEm)} />;
  }

  switch (normalizeTraceToolName(toolName)) {
    case "bash":
      return <Terminal size={TRACE_GLYPH_SIZE} />;
    case "read":
    case "write":
      return <FileText size={TRACE_GLYPH_SIZE} />;
    case "edit":
      return <Pencil size={TRACE_GLYPH_SIZE} />;
    case "glob":
    case "grep":
    /* ACP `search` kind — the canonical name ACP providers map onto. */
    case "search":
      return <Search size={TRACE_GLYPH_SIZE} />;
    case "websearch":
    case "webfetch":
      return <Globe size={TRACE_GLYPH_SIZE} />;
    default:
      return <Wrench size={TRACE_GLYPH_SIZE} />;
  }
}

/** A tool call: command, file, search, web or any other tool. */
export function TraceToolRun(args: {
  part: ToolUsePart;
  taskId: string;
  /** Names the output section (for example while it is still streaming). */
  outputLabel?: ReactNode;
  /** Host content after the result (a live preview the call drives). */
  children?: ReactNode;
}) {
  useTranslation();
  const { part, taskId } = args;
  const normalized = normalizeTraceToolName(part.toolName);
  /*
   * An inline HTML page is shown in full below the trace, so its row names the
   * page and never unpacks the page's markup (up to half a megabyte) into the
   * arguments panel or the header chip.
   */
  const inlineRender = isInlineRenderToolName(part.toolName)
    ? { reference: parseInlineRenderToolOutput(part.output) }
    : null;
  const toolSummary =
    normalized === "file_change"
      ? null
      : inlineRender
        ? inlineRender.reference
          ? { kind: "text" as const, text: inlineRender.reference.title }
          : null
        : deriveTraceToolSummary({
            toolName: part.toolName,
            input: part.input,
          });
  /*
   * The header already carries the command / file / pattern / URL in the
   * machine register, so the raw arguments panel appears only for the
   * arguments the header does not cover. Single-argument tools (Bash, Read,
   * Grep) therefore show their result and not the same string twice.
   */
  const residualInput = inlineRender
    ? null
    : getResidualToolInput({ input: part.input, summary: toolSummary });
  const fileRows =
    normalized === "file_change" ? parseFileChangeToolInput(part.input) : [];
  const isCommand = normalized === "bash";
  const isWeb = normalized === "websearch" || normalized === "webfetch";
  const isError = part.state === "output-error";
  const streamingInput = part.state === "input-streaming";
  // Images come out of the text: a screenshot is a picture, not base64.
  const toolOutput = parseToolOutputImages(part.output);
  const rawOutput = toolOutput.text.trim();
  const output =
    inlineRender?.reference && !isError
      ? i18n.t("session:inlineRender.shownBelow")
      : rawOutput;
  const command =
    toolSummary?.kind === "command" ? toolSummary.text : part.input;
  // A view the runtime captured for this call replaces its text output.
  const mcpAppView = isError ? null : readMcpAppViewFromToolPart(part);

  return (
    <ToolRun
      /* Remounts when a captured view arrives, so the row opens to show it. */
      key={mcpAppView?.viewId ?? "text"}
      count={
        fileRows.length > 0
          ? i18n.t("session:counts.files", { count: fileRows.length })
          : undefined
      }
      /*
       * Measured only. The provider reports `elapsedSeconds` for the calls it
       * timed and omits it for the rest, and ADS renders no duration rather
       * than a plausible one.
       */
      durationMs={toMeasuredDurationMs(part.elapsedSeconds)}
      error={
        isError && !isCommand && output ? (
          <TraceOutput linkify={false} text={output} />
        ) : undefined
      }
      icon={getToolIcon(part.toolName)}
      input={residualInput || undefined}
      defaultOpen={mcpAppView ? true : undefined}
      output={
        mcpAppView ? (
          <McpAppView
            reference={mcpAppView}
            taskId={taskId}
            toolUseId={part.toolUseId}
          />
        ) : !isError && !isCommand && output ? (
          <TraceOutput linkify={!streamingInput} text={output} />
        ) : undefined
      }
      outputLabel={args.outputLabel}
      status={toAgentRunState(part.state)}
      title={getToolTitle(part.toolName)}
      tool={toolSummary?.text}
    >
      {isCommand ? (
        <CommandResult
          command={command}
          isError={isError}
          isStreaming={streamingInput}
          output={part.output}
        />
      ) : null}
      {isWeb && !isError ? <TraceCitations output={part.output} /> : null}
      {toolOutput.images.length > 0 ? (
        <ToolOutputImages images={toolOutput.images} />
      ) : null}
      {args.children}
    </ToolRun>
  );
}

/** A subagent the turn started, with its prompt, progress and report. */
export function TraceSubagentRun(args: { part: ToolUsePart }) {
  useTranslation();
  const { part } = args;
  const parsed = parseSubagentToolInput({ input: part.input });
  const isError = part.state === "output-error";
  const output = part.output?.trim() ?? "";

  return (
    <ToolRun
      durationMs={toMeasuredDurationMs(part.elapsedSeconds)}
      error={
        isError && output ? (
          <TraceOutput linkify={false} text={output} />
        ) : undefined
      }
      icon={<Bot size={TRACE_GLYPH_SIZE} />}
      /* The chip carries only the type, so the prompt is still new information
         and stays visible. */
      input={parsed.prompt ?? parsed.raw}
      inputLabel={i18n.t("session:assistantTrace.inputLabel")}
      output={
        !isError && output ? <TraceOutput prose text={output} /> : undefined
      }
      status={toAgentRunState(part.state)}
      title={
        parsed.description ??
        parsed.subagentType ??
        i18n.t("session:assistantTrace.baseTitle")
      }
      /*
       * The subagent's own machine identity goes in the `tool` slot: its type,
       * a value the runtime reported, not language the agent wrote.
       */
      tool={parsed.subagentType}
    >
      <SubagentProgress messages={part.progressMessages ?? []} />
    </ToolRun>
  );
}

/**
 * A plan revision. TodoWrite genuinely is a tool call, so the row is `ToolRun`
 * and the payload is ADS `Plan`: the row opens while the call streams, settles
 * and collapses when it lands, and the collapsed line still carries
 * `done / total`, so the collapse hides no progress.
 */
export function TraceTodoRun(args: { part: ToolUsePart; title: string }) {
  useTranslation();
  const { part } = args;
  return (
    <ToolRun
      count={planProgressCount(part.input)}
      icon={<ListTodo size={TRACE_GLYPH_SIZE} />}
      status={toAgentRunState(part.state)}
      title={args.title}
    >
      <TracePlan input={part.input} state={part.state} />
    </ToolRun>
  );
}

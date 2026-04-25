import {
  getRenderableMessageParts,
  isCodeDiffSummarySystemEvent,
  isSubagentProgressSystemEvent,
  isSubagentToolPart,
  isTodoToolPart,
} from "@/components/session/chat-panel.utils";
import { getAssistantResponseTextStartIndex } from "@/lib/session/assistant-response-parts";
import type {
  ApprovalPart,
  ChatMessage,
  CodeDiffPart,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  OrchestrationProgressPart,
  StaveProcessingPart,
  SystemEventPart,
  TextPart,
  ThinkingPart,
  ToolUsePart,
  UserInputPart,
} from "@/types/chat";

/**
 * Heuristic: short filler phrases Claude emits mid-turn that add no user-visible
 * information.  Case-insensitive prefix match keeps the list maintainable.
 */
const INTERIM_NOISE_PREFIXES = [
  "now i have",
  "now i'll",
  "now let me",
  "let me ",
  "i'll now ",
  "i now have",
  "i have full context",
  "i have the full context",
  "i have all the context",
  "i have enough context",
  "perfect, ",
  "perfect! ",
  "great, ",
  "great! ",
  "got it",
  "understood",
  "i see",
  "i understand",
];

function isInterimNoise(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length < 3) return true;
  return INTERIM_NOISE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export type AssistantTraceEntry =
  | { kind: "reasoning"; id: string; parts: ThinkingPart[]; isStreaming: boolean }
  | { kind: "assistant_text"; id: string; parts: TextPart[] }
  | { kind: "tool"; id: string; part: ToolUsePart }
  | { kind: "subagent"; id: string; part: ToolUsePart }
  | { kind: "todo"; id: string; part: ToolUsePart }
  | { kind: "approval"; id: string; part: ApprovalPart }
  | { kind: "user_input"; id: string; part: UserInputPart }
  | { kind: "diff"; id: string; parts: CodeDiffPart[] }
  | { kind: "system"; id: string; part: SystemEventPart }
  | { kind: "orchestration"; id: string; part: OrchestrationProgressPart }
  | { kind: "stave_processing"; id: string; part: StaveProcessingPart };

export interface AssistantTraceData {
  entries: AssistantTraceEntry[];
  /** Interim text parts that appeared *between* tool calls (before response boundary). */
  interimTextParts: TextPart[];
  responseParts: TextPart[];
  fileContextParts: FileContextPart[];
  imageContextParts: ImageContextPart[];
  showStreamingPlaceholder: boolean;
}

function shouldIncludeSystemEvent(part: SystemEventPart) {
  const normalized = part.content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (isCodeDiffSummarySystemEvent(part.content)) {
    return false;
  }
  if (normalized.startsWith("sending request to model")) {
    return false;
  }
  return !isSubagentProgressSystemEvent(part.content);
}

export function buildAssistantTrace(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isStreaming">;
}): AssistantTraceData {
  const renderableParts = getRenderableMessageParts({
    content: args.message.content,
    parts: args.message.parts,
  });
  const responseStartIndex = getAssistantResponseTextStartIndex(renderableParts);

  const entries: AssistantTraceEntry[] = [];
  const interimTextParts: TextPart[] = [];
  const responseParts: TextPart[] = [];
  const fileContextParts: FileContextPart[] = [];
  const imageContextParts: ImageContextPart[] = [];

  renderableParts.forEach((part, index) => {
    switch (part.type) {
      case "text":
        if (!part.text.trim()) {
          return;
        }
        if (responseStartIndex !== -1 && index >= responseStartIndex) {
          responseParts.push(part);
          return;
        }
        /* Collect non-noise interim text for surfacing outside the CoT. */
        if (!isInterimNoise(part.text)) {
          interimTextParts.push(part);
        }
        {
          const previous = entries.at(-1);
          if (previous?.kind === "assistant_text") {
            previous.parts.push(part);
            return;
          }
        }
        entries.push({
          kind: "assistant_text",
          id: `assistant-text-${index}`,
          parts: [part],
        });
        return;
      case "thinking": {
        const previous = entries.at(-1);
        if (previous?.kind === "reasoning") {
          previous.parts.push(part);
          previous.isStreaming = part.isStreaming;
          return;
        }
        entries.push({
          kind: "reasoning",
          id: `reasoning-${index}`,
          parts: [part],
          isStreaming: part.isStreaming,
        });
        return;
      }
      case "tool_use":
        entries.push({
          kind: isSubagentToolPart({ toolName: part.toolName })
            ? "subagent"
            : isTodoToolPart({ toolName: part.toolName })
            ? "todo"
            : "tool",
          id: `tool-${index}`,
          part,
        });
        return;
      case "approval":
        entries.push({ kind: "approval", id: `approval-${index}`, part });
        return;
      case "user_input":
        entries.push({ kind: "user_input", id: `user-input-${index}`, part });
        return;
      case "code_diff": {
        const previous = entries.at(-1);
        if (previous?.kind === "diff") {
          previous.parts.push(part);
          return;
        }
        entries.push({ kind: "diff", id: `diff-${index}`, parts: [part] });
        return;
      }
      case "system_event":
        if (shouldIncludeSystemEvent(part)) {
          entries.push({ kind: "system", id: `system-${index}`, part });
        }
        return;
      case "orchestration_progress":
        entries.push({ kind: "orchestration", id: `orchestration-${index}`, part });
        return;
      case "stave_processing":
        entries.push({ kind: "stave_processing", id: `stave-processing-${index}`, part });
        return;
      case "file_context":
        fileContextParts.push(part);
        return;
      case "image_context":
        imageContextParts.push(part);
        return;
    }
  });

  return {
    entries,
    interimTextParts,
    responseParts,
    fileContextParts,
    imageContextParts,
    showStreamingPlaceholder: Boolean(args.message.isStreaming) && entries.length === 0 && responseParts.length === 0,
  };
}

export function joinReasoningText(parts: ThinkingPart[]) {
  return parts.map((part) => part.text).join("");
}

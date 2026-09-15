import type { ChatMessage, MessagePart, ToolUsePart } from "@/types/chat";
export interface AdvisorTranscriptExchange {
  id: string;
  /** Present for in-memory rows only; saved-history rows cannot be revealed. */
  toolUseId?: string;
  question: string;
  answer: string;
  state: string;
  /** Message start time in ms, when the transcript recorded one. */
  at?: number;
}

function parseMessageMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function missingAdvisorAnswer(state: string): string {
  if (state === "output-error") {
    return "Advisor response failed before an answer was captured.";
  }
  if (state !== "output-available") {
    return "Advisor response is still in progress.";
  }
  return "No answer captured.";
}

const ADVISOR_TOOL_NAME_PATTERN = /(?:^|__|\.)stave_consult_advisor$/;

/** True for the Local MCP consult tool under any server prefix. */
export function isAdvisorToolName(toolName: string): boolean {
  return ADVISOR_TOOL_NAME_PATTERN.test(toolName);
}

export function isAdvisorTranscriptToolPart(
  part: MessagePart,
): part is ToolUsePart {
  return part.type === "tool_use" && isAdvisorToolName(part.toolName);
}

/** The question the primary asked, or a safe placeholder for partial input. */
export function parseAdvisorToolQuestion(input: string): string {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "question" in parsed &&
      typeof parsed.question === "string"
    ) {
      return parsed.question.slice(0, 8000);
    }
  } catch {
    /* Never show incomplete raw input containing a consult grant. */
  }
  return "Original question unavailable.";
}

/** The advice text out of the consult tool result, whatever envelope it wore. */
export function parseAdvisorToolAnswer(args: {
  output: string | undefined;
  state: string;
}): string {
  let answer = args.output?.trim() || missingAdvisorAnswer(args.state);
  try {
    const parsed = JSON.parse(answer) as {
      consult?: { advice?: unknown; message?: unknown; error?: unknown };
      advice?: unknown;
      message?: unknown;
      error?: unknown;
    };
    const result = parsed?.consult ?? parsed;
    const text = result?.advice ?? result?.message ?? result?.error;
    if (typeof text === "string") answer = text;
  } catch {
    /* Provider may already report plain text. */
  }
  return answer.slice(0, 12000);
}

/** Recover user-visible exchanges from the canonical transcript after restart. */
export function selectAdvisorTranscriptExchanges(
  messages: readonly ChatMessage[],
  maxExchanges = 24,
): AdvisorTranscriptExchange[] {
  const rows: AdvisorTranscriptExchange[] = [];
  for (
    let i = messages.length - 1;
    i >= 0 && rows.length < maxExchanges;
    i--
  ) {
    const message = messages[i]!;
    const at = parseMessageMs(message.startedAt);
    for (
      let j = message.parts.length - 1;
      j >= 0 && rows.length < maxExchanges;
      j--
    ) {
      const part = message.parts[j]!;
      if (!isAdvisorTranscriptToolPart(part)) continue;
      rows.push({
        id: `${message.id}:${part.toolUseId ?? j}`,
        ...(part.toolUseId ? { toolUseId: part.toolUseId } : {}),
        question: parseAdvisorToolQuestion(part.input),
        answer: parseAdvisorToolAnswer({
          output: part.output,
          state: part.state,
        }),
        state: part.state,
        ...(at !== undefined ? { at } : {}),
      });
    }
  }
  return rows;
}
